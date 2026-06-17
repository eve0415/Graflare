import type { AlertEmailData } from './templates/alert-email';
import type { ContactPointSettings, LabelMatcher } from '@graflare/shared/schemas/alerting';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

import { buildDiscordPayload } from '@graflare/shared/alerting/discord-payload';
import { matchLabels } from '@graflare/shared/alerting/matchers';
import { isMuted } from '@graflare/shared/alerting/mute-check';
import { buildSlackPayload } from '@graflare/shared/alerting/slack-payload';
import { buildWebhookPayload } from '@graflare/shared/alerting/webhook-payload';
import { chunkRowsForD1 } from '@graflare/shared/db/chunk-rows';
import { contactPointSettingsSchema, labelMatchersSchema, labelsMapSchema, muteTimeIntervalsSchema, stringListSchema } from '@graflare/shared/schemas/alerting';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import { and, eq, gt, inArray, lte, sql } from 'drizzle-orm';

import { decryptCredentials } from '../crypto/credentials';
import { createDb } from '../db';
import { alertInstances, annotations, contactPoints, muteTimings, notificationPolicies, silences } from '../db/schema';

import { renderAlertEmailHtml, renderAlertEmailText } from './templates/alert-email';

/** Validate an already-parsed value against a zod schema, falling back to a default on any error. */
const parseValue = <T>(schema: { parse: (value: unknown) => T }, value: unknown, fallback: T): T => {
  try {
    return schema.parse(value);
  } catch {
    return fallback;
  }
};

// The annotations insert binds one row of this many columns per alert; chunkRowsForD1 keeps a
// multi-row insert under D1's 100-bound-parameter ceiling and drift-guards this count against the
// row shape (a rule firing across many series collapses to one group, so the row count is unbounded).
const ANNOTATION_INSERT_COLUMNS = 9;

interface NotificationWorkflowParams {
  orgId: string;
  ruleId: string;
  ruleName: string;
  ruleLabels: Record<string, string>;
  ruleAnnotations: Record<string, string>;
  externalURL: string;
}

interface Env {
  DB: D1Database;
  ENCRYPTION_KEY: string;
  EMAIL: SendEmail;
}

/** A firing/resolved alert instance drained from D1, with its own per-series labels. */
interface DrainedAlert {
  labelsHash: string;
  labels: Record<string, string>;
  state: string;
  value: string;
  activeAt: number | null;
}

/**
 * One notification-policy node, normalised for the in-memory tree walk. Mirrors the
 * Grafana model: a tree of label matchers where each alert instance is routed top-down
 * by its full (merged) label set, the deepest matching node wins, and `continue` lets
 * sibling nodes also handle the instance.
 */
interface PolicyNode {
  id: string;
  parentId: string | null;
  contactPointId: string | null;
  groupBy: string[];
  matchers: LabelMatcher[];
  muteTimingIds: string[];
  groupWaitS: number;
  continueMatching: boolean;
  children: PolicyNode[];
}

/**
 * The routing settings an instance resolves to: which contact point receives it and the
 * grouping/timing knobs of the deepest matching policy. `contactPointId`/`groupBy` are
 * already inherited from the nearest ancestor that defines them (Grafana inheritance).
 */
interface ResolvedRoute {
  contactPointId: string;
  groupBy: string[];
  muteTimingIds: string[];
  groupWaitS: number;
}

/** A bucket of instances that route to the same contact point and share the same group_by label values. */
interface NotificationGroup {
  key: string;
  route: ResolvedRoute;
  alerts: DrainedAlert[];
}

interface PolicyRow {
  id: string;
  parentId: string | null;
  contactPointId: string | null;
  groupBy: unknown;
  matchers: unknown;
  muteTimingIds: unknown;
  groupWaitS: number;
  continueMatching: boolean;
}

/** Build the policy forest from flat rows, linking children to parents. Returns the root (parentId === null). */
const buildPolicyTree = (rows: PolicyRow[]): PolicyNode | null => {
  const nodes = new Map<string, PolicyNode>();
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      parentId: row.parentId,
      contactPointId: row.contactPointId,
      groupBy: parseValue(stringListSchema, row.groupBy, ['alertname']),
      matchers: parseValue(labelMatchersSchema, row.matchers, []),
      muteTimingIds: parseValue(stringListSchema, row.muteTimingIds, []),
      groupWaitS: row.groupWaitS,
      continueMatching: row.continueMatching,
      children: [],
    });
  }

  // A node is "top-level" when it has no parent (parentId === null) or its parent is missing
  // (orphaned — deleted, or in another org). The UI exposes a "Root (default policy)" parent
  // option that sets parentId === null, so an org legitimately has SEVERAL top-level policies.
  // The first becomes the canonical root; the rest attach under it so their subtrees still
  // route. (Previously only the first was kept and every other top-level subtree was silently
  // dropped, so alerts matching only those policies were never delivered.)
  let root: PolicyNode | null = null;
  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    if (parent !== undefined) {
      parent.children.push(node);
      continue;
    }
    if (root === null) {
      root = node;
    } else {
      root.children.push(node);
    }
  }
  return root;
};

/**
 * Walk the policy tree for one instance's merged label set, Grafana-style:
 * - The root matches everything; evaluate its children in order.
 * - The first matching child recurses (deepest match wins); a node with `continue`
 *   also lets its remaining siblings match, so one instance can yield several routes.
 * - A matched node inherits the nearest ancestor's contact point / group_by when its own
 *   is unset, so a child that only narrows timing still delivers somewhere.
 * Returns every terminal route the instance resolves to (deduplicated by contact point).
 */
const resolveRoutes = (root: PolicyNode, labels: Record<string, string>): ResolvedRoute[] => {
  const routes: ResolvedRoute[] = [];

  const visit = (node: PolicyNode, inheritedContactPointId: string | null, inheritedGroupBy: string[]): void => {
    const contactPointId = node.contactPointId ?? inheritedContactPointId;
    const groupBy = node.contactPointId !== null || node.parentId === null ? node.groupBy : inheritedGroupBy;

    const matchingChildren = node.children.filter(child => matchLabels(child.matchers, labels));

    if (matchingChildren.length === 0) {
      // Terminal: this node handles the instance. Drop it only if no contact point resolves.
      if (contactPointId !== null) {
        routes.push({ contactPointId, groupBy, muteTimingIds: node.muteTimingIds, groupWaitS: node.groupWaitS });
      }
      return;
    }

    for (const child of matchingChildren) {
      visit(child, contactPointId, groupBy);
      if (!child.continueMatching) break;
    }
  };

  visit(root, null, root.groupBy);

  // Dedupe identical contact-point routes so a `continue` cascade that converges on the
  // same receiver doesn't double-notify.
  const seen = new Set<string>();
  return routes.filter(route => {
    if (seen.has(route.contactPointId)) return false;
    seen.add(route.contactPointId);
    return true;
  });
};

/** Stable group key: same receiver + same group_by label values ⇒ same notification. Empty group_by ⇒ one group per receiver. */
const groupKeyFor = (route: ResolvedRoute, labels: Record<string, string>): string => {
  const labelPairs = route.groupBy
    .slice()
    .sort()
    .map(name => `${name}=${labels[name] ?? ''}`);
  return JSON.stringify([route.contactPointId, labelPairs]);
};

export class NotificationWorkflow extends WorkflowEntrypoint<Env, NotificationWorkflowParams> {
  override async run(event: Readonly<WorkflowEvent<NotificationWorkflowParams>>, step: WorkflowStep): Promise<void> {
    const params = event.payload;
    const db = createDb(this.env.DB);

    // The whole org's policy tree — routing is now per instance, so we resolve against the
    // full set of policies rather than matching once by rule labels.
    const policyRoot = await step.do<PolicyNode | null>('load-policies', async () => {
      const rows = await db
        .select({
          id: notificationPolicies.id,
          parentId: notificationPolicies.parentId,
          contactPointId: notificationPolicies.contactPointId,
          groupBy: notificationPolicies.groupBy,
          matchers: notificationPolicies.matchers,
          muteTimingIds: notificationPolicies.muteTimingIds,
          groupWaitS: notificationPolicies.groupWaitS,
          continueMatching: notificationPolicies.continueMatching,
        })
        .from(notificationPolicies)
        .where(eq(notificationPolicies.orgId, params.orgId))
        .orderBy(sql`${notificationPolicies.parentId} nulls first`);

      return buildPolicyTree(rows);
    });

    if (policyRoot === null) return;

    const alerts = await step.do<DrainedAlert[]>('drain-alerts', async () => {
      const rows = await db
        .select({
          labelsHash: alertInstances.labelsHash,
          labels: alertInstances.labels,
          state: alertInstances.state,
          value: alertInstances.value,
          activeAt: alertInstances.activeAt,
        })
        .from(alertInstances)
        .where(and(eq(alertInstances.orgId, params.orgId), eq(alertInstances.ruleId, params.ruleId), inArray(alertInstances.state, ['Firing', 'Resolved'])));

      return rows.map(r => ({
        labelsHash: r.labelsHash,
        labels: parseValue(labelsMapSchema, r.labels, {}),
        state: r.state,
        value: r.value,
        activeAt: r.activeAt === null ? null : r.activeAt.getTime(),
      }));
    });

    if (alerts.length === 0) return;

    // Silences filter per instance on the merged (rule + instance) label set — unchanged.
    const filteredAlerts = await step.do<DrainedAlert[]>('check-silences', async () => {
      const now = new Date();
      const silenceRows = await db
        .select({ matchers: silences.matchers })
        .from(silences)
        .where(and(eq(silences.orgId, params.orgId), lte(silences.startsAt, now), gt(silences.endsAt, now)));

      const silenceMatchers = silenceRows.map(r => parseValue(labelMatchersSchema, r.matchers, []));

      return alerts.filter(a => {
        const allLabels = { ...params.ruleLabels, ...a.labels };
        return !silenceMatchers.some(matchers => matchLabels(matchers, allLabels));
      });
    });

    if (filteredAlerts.length === 0) return;

    // Route each surviving instance through the tree by its merged labels, then bucket into
    // notification groups (receiver + group_by values). Pure in-memory — no workflow step.
    const groups = new Map<string, NotificationGroup>();
    for (const alert of filteredAlerts) {
      const merged = { ...params.ruleLabels, ...alert.labels };
      for (const route of resolveRoutes(policyRoot, merged)) {
        const key = groupKeyFor(route, merged);
        const existing = groups.get(key);
        if (existing === undefined) {
          groups.set(key, { key, route, alerts: [alert] });
        } else {
          existing.alerts.push(alert);
        }
      }
    }

    // Iterate groups in sorted key order so each per-group step name is deterministic across
    // Workflow replays (the engine memoizes step results by name — collisions would hand one
    // group another's cached output). The key already encodes the receiver + group_by values.
    const orderedGroups = [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    for (const group of orderedGroups) {
      await this.deliverGroup(step, db, params, group);
    }
  }

  /**
   * Mute-check → group-wait → load contact point → deliver → annotate, for one notification
   * group. group_interval / repeat_interval are deferred: this workflow is single-shot per DO
   * trigger with no cross-invocation state, and the per-instance `last_notified_at` stamp in
   * AlertRuleDO is the existing re-notify throttle. Only group_wait is honoured here.
   */
  private async deliverGroup(step: WorkflowStep, db: ReturnType<typeof createDb>, params: NotificationWorkflowParams, group: NotificationGroup): Promise<void> {
    const { route, key } = group;

    // Mute timings are a property of the routed policy (a scheduled window), evaluated per
    // group — distinct from silences, which match per instance by label above.
    const shouldDeliver = await step.do<boolean>(`check-mute-timings:${key}`, async () => {
      if (route.muteTimingIds.length === 0) return true;
      const muteRows = await db
        .select({ intervals: muteTimings.intervals })
        .from(muteTimings)
        .where(and(eq(muteTimings.orgId, params.orgId), inArray(muteTimings.id, route.muteTimingIds)));
      const now = new Date();
      return !muteRows.some(r => isMuted(parseValue(muteTimeIntervalsSchema, r.intervals, []), now));
    });

    if (!shouldDeliver) return;

    if (route.groupWaitS > 0) {
      await step.sleep(`group-wait:${key}`, `${route.groupWaitS} seconds`);
    }

    const contactPoint = await step.do<{ name: string; settings: ContactPointSettings } | null>(`load-contact-point:${key}`, async () => {
      const rows = await db
        .select({ name: contactPoints.name, settings: contactPoints.settings })
        .from(contactPoints)
        .where(and(eq(contactPoints.orgId, params.orgId), eq(contactPoints.id, route.contactPointId)));

      const [row] = rows;
      if (row === undefined) return null;
      const settings = parseValue<ContactPointSettings | null>(contactPointSettingsSchema, row.settings, null);
      if (settings === null) return null;
      return { name: row.name, settings };
    });

    if (contactPoint === null) return;

    const { settings } = contactPoint;
    const groupAlerts = group.alerts;

    await step.do(`deliver:${key}`, { retries: { limit: 5, delay: '10 seconds', backoff: 'exponential' } }, async () => {
      // Shared payload shape for the HTTP-based receivers (webhook/slack/discord).
      const payloadAlerts = groupAlerts.map(a => ({
        state: a.state,
        labels: { ...params.ruleLabels, ...a.labels },
        annotations: params.ruleAnnotations,
        value: a.value,
        activeAt: a.activeAt,
        fingerprint: a.labelsHash,
        generatorURL: `${params.externalURL}/alerting/rules`,
      }));

      const encryptionKey = this.env.ENCRYPTION_KEY;

      switch (settings.type) {
        case 'webhook': {
          const payload = buildWebhookPayload(payloadAlerts, contactPoint.name, params.externalURL);

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };

          if (settings.password.length > 0) {
            const decryptedPass = await decryptCredentials(settings.password, encryptionKey);
            headers['Authorization'] = `Basic ${btoa(`${settings.username}:${decryptedPass}`)}`;
          }

          const res = await fetch(settings.url, { method: settings.method, headers, body: JSON.stringify(payload) });
          if (!res.ok) {
            throw new Error(`Webhook delivery failed: ${res.status}`);
          }
          return;
        }

        case 'slack': {
          if (settings.webhookUrl.length === 0) return;
          const url = await decryptCredentials(settings.webhookUrl, encryptionKey);
          const payload = buildSlackPayload(payloadAlerts, contactPoint.name, params.externalURL, {
            channel: settings.channel,
            username: settings.username,
          });

          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!res.ok) {
            throw new Error(`Slack delivery failed: ${res.status}`);
          }
          return;
        }

        case 'discord': {
          if (settings.webhookUrl.length === 0) return;
          const url = await decryptCredentials(settings.webhookUrl, encryptionKey);
          const payload = buildDiscordPayload(payloadAlerts, contactPoint.name, params.externalURL, {
            username: settings.username,
            avatarUrl: settings.avatarUrl,
          });

          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!res.ok) {
            throw new Error(`Discord delivery failed: ${res.status}`);
          }
          return;
        }

        case 'email': {
          if (settings.addresses.length === 0) return;

          const emailAlerts: AlertEmailData[] = groupAlerts.map(a => ({
            ruleName: params.ruleName,
            state: a.state === 'Firing' ? 'Firing' : 'Resolved',
            labels: { ...params.ruleLabels, ...a.labels },
            value: a.value,
            startsAt: a.activeAt === null ? 'N/A' : new Date(a.activeAt).toISOString(),
            externalURL: params.externalURL,
          }));

          const html = renderAlertEmailHtml(emailAlerts);
          const text = renderAlertEmailText(emailAlerts);
          const hasFiring = groupAlerts.some(a => a.state === 'Firing');
          const subject = `[${hasFiring ? 'FIRING' : 'RESOLVED'}] ${params.ruleName}`;

          await this.env.EMAIL.send({
            to: settings.addresses,
            from: { email: 'alerts@graflare.dev', name: 'Graflare Alerts' },
            subject,
            html,
            text,
          });
          return;
        }

        default: {
          // Exhaustiveness guard: a new contact-point type must add a branch above.
          const _exhaustive: never = settings;
          throw new Error(`Unsupported contact point type: ${JSON.stringify(_exhaustive)}`);
        }
      }
    });

    await step.do(`create-annotations:${key}`, async () => {
      if (groupAlerts.length === 0) return;
      const now = new Date();
      const rows = groupAlerts.map(a => ({
        id: crypto.randomUUID(),
        orgId: params.orgId,
        alertRuleId: params.ruleId,
        time: now,
        text: `${params.ruleName}: ${a.state}`,
        tags: ['alert'],
        prevState: a.state === 'Firing' ? 'Normal' : 'Firing',
        newState: a.state,
        createdAt: now,
      }));
      // Chunk under D1's bound-parameter ceiling: an unbounded group (rule × many series) would
      // otherwise bind rows×9 params in one statement and be rejected whole, losing every annotation.
      for (const chunk of chunkRowsForD1(rows, ANNOTATION_INSERT_COLUMNS)) {
        await db.insert(annotations).values(chunk);
      }
    });
  }
}

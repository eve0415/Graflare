import type { AlertEmailData } from './templates/alert-email';
import type { ContactPointSettings } from '@graflare/shared/schemas/alerting';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

import { matchLabels } from '@graflare/shared/alerting/matchers';
import { isMuted } from '@graflare/shared/alerting/mute-check';
import { buildWebhookPayload } from '@graflare/shared/alerting/webhook-payload';
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

export class NotificationWorkflow extends WorkflowEntrypoint<Env, NotificationWorkflowParams> {
  override async run(event: Readonly<WorkflowEvent<NotificationWorkflowParams>>, step: WorkflowStep): Promise<void> {
    const params = event.payload;
    const db = createDb(this.env.DB);

    const policy = await step.do<{ contactPointId: string | null; groupWaitS: number; muteTimingIds: string[] }>('resolve-policy', async () => {
      const policies = await db
        .select()
        .from(notificationPolicies)
        .where(eq(notificationPolicies.orgId, params.orgId))
        .orderBy(sql`${notificationPolicies.parentId} nulls first`);

      let matched = policies.find(p => p.parentId === null) ?? null;

      for (const p of policies) {
        if (p.parentId === null) continue;
        const matchers = parseValue(labelMatchersSchema, p.matchers, []);
        if (matchers.length > 0 && matchLabels(matchers, params.ruleLabels)) {
          matched = p;
          if (!p.continueMatching) break;
        }
      }

      if (matched === null) {
        return { contactPointId: null, groupWaitS: 30, muteTimingIds: [] };
      }

      return {
        contactPointId: matched.contactPointId,
        groupWaitS: matched.groupWaitS,
        muteTimingIds: parseValue(stringListSchema, matched.muteTimingIds, []),
      };
    });

    if (policy.contactPointId === null) return;
    const { contactPointId } = policy;

    if (policy.groupWaitS > 0) {
      await step.sleep('group-wait', `${policy.groupWaitS} seconds`);
    }

    const alerts = await step.do<{ labelsHash: string; labels: Record<string, string>; state: string; value: string; activeAt: number | null }[]>(
      'drain-alerts',
      async () => {
        const rows = await db
          .select({
            labelsHash: alertInstances.labelsHash,
            labels: alertInstances.labels,
            state: alertInstances.state,
            value: alertInstances.value,
            activeAt: alertInstances.activeAt,
          })
          .from(alertInstances)
          .where(and(eq(alertInstances.ruleId, params.ruleId), inArray(alertInstances.state, ['Firing', 'Resolved'])));

        return rows.map(r => ({
          labelsHash: r.labelsHash,
          labels: parseValue(labelsMapSchema, r.labels, {}),
          state: r.state,
          value: r.value,
          activeAt: r.activeAt === null ? null : r.activeAt.getTime(),
        }));
      },
    );

    if (alerts.length === 0) return;

    const filteredAlerts = await step.do<typeof alerts>('check-silences', async () => {
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

    const shouldDeliver = await step.do<boolean>('check-mute-timings', async () => {
      if (policy.muteTimingIds.length === 0) return true;

      const muteRows = await db.select({ intervals: muteTimings.intervals }).from(muteTimings).where(inArray(muteTimings.id, policy.muteTimingIds));

      const now = new Date();
      return !muteRows.some(r => isMuted(parseValue(muteTimeIntervalsSchema, r.intervals, []), now));
    });

    if (!shouldDeliver) return;

    const contactPoint = await step.do<{ name: string; settings: ContactPointSettings } | null>('load-contact-point', async () => {
      const rows = await db
        .select({ name: contactPoints.name, settings: contactPoints.settings })
        .from(contactPoints)
        .where(eq(contactPoints.id, contactPointId));

      const [row] = rows;
      if (row === undefined) return null;
      const settings = parseValue<ContactPointSettings | null>(contactPointSettingsSchema, row.settings, null);
      if (settings === null) return null;
      return { name: row.name, settings };
    });

    if (contactPoint === null) return;

    const { settings } = contactPoint;

    await step.do('deliver', { retries: { limit: 5, delay: '10 seconds', backoff: 'exponential' } }, async () => {
      if (settings.type === 'webhook') {
        const payloadAlerts = filteredAlerts.map(a => ({
          state: a.state,
          labels: { ...params.ruleLabels, ...a.labels },
          annotations: params.ruleAnnotations,
          value: a.value,
          activeAt: a.activeAt,
          fingerprint: a.labelsHash,
          generatorURL: `${params.externalURL}/alerting/rules`,
        }));

        const payload = buildWebhookPayload(payloadAlerts, contactPoint.name, params.externalURL);

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        if (settings.password.length > 0) {
          const decryptedPass = await decryptCredentials(settings.password, this.env.ENCRYPTION_KEY);
          headers['Authorization'] = `Basic ${btoa(`${settings.username}:${decryptedPass}`)}`;
        }

        const res = await fetch(settings.url, { method: settings.method, headers, body: JSON.stringify(payload) });
        if (!res.ok) {
          throw new Error(`Webhook delivery failed: ${res.status}`);
        }
      } else {
        if (settings.addresses.length === 0) return;

        const emailAlerts: AlertEmailData[] = filteredAlerts.map(a => ({
          ruleName: params.ruleName,
          state: a.state === 'Firing' ? 'Firing' : 'Resolved',
          labels: { ...params.ruleLabels, ...a.labels },
          value: a.value,
          startsAt: a.activeAt === null ? 'N/A' : new Date(a.activeAt).toISOString(),
          externalURL: params.externalURL,
        }));

        const html = renderAlertEmailHtml(emailAlerts);
        const text = renderAlertEmailText(emailAlerts);
        const hasFiring = filteredAlerts.some(a => a.state === 'Firing');
        const subject = `[${hasFiring ? 'FIRING' : 'RESOLVED'}] ${params.ruleName}`;

        await this.env.EMAIL.send({
          to: settings.addresses,
          from: { email: 'alerts@graflare.dev', name: 'Graflare Alerts' },
          subject,
          html,
          text,
        });
      }
    });

    await step.do('create-annotations', async () => {
      if (filteredAlerts.length === 0) return;
      const now = new Date();
      const rows = filteredAlerts.map(a => ({
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
      await db.insert(annotations).values(rows);
    });
  }
}

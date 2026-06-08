import type { ContactPointSettings } from '@graflare/shared/schemas/alerting';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import type { AlertEmailData } from './templates/alert-email';

import { isMuted } from '@graflare/shared/alerting/mute-check';
import { matchLabels } from '@graflare/shared/alerting/matchers';
import { buildWebhookPayload } from '@graflare/shared/alerting/webhook-payload';
import { contactPointSettingsSchema, labelMatchersSchema, labelsMapSchema, muteTimeIntervalsSchema, stringListSchema } from '@graflare/shared/schemas/alerting';
import { WorkflowEntrypoint } from 'cloudflare:workers';

import { decryptCredentials } from '../crypto/credentials';

import { renderAlertEmailHtml, renderAlertEmailText } from './templates/alert-email';

/** Parse a JSON string against a zod schema, falling back to a default on any error. */
const parseJson = <T>(schema: { parse: (value: unknown) => T }, raw: string, fallback: T): T => {
  try {
    return schema.parse(JSON.parse(raw));
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

interface PolicyRow {
  id: string;
  parent_id: string | null;
  contact_point_id: string | null;
  group_by: string;
  matchers: string;
  mute_timing_ids: string;
  group_wait_s: number;
  group_interval_s: number;
  repeat_interval_s: number;
  continue_matching: number;
}

interface ContactPointRow {
  id: string;
  name: string;
  type: string;
  settings: string;
}

interface InstanceRow {
  labels_hash: string;
  labels: string;
  state: string;
  value: string;
  active_at: number | null;
}

interface MuteTimingRow {
  id: string;
  intervals: string;
}

interface SilenceRow {
  matchers: string;
}

interface Env {
  DB: D1Database;
  ENCRYPTION_KEY: string;
  EMAIL: SendEmail;
}

export class NotificationWorkflow extends WorkflowEntrypoint<Env, NotificationWorkflowParams> {
  override async run(event: Readonly<WorkflowEvent<NotificationWorkflowParams>>, step: WorkflowStep): Promise<void> {
    const params = event.payload;

    const policy = await step.do<{ contactPointId: string | null; groupWaitS: number; muteTimingIds: string[] }>('resolve-policy', async () => {
      const rows = await this.env.DB.prepare('SELECT * FROM notification_policies WHERE org_id = ? ORDER BY parent_id NULLS FIRST')
        .bind(params.orgId)
        .all<PolicyRow>();

      const policies = rows.results;
      let matched = policies.find(p => p.parent_id === null) ?? null;

      for (const p of policies) {
        if (p.parent_id === null) continue;
        const matchers = parseJson(labelMatchersSchema, p.matchers, []);
        if (matchers.length > 0 && matchLabels(matchers, params.ruleLabels)) {
          matched = p;
          if (p.continue_matching === 0) break;
        }
      }

      if (matched === null) {
        return { contactPointId: null, groupWaitS: 30, muteTimingIds: [] };
      }

      return {
        contactPointId: matched.contact_point_id,
        groupWaitS: matched.group_wait_s,
        muteTimingIds: parseJson(stringListSchema, matched.mute_timing_ids, []),
      };
    });

    if (policy.contactPointId === null) return;

    if (policy.groupWaitS > 0) {
      await step.sleep('group-wait', `${policy.groupWaitS} seconds`);
    }

    const alerts = await step.do<{ labelsHash: string; labels: Record<string, string>; state: string; value: string; activeAt: number | null }[]>(
      'drain-alerts',
      async () => {
        const rows = await this.env.DB.prepare(
          "SELECT labels_hash, labels, state, value, active_at FROM alert_instances WHERE rule_id = ? AND state IN ('Firing', 'Resolved')",
        )
          .bind(params.ruleId)
          .all<InstanceRow>();

        return rows.results.map(r => ({
          labelsHash: r.labels_hash,
          labels: parseJson(labelsMapSchema, r.labels, {}),
          state: r.state,
          value: r.value,
          activeAt: r.active_at,
        }));
      },
    );

    if (alerts.length === 0) return;

    const filteredAlerts = await step.do<typeof alerts>('check-silences', async () => {
      const now = Date.now();
      const silenceRows = await this.env.DB.prepare('SELECT matchers FROM silences WHERE org_id = ? AND starts_at <= ? AND ends_at > ?')
        .bind(params.orgId, now, now)
        .all<SilenceRow>();

      const silenceMatchers = silenceRows.results.map(r => parseJson(labelMatchersSchema, r.matchers, []));

      return alerts.filter(a => {
        const allLabels = { ...params.ruleLabels, ...a.labels };
        return !silenceMatchers.some(matchers => matchLabels(matchers, allLabels));
      });
    });

    if (filteredAlerts.length === 0) return;

    const shouldDeliver = await step.do<boolean>('check-mute-timings', async () => {
      if (policy.muteTimingIds.length === 0) return true;

      const placeholders = policy.muteTimingIds.map(() => '?').join(',');
      const muteRows = await this.env.DB.prepare(`SELECT id, intervals FROM mute_timings WHERE id IN (${placeholders})`)
        .bind(...policy.muteTimingIds)
        .all<MuteTimingRow>();

      const now = new Date();
      return !muteRows.results.some(r => isMuted(parseJson(muteTimeIntervalsSchema, r.intervals, []), now));
    });

    if (!shouldDeliver) return;

    const contactPoint = await step.do<{ name: string; settings: ContactPointSettings } | null>('load-contact-point', async () => {
      const rows = await this.env.DB.prepare('SELECT id, name, type, settings FROM contact_points WHERE id = ?')
        .bind(policy.contactPointId)
        .all<ContactPointRow>();

      const [row] = rows.results;
      if (row === undefined) return null;
      const settings = parseJson<ContactPointSettings | null>(contactPointSettingsSchema, row.settings, null);
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
      const stmts = filteredAlerts.map(a => {
        const prevState = a.state === 'Firing' ? 'Normal' : 'Firing';
        return this.env.DB.prepare(
          `INSERT INTO annotations (id, org_id, alert_rule_id, time, text, tags, prev_state, new_state, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(crypto.randomUUID(), params.orgId, params.ruleId, Date.now(), `${params.ruleName}: ${a.state}`, JSON.stringify(['alert']), prevState, a.state, Date.now());
      });
      if (stmts.length > 0) await this.env.DB.batch(stmts);
    });
  }
}

import type { Database } from '../db';
import type { AlertRuleDO } from './alert-rule-do';
import type { CreateAlertRule, UpdateAlertRule } from '@graflare/shared/schemas/alert-rule';
import type { UpdateAlertRuleGroup } from '@graflare/shared/schemas/alert-rule-group';

import { createAlertRuleSchema, updateAlertRuleSchema } from '@graflare/shared/schemas/alert-rule';
import { updateAlertRuleGroupSchema } from '@graflare/shared/schemas/alert-rule-group';
import { alertRuleGroupIdSchema, alertRuleIdSchema } from '@graflare/shared/schemas/ids';
import { and, eq } from 'drizzle-orm';

import { alertRuleGroups, alertRules } from '../db/schema';

// Every alert-rule mutation pairs a D1 write with an AlertRuleDO lifecycle call
// (init / updateConfig / stop). These ops are the single implementation that
// BOTH the Hono routes and the RPC methods delegate to — the F1 bug class was
// the two surfaces drifting, and an HTTP-created rule that never evaluates (or
// a deleted one whose alarm runs forever) is exactly that drift.
export interface RuleLifecycleDeps {
  db: Database;
  alertRule: DurableObjectNamespace<AlertRuleDO>;
}

type AlertRuleRow = typeof alertRules.$inferSelect;
type AlertRuleGroupRow = typeof alertRuleGroups.$inferSelect;

// The DO config payload, derived from a stored rule row + its group's eval
// interval — single-sourced so the create/update/group-update paths can't
// drift on a field.
const toRuleDoConfig = (orgId: string, rule: AlertRuleRow, evalIntervalS: number) => ({
  orgId,
  ruleId: rule.id,
  queries: rule.queries,
  condition: rule.condition,
  evalIntervalS,
  forDurationS: rule.forDurationS,
  noDataState: rule.noDataState,
  execErrState: rule.execErrState,
  labels: rule.labels,
  annotations: rule.annotations,
});

export const getRule = async (db: Database, orgId: string, id: string): Promise<AlertRuleRow | null> => {
  alertRuleIdSchema.parse(id);
  const rows = await db
    .select()
    .from(alertRules)
    .where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
};

export const getRuleGroup = async (db: Database, orgId: string, id: string): Promise<AlertRuleGroupRow | null> => {
  alertRuleGroupIdSchema.parse(id);
  const rows = await db
    .select()
    .from(alertRuleGroups)
    .where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
};

export const createRule = async ({ db, alertRule }: RuleLifecycleDeps, orgId: string, input: CreateAlertRule): Promise<AlertRuleRow | null> => {
  const parsed = createAlertRuleSchema.parse(input);
  const id = crypto.randomUUID();
  const now = new Date();

  try {
    await db.insert(alertRules).values({
      id,
      orgId,
      groupId: parsed.groupId,
      title: parsed.title,
      queries: parsed.queries,
      condition: parsed.condition,
      labels: parsed.labels ?? {},
      annotations: parsed.annotations ?? {},
      forDurationS: parsed.forDurationS ?? 0,
      noDataState: parsed.noDataState ?? 'Alerting',
      execErrState: parsed.execErrState ?? 'Alerting',
      isPaused: parsed.isPaused ?? false,
      createdAt: now,
      updatedAt: now,
    });

    const created = await getRule(db, orgId, id);
    if (created !== null && !created.isPaused) {
      const group = await getRuleGroup(db, orgId, created.groupId);
      if (group !== null) {
        await alertRule.getByName(id).init(toRuleDoConfig(orgId, created, group.evalIntervalS));
      }
    }
    return created;
  } catch (error) {
    console.error('createAlertRule failed:', error);
    throw new Error('Failed to create alert rule', { cause: error });
  }
};

export const updateRule = async ({ db, alertRule }: RuleLifecycleDeps, orgId: string, id: string, input: UpdateAlertRule): Promise<AlertRuleRow | null> => {
  alertRuleIdSchema.parse(id);
  const parsed = updateAlertRuleSchema.parse(input);
  const now = new Date();

  const setData: Record<string, unknown> = { updatedAt: now };
  if (parsed.groupId !== undefined) setData['groupId'] = parsed.groupId;
  if (parsed.title !== undefined) setData['title'] = parsed.title;
  if (parsed.queries !== undefined) setData['queries'] = parsed.queries;
  if (parsed.condition !== undefined) setData['condition'] = parsed.condition;
  if (parsed.labels !== undefined) setData['labels'] = parsed.labels;
  if (parsed.annotations !== undefined) setData['annotations'] = parsed.annotations;
  if (parsed.forDurationS !== undefined) setData['forDurationS'] = parsed.forDurationS;
  if (parsed.noDataState !== undefined) setData['noDataState'] = parsed.noDataState;
  if (parsed.execErrState !== undefined) setData['execErrState'] = parsed.execErrState;
  if (parsed.isPaused !== undefined) setData['isPaused'] = parsed.isPaused;

  try {
    await db
      .update(alertRules)
      .set(setData)
      .where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)));

    const updated = await getRule(db, orgId, id);
    if (updated !== null) {
      const stub = alertRule.getByName(id);
      if (parsed.isPaused === true) {
        await stub.stop();
      } else if (parsed.isPaused === false || !updated.isPaused) {
        const group = await getRuleGroup(db, orgId, updated.groupId);
        if (group !== null) {
          const config = toRuleDoConfig(orgId, updated, group.evalIntervalS);
          // Resuming re-inits the stopped DO; otherwise the running DO is reconfigured.
          await (parsed.isPaused === false ? stub.init(config) : stub.updateConfig(config));
        }
      }
    }
    return updated;
  } catch (error) {
    console.error('updateAlertRule failed:', error);
    throw new Error('Failed to update alert rule', { cause: error });
  }
};

export const deleteRule = async ({ db, alertRule }: RuleLifecycleDeps, orgId: string, id: string): Promise<boolean> => {
  alertRuleIdSchema.parse(id);

  // Ownership check BEFORE touching the DO — getByName(id) is not org-scoped,
  // so without it any caller could stop another org's evaluation loop by id.
  const existing = await db
    .select({ id: alertRules.id })
    .from(alertRules)
    .where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)))
    .limit(1);
  if (existing.length === 0) return false;

  try {
    // Row first, DO second: a crash in between leaves a zombie alarm (noisy,
    // and stop() is retryable) rather than a live rule that silently never
    // evaluates again.
    await db.delete(alertRules).where(and(eq(alertRules.id, id), eq(alertRules.orgId, orgId)));
    await alertRule.getByName(id).stop();
    return true;
  } catch (error) {
    console.error('deleteAlertRule failed:', error);
    throw new Error('Failed to delete alert rule', { cause: error });
  }
};

export const updateRuleGroup = async (
  { db, alertRule }: RuleLifecycleDeps,
  orgId: string,
  id: string,
  input: UpdateAlertRuleGroup,
): Promise<AlertRuleGroupRow | null> => {
  alertRuleGroupIdSchema.parse(id);
  const parsed = updateAlertRuleGroupSchema.parse(input);
  const now = new Date();

  const setData: Record<string, unknown> = { updatedAt: now };
  if (parsed.name !== undefined) setData['name'] = parsed.name;
  if (parsed.folderId !== undefined) setData['folderId'] = parsed.folderId;
  if (parsed.evalIntervalS !== undefined) setData['evalIntervalS'] = parsed.evalIntervalS;

  let group: AlertRuleGroupRow | null = null;
  try {
    await db
      .update(alertRuleGroups)
      .set(setData)
      .where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)));

    group = await getRuleGroup(db, orgId, id);

    // An interval change must reach every running member DO or rules keep
    // evaluating on the old cadence until they are next touched individually.
    if (parsed.evalIntervalS !== undefined && group !== null) {
      const { evalIntervalS } = group;
      const rules = await db
        .select()
        .from(alertRules)
        .where(and(eq(alertRules.groupId, id), eq(alertRules.orgId, orgId)));

      await Promise.all(
        rules.filter(rule => !rule.isPaused).map(rule => alertRule.getByName(rule.id).updateConfig(toRuleDoConfig(orgId, rule, evalIntervalS))),
      );
    }
  } catch (error) {
    console.error('updateAlertRuleGroup failed:', error);
    throw new Error('Failed to update alert rule group', { cause: error });
  }

  return group;
};

export const deleteRuleGroup = async ({ db }: RuleLifecycleDeps, orgId: string, id: string): Promise<void> => {
  alertRuleGroupIdSchema.parse(id);
  try {
    await db.delete(alertRuleGroups).where(and(eq(alertRuleGroups.id, id), eq(alertRuleGroups.orgId, orgId)));
  } catch (error) {
    console.error('deleteAlertRuleGroup failed:', error);
    throw new Error('Failed to delete alert rule group', { cause: error });
  }
};

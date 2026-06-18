import type { Database } from '../../db';
import type { CreateNotificationPolicy, UpdateNotificationPolicy } from '@graflare/shared/schemas/notification-policy';

import { notificationPolicyIdSchema } from '@graflare/shared/schemas/ids';
import { createNotificationPolicySchema, updateNotificationPolicySchema } from '@graflare/shared/schemas/notification-policy';
import { and, eq } from 'drizzle-orm';

import { notificationPolicies } from '../../db/schema';
import { pickDefined } from '../../pick-defined';

// Shared notification-policy CRUD used by BOTH the Hono route and the RPC method. Org-scoped.
type NotificationPolicyRow = typeof notificationPolicies.$inferSelect;

export const listNotificationPolicies = (db: Database, orgId: string): Promise<NotificationPolicyRow[]> =>
  db.select().from(notificationPolicies).where(eq(notificationPolicies.orgId, orgId));

const getNotificationPolicy = async (db: Database, orgId: string, id: string): Promise<NotificationPolicyRow | null> => {
  const rows = await db
    .select()
    .from(notificationPolicies)
    .where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
};

export const createNotificationPolicy = async (db: Database, orgId: string, input: CreateNotificationPolicy): Promise<NotificationPolicyRow | null> => {
  const parsed = createNotificationPolicySchema.parse(input);
  const id = crypto.randomUUID();
  const now = new Date();
  try {
    await db.insert(notificationPolicies).values({
      id,
      orgId,
      parentId: parsed.parentId ?? null,
      contactPointId: parsed.contactPointId ?? null,
      groupBy: parsed.groupBy ?? ['alertname'],
      matchers: parsed.matchers ?? [],
      muteTimingIds: parsed.muteTimingIds ?? [],
      groupWaitS: parsed.groupWaitS ?? 30,
      groupIntervalS: parsed.groupIntervalS ?? 300,
      repeatIntervalS: parsed.repeatIntervalS ?? 14400,
      continueMatching: parsed.continueMatching ?? false,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error('createNotificationPolicy failed:', error);
    throw new Error('Failed to create notification policy', { cause: error });
  }
  return getNotificationPolicy(db, orgId, id);
};

export const updateNotificationPolicy = async (
  db: Database,
  orgId: string,
  id: string,
  input: UpdateNotificationPolicy,
): Promise<NotificationPolicyRow | null> => {
  notificationPolicyIdSchema.parse(id);
  const parsed = updateNotificationPolicySchema.parse(input);
  const now = new Date();
  const setData = {
    ...pickDefined(parsed, [
      'parentId',
      'contactPointId',
      'groupBy',
      'matchers',
      'muteTimingIds',
      'groupWaitS',
      'groupIntervalS',
      'repeatIntervalS',
      'continueMatching',
    ]),
    updatedAt: now,
  };
  try {
    await db
      .update(notificationPolicies)
      .set(setData)
      .where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)));
  } catch (error) {
    console.error('updateNotificationPolicy failed:', error);
    throw new Error('Failed to update notification policy', { cause: error });
  }
  return getNotificationPolicy(db, orgId, id);
};

// Returns false when no row was found for this org (route → 404; RPC ignores it, resolves void).
export const deleteNotificationPolicy = async (db: Database, orgId: string, id: string): Promise<boolean> => {
  notificationPolicyIdSchema.parse(id);
  const existing = await db
    .select({ id: notificationPolicies.id })
    .from(notificationPolicies)
    .where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)))
    .limit(1);
  if (existing.length === 0) return false;
  try {
    await db.delete(notificationPolicies).where(and(eq(notificationPolicies.id, id), eq(notificationPolicies.orgId, orgId)));
  } catch (error) {
    console.error('deleteNotificationPolicy failed:', error);
    throw new Error('Failed to delete notification policy', { cause: error });
  }
  return true;
};

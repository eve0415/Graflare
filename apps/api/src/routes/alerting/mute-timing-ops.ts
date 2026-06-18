import type { Database } from '../../db';
import type { CreateMuteTiming, UpdateMuteTiming } from '@graflare/shared/schemas/mute-timing';

import { muteTimingIdSchema } from '@graflare/shared/schemas/ids';
import { createMuteTimingSchema, updateMuteTimingSchema } from '@graflare/shared/schemas/mute-timing';
import { and, eq } from 'drizzle-orm';

import { muteTimings } from '../../db/schema';
import { pickDefined } from '../../pick-defined';

// Shared mute-timing CRUD used by BOTH the Hono route and the RPC method, so the two surfaces
// can't drift (the F1 bug class). Every op is org-scoped; reads re-fetch the stored row.
type MuteTimingRow = typeof muteTimings.$inferSelect;

export const listMuteTimings = (db: Database, orgId: string): Promise<MuteTimingRow[]> => db.select().from(muteTimings).where(eq(muteTimings.orgId, orgId));

export const getMuteTiming = async (db: Database, orgId: string, id: string): Promise<MuteTimingRow | null> => {
  muteTimingIdSchema.parse(id);
  const rows = await db
    .select()
    .from(muteTimings)
    .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
};

export const createMuteTiming = async (db: Database, orgId: string, input: CreateMuteTiming): Promise<MuteTimingRow | null> => {
  const parsed = createMuteTimingSchema.parse(input);
  const id = crypto.randomUUID();
  const now = new Date();
  try {
    await db.insert(muteTimings).values({ id, orgId, name: parsed.name, intervals: parsed.intervals ?? [], createdAt: now, updatedAt: now });
  } catch (error) {
    console.error('createMuteTiming failed:', error);
    throw new Error('Failed to create mute timing', { cause: error });
  }
  return getMuteTiming(db, orgId, id);
};

export const updateMuteTiming = async (db: Database, orgId: string, id: string, input: UpdateMuteTiming): Promise<MuteTimingRow | null> => {
  muteTimingIdSchema.parse(id);
  const parsed = updateMuteTimingSchema.parse(input);
  const now = new Date();
  const setData = { ...pickDefined(parsed, ['name', 'intervals']), updatedAt: now };
  try {
    await db
      .update(muteTimings)
      .set(setData)
      .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)));
  } catch (error) {
    console.error('updateMuteTiming failed:', error);
    throw new Error('Failed to update mute timing', { cause: error });
  }
  return getMuteTiming(db, orgId, id);
};

// Returns false when no row was found for this org (the HTTP route turns that into a 404; the RPC
// method ignores it and resolves void, matching each surface's prior behavior).
export const deleteMuteTiming = async (db: Database, orgId: string, id: string): Promise<boolean> => {
  muteTimingIdSchema.parse(id);
  const existing = await db
    .select({ id: muteTimings.id })
    .from(muteTimings)
    .where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)))
    .limit(1);
  if (existing.length === 0) return false;
  try {
    await db.delete(muteTimings).where(and(eq(muteTimings.id, id), eq(muteTimings.orgId, orgId)));
  } catch (error) {
    console.error('deleteMuteTiming failed:', error);
    throw new Error('Failed to delete mute timing', { cause: error });
  }
  return true;
};

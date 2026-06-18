import type { Database } from '../../db';
import type { CreateSilence, UpdateSilence } from '@graflare/shared/schemas/silence';

import { silenceIdSchema } from '@graflare/shared/schemas/ids';
import { createSilenceSchema, updateSilenceSchema } from '@graflare/shared/schemas/silence';
import { and, eq } from 'drizzle-orm';

import { silences } from '../../db/schema';

// Shared silence CRUD used by BOTH the Hono route and the RPC method, so the two surfaces can't
// drift. Org-scoped; reads re-fetch the stored row.
type SilenceRow = typeof silences.$inferSelect;

export const listSilences = (db: Database, orgId: string): Promise<SilenceRow[]> => db.select().from(silences).where(eq(silences.orgId, orgId));

export const getSilence = async (db: Database, orgId: string, id: string): Promise<SilenceRow | null> => {
  silenceIdSchema.parse(id);
  const rows = await db
    .select()
    .from(silences)
    .where(and(eq(silences.id, id), eq(silences.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
};

export const createSilence = async (db: Database, orgId: string, input: CreateSilence): Promise<SilenceRow | null> => {
  const parsed = createSilenceSchema.parse(input);
  const id = crypto.randomUUID();
  const now = new Date();
  try {
    await db.insert(silences).values({
      id,
      orgId,
      matchers: parsed.matchers,
      startsAt: new Date(parsed.startsAt),
      endsAt: new Date(parsed.endsAt),
      comment: parsed.comment ?? '',
      createdBy: parsed.createdBy ?? '',
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error('createSilence failed:', error);
    throw new Error('Failed to create silence', { cause: error });
  }
  return getSilence(db, orgId, id);
};

export const updateSilence = async (db: Database, orgId: string, id: string, input: UpdateSilence): Promise<SilenceRow | null> => {
  silenceIdSchema.parse(id);
  const parsed = updateSilenceSchema.parse(input);
  const now = new Date();
  const setData: Record<string, unknown> = { updatedAt: now };
  if (parsed.matchers !== undefined) setData['matchers'] = parsed.matchers;
  if (parsed.startsAt !== undefined) setData['startsAt'] = new Date(parsed.startsAt);
  if (parsed.endsAt !== undefined) setData['endsAt'] = new Date(parsed.endsAt);
  if (parsed.comment !== undefined) setData['comment'] = parsed.comment;
  if (parsed.createdBy !== undefined) setData['createdBy'] = parsed.createdBy;
  try {
    await db
      .update(silences)
      .set(setData)
      .where(and(eq(silences.id, id), eq(silences.orgId, orgId)));
  } catch (error) {
    console.error('updateSilence failed:', error);
    throw new Error('Failed to update silence', { cause: error });
  }
  return getSilence(db, orgId, id);
};

// Returns false when no row was found for this org (route → 404; RPC ignores it, resolves void).
export const deleteSilence = async (db: Database, orgId: string, id: string): Promise<boolean> => {
  silenceIdSchema.parse(id);
  const existing = await db
    .select({ id: silences.id })
    .from(silences)
    .where(and(eq(silences.id, id), eq(silences.orgId, orgId)))
    .limit(1);
  if (existing.length === 0) return false;
  try {
    await db.delete(silences).where(and(eq(silences.id, id), eq(silences.orgId, orgId)));
  } catch (error) {
    console.error('deleteSilence failed:', error);
    throw new Error('Failed to delete silence', { cause: error });
  }
  return true;
};

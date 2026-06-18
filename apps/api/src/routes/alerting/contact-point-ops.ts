import type { Database } from '../../db';
import type { CreateContactPoint, UpdateContactPoint } from '@graflare/shared/schemas/contact-point';

import { createContactPointSchema, updateContactPointSchema } from '@graflare/shared/schemas/contact-point';
import { contactPointIdSchema } from '@graflare/shared/schemas/ids';
import { and, eq } from 'drizzle-orm';

import { encryptSecret, redactSecret, resolveSecretOnUpdate } from '../../alerting/contact-point-secrets';
import { contactPoints } from '../../db/schema';

// Shared contact-point CRUD used by BOTH the Hono route and the RPC method. Secrets are encrypted
// at rest and EVERY read path returns them redacted — kept in one place so neither surface can
// accidentally leak a secret.
type ContactPointRow = typeof contactPoints.$inferSelect;

const redactRow = (row: ContactPointRow): ContactPointRow => ({ ...row, settings: redactSecret(row.settings) });

export const listContactPoints = async (db: Database, orgId: string): Promise<ContactPointRow[]> => {
  const rows = await db.select().from(contactPoints).where(eq(contactPoints.orgId, orgId));
  return rows.map(row => redactRow(row));
};

export const getContactPoint = async (db: Database, orgId: string, id: string): Promise<ContactPointRow | null> => {
  contactPointIdSchema.parse(id);
  const rows = await db
    .select()
    .from(contactPoints)
    .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)))
    .limit(1);
  const row = rows[0] ?? null;
  return row === null ? null : redactRow(row);
};

export const createContactPoint = async (db: Database, orgId: string, input: CreateContactPoint, encryptionKey: string): Promise<ContactPointRow | null> => {
  const parsed = createContactPointSchema.parse(input);
  const id = crypto.randomUUID();
  const now = new Date();
  try {
    const settings = await encryptSecret(parsed.settings, encryptionKey);
    await db.insert(contactPoints).values({ id, orgId, name: parsed.name, type: parsed.type, settings, createdAt: now, updatedAt: now });
  } catch (error) {
    console.error('createContactPoint failed:', error);
    throw new Error('Failed to create contact point', { cause: error });
  }
  return getContactPoint(db, orgId, id);
};

export const updateContactPoint = async (
  db: Database,
  orgId: string,
  id: string,
  input: UpdateContactPoint,
  encryptionKey: string,
): Promise<ContactPointRow | null> => {
  contactPointIdSchema.parse(id);
  const parsed = updateContactPointSchema.parse(input);
  const now = new Date();

  const existingRows = await db
    .select()
    .from(contactPoints)
    .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)))
    .limit(1);
  const existingRow = existingRows[0] ?? null;
  if (existingRow === null) return null;

  const setData: Record<string, unknown> = { updatedAt: now };
  if (parsed.name !== undefined) setData['name'] = parsed.name;
  if (parsed.type !== undefined) setData['type'] = parsed.type;
  try {
    if (parsed.settings !== undefined) {
      setData['settings'] = await resolveSecretOnUpdate(parsed.settings, existingRow.settings, encryptionKey);
    }
    await db
      .update(contactPoints)
      .set(setData)
      .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)));
  } catch (error) {
    console.error('updateContactPoint failed:', error);
    throw new Error('Failed to update contact point', { cause: error });
  }
  return getContactPoint(db, orgId, id);
};

// Returns false when no row was found for this org (route → 404; RPC ignores it, resolves void).
export const deleteContactPoint = async (db: Database, orgId: string, id: string): Promise<boolean> => {
  contactPointIdSchema.parse(id);
  const existing = await db
    .select({ id: contactPoints.id })
    .from(contactPoints)
    .where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)))
    .limit(1);
  if (existing.length === 0) return false;
  try {
    await db.delete(contactPoints).where(and(eq(contactPoints.id, id), eq(contactPoints.orgId, orgId)));
  } catch (error) {
    console.error('deleteContactPoint failed:', error);
    throw new Error('Failed to delete contact point', { cause: error });
  }
  return true;
};

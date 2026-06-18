import type { Database } from '../../db';
import type { CreateDatasource, UpdateDatasource } from '@graflare/shared/schemas/datasource';

import { createDatasourceSchema, updateDatasourceSchema } from '@graflare/shared/schemas/datasource';
import { datasourceIdSchema } from '@graflare/shared/schemas/ids';
import { and, eq } from 'drizzle-orm';

import { encryptCredentials } from '../../crypto/credentials';
import { datasourcePublicColumns, datasources } from '../../db/schema';

// Shared datasource CRUD used by BOTH the Hono route and the RPC method. Reads use the
// datasourcePublicColumns projection so the encrypted `credentials` column never leaves the worker;
// writes encrypt credentials at rest. Return types are inferred (matching the prior RPC methods).

export const listDatasources = (db: Database, orgId: string) => db.select(datasourcePublicColumns).from(datasources).where(eq(datasources.orgId, orgId));

export const getDatasource = async (db: Database, orgId: string, id: string) => {
  datasourceIdSchema.parse(id);
  const rows = await db
    .select(datasourcePublicColumns)
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
};

// Returns the created datasource (non-null, credentials omitted — the create contract both surfaces
// relied on). Constructed from the validated input rather than re-fetched.
export const createDatasource = async (db: Database, orgId: string, input: CreateDatasource, encryptionKey: string) => {
  const parsed = createDatasourceSchema.parse(input);
  const { credentials, ...rest } = parsed;
  const id = crypto.randomUUID();
  const now = new Date();
  try {
    let encryptedCreds: string | null = null;
    if (credentials) {
      encryptedCreds = await encryptCredentials(JSON.stringify(credentials), encryptionKey);
    }
    await db.insert(datasources).values({ id, orgId, ...rest, credentials: encryptedCreds, createdAt: now, updatedAt: now });
  } catch (error) {
    console.error('createDatasource failed:', error);
    throw new Error('Failed to create datasource', { cause: error });
  }
  return { id, orgId, ...rest, createdAt: now, updatedAt: now };
};

export const updateDatasource = async (db: Database, orgId: string, id: string, input: UpdateDatasource, encryptionKey: string) => {
  datasourceIdSchema.parse(id);
  const parsed = updateDatasourceSchema.parse(input);
  const { credentials, ...rest } = parsed;
  const now = new Date();
  try {
    let encryptedCreds: string | undefined;
    if (credentials) {
      encryptedCreds = await encryptCredentials(JSON.stringify(credentials), encryptionKey);
    }
    await db
      .update(datasources)
      .set({ ...rest, ...(encryptedCreds !== undefined && { credentials: encryptedCreds }), updatedAt: now })
      .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)));
  } catch (error) {
    console.error('updateDatasource failed:', error);
    throw new Error('Failed to update datasource', { cause: error });
  }
  return getDatasource(db, orgId, id);
};

// Returns false when no row was found for this org (route → 404; RPC ignores it, resolves void).
export const deleteDatasource = async (db: Database, orgId: string, id: string): Promise<boolean> => {
  datasourceIdSchema.parse(id);
  const existing = await db
    .select({ id: datasources.id })
    .from(datasources)
    .where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)))
    .limit(1);
  if (existing.length === 0) return false;
  try {
    await db.delete(datasources).where(and(eq(datasources.id, id), eq(datasources.orgId, orgId)));
  } catch (error) {
    console.error('deleteDatasource failed:', error);
    throw new Error('Failed to delete datasource', { cause: error });
  }
  return true;
};

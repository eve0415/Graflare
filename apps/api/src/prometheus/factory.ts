import { datasourceCredentialsSchema } from '@graflare/shared/schemas/datasource';
import { and, eq } from 'drizzle-orm';

import { decryptCredentials } from '../crypto/credentials';
import { createDb } from '../db';
import { datasources } from '../db/schema';

import { PrometheusClient } from './client';

export async function createPrometheusClient(db: D1Database, encryptionKey: string, orgId: string, datasourceId: string): Promise<PrometheusClient | null> {
  const drizzle = createDb(db);
  const rows = await drizzle
    .select()
    .from(datasources)
    .where(and(eq(datasources.id, datasourceId), eq(datasources.orgId, orgId)))
    .limit(1);

  const [ds] = rows;
  if (ds === undefined) return null;

  let auth: { type: 'none' | 'basic' | 'bearer'; credentials?: { username?: string; password?: string; token?: string } } = { type: 'none' };

  if (ds.credentials) {
    const creds = datasourceCredentialsSchema.parse(JSON.parse(await decryptCredentials(ds.credentials, encryptionKey)));
    if (ds.authType === 'basic' || ds.authType === 'bearer') {
      auth = { type: ds.authType, credentials: creds };
    }
  }

  return new PrometheusClient(ds.url, auth, ds.queryTimeoutMs);
}

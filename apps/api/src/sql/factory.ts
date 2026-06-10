import type { datasources } from '../db/schema';

import { datasourceCredentialsSchema } from '@graflare/shared/schemas/datasource';

import { decryptCredentials } from '../crypto/credentials';

import { SqlClient } from './client';

// The columns a SQL client needs from a datasource row. Callers pass the row
// they already fetched (every call site has it in hand for type/dialect
// checks), so the factory never re-queries D1 for the same row.
type SqlDatasource = Pick<typeof datasources.$inferSelect, 'url' | 'authType' | 'credentials' | 'queryTimeoutMs'>;

export const createSqlClient = async (ds: SqlDatasource, encryptionKey: string, fetchFn?: typeof fetch): Promise<SqlClient> => {
  let auth: { type: 'none' | 'basic' | 'bearer'; credentials?: { username?: string | undefined; password?: string | undefined; token?: string | undefined } } =
    { type: 'none' };

  if (ds.credentials) {
    const creds = datasourceCredentialsSchema.parse(JSON.parse(await decryptCredentials(ds.credentials, encryptionKey)));
    if (ds.authType === 'basic' || ds.authType === 'bearer') {
      auth = { type: ds.authType, credentials: creds };
    }
  }

  return new SqlClient(ds.url, auth, ds.queryTimeoutMs, fetchFn);
};

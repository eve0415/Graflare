import type { PrometheusAuth } from './client';

import { datasourceCredentialsSchema } from '@graflare/shared/schemas/datasource';

import { decryptCredentials } from '../crypto/credentials';

// The one place an upstream Authorization header is built from datasource auth
// config — the Prometheus client, the proxy, and both test-connection paths all
// eat from this, so a header/credential fix lands everywhere at once.
export const authHeaders = (auth: PrometheusAuth): Record<string, string> => {
  const creds = auth.credentials;
  if (creds === undefined) return {};
  if (auth.type === 'basic' && creds.username && creds.password) {
    return { Authorization: `Basic ${btoa(`${creds.username}:${creds.password}`)}` };
  }
  if (auth.type === 'bearer' && creds.token) {
    return { Authorization: `Bearer ${creds.token}` };
  }
  return {};
};

// Decrypt a stored credentials blob into a PrometheusAuth. Callers MUST have
// completed any origin/allowlist checks before attaching the result to a request.
export const decryptedAuth = async (encrypted: string | null, authType: string, encryptionKey: string): Promise<PrometheusAuth> => {
  if (encrypted === null || (authType !== 'basic' && authType !== 'bearer')) {
    return { type: 'none' };
  }
  const credentials = datasourceCredentialsSchema.parse(JSON.parse(await decryptCredentials(encrypted, encryptionKey)));
  return { type: authType, credentials };
};

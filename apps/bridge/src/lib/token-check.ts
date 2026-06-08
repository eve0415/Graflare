import { isRecord } from './typed-access';

interface TokenCheckResult {
  valid: boolean;
  missingPermissions: string[];
}

const REQUIRED_PERMISSIONS = ['com.cloudflare.api.account.zone.analytics', 'com.cloudflare.api.account.analytics'];

const PERMISSION_LABELS: Record<string, string> = {
  'com.cloudflare.api.account.analytics': 'Account > Account Analytics > Read',
  'com.cloudflare.api.account.zone.analytics': 'Zone > Analytics > Read',
};

export const checkTokenPermissions = async (token: string): Promise<TokenCheckResult> => {
  const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return { valid: false, missingPermissions: ['Token is invalid or expired — update CF_API_TOKEN'] };
  }

  const json: unknown = await res.json();
  if (!isRecord(json) || !('success' in json) || json.success !== true) {
    return { valid: false, missingPermissions: ['Token verification failed — update CF_API_TOKEN'] };
  }

  const settingsRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: '{ viewer { accounts { accountTag } } }' }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!settingsRes.ok) {
    const missing = REQUIRED_PERMISSIONS.map(p => PERMISSION_LABELS[p] ?? p);
    return { valid: true, missingPermissions: missing };
  }

  const gqlJson: unknown = await settingsRes.json();
  if (isRecord(gqlJson) && 'errors' in gqlJson && Array.isArray(gqlJson.errors) && gqlJson.errors.length > 0) {
    const msg = String(gqlJson.errors[0]?.message ?? '');
    if (msg.includes('not authorized') || msg.includes('does not have access') || msg.includes('permission')) {
      const missing = REQUIRED_PERMISSIONS.map(p => PERMISSION_LABELS[p] ?? p);
      return { valid: true, missingPermissions: missing };
    }
  }

  return { valid: true, missingPermissions: [] };
};

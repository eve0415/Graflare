import type { ContactPointSettings } from '@graflare/shared/schemas/alerting';

import { encryptCredentials } from '../crypto/credentials';

/** Sentinel returned in place of a stored secret; the edit form sends it back unchanged to keep the existing secret. */
export const REDACTED = '******';

/**
 * The secret string for settings types that carry one, else null.
 * Exhaustive switch — adding a union member is a compile error here until a branch is added.
 */
export const secretOf = (s: ContactPointSettings): string | null => {
  switch (s.type) {
    case 'email':
      return null;
    case 'webhook':
      return s.password;
  }
};

/** Returns a copy of `s` with its secret field set to `secret`. No-op for secret-less types. */
export const withSecret = (s: ContactPointSettings, secret: string): ContactPointSettings => {
  switch (s.type) {
    case 'email':
      return s;
    case 'webhook':
      return { ...s, password: secret };
  }
};

/** Redact the secret for ANY read path so ciphertext never leaves the worker. */
export const redactSecret = (s: ContactPointSettings): ContactPointSettings => {
  const secret = secretOf(s);
  return secret === null || secret.length === 0 ? s : withSecret(s, REDACTED);
};

/** Encrypt the live secret before storing. No-op when there is no secret to store. */
export const encryptSecret = async (s: ContactPointSettings, key: string): Promise<ContactPointSettings> => {
  const secret = secretOf(s);
  return secret === null || secret.length === 0 ? s : withSecret(s, await encryptCredentials(secret, key));
};

/**
 * On update: keep the prior ciphertext when the sentinel comes back unchanged from the edit form
 * (SAME TYPE ONLY — never bleed a secret across provider types); otherwise encrypt the new value.
 */
export const resolveSecretOnUpdate = async (incoming: ContactPointSettings, prev: ContactPointSettings, key: string): Promise<ContactPointSettings> => {
  if (secretOf(incoming) === REDACTED) {
    const prevSecret = prev.type === incoming.type ? secretOf(prev) : null;
    return withSecret(incoming, prevSecret ?? '');
  }
  return encryptSecret(incoming, key);
};

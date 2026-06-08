import type { ContactPointSettings } from '@graflare/shared/schemas/alerting';

import { describe, expect, it } from 'vitest';

import { decryptCredentials } from '../crypto/credentials';

import { REDACTED, encryptSecret, redactSecret, resolveSecretOnUpdate, secretOf, withSecret } from './contact-point-secrets';

const KEY = btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));

const must = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new Error('expected defined value');
  return v;
};

const email: ContactPointSettings = { type: 'email', addresses: ['a@b.com'] };
const webhook = (password: string): ContactPointSettings => ({ type: 'webhook', url: 'https://x/y', method: 'POST', username: 'u', password });

describe('contact-point-secrets', () => {
  describe('secretOf', () => {
    it('returns null for email', () => {
      expect(secretOf(email)).toBeNull();
    });
    it('returns the webhook password', () => {
      expect(secretOf(webhook('pw'))).toBe('pw');
    });
  });

  describe('withSecret', () => {
    it('is a no-op for email', () => {
      expect(withSecret(email, 'pw')).toEqual(email);
    });
    it('replaces the webhook password and round-trips through secretOf', () => {
      const next = withSecret(webhook('old'), 'new');
      expect(secretOf(next)).toBe('new');
    });
  });

  describe('redactSecret', () => {
    it('leaves email untouched', () => {
      expect(redactSecret(email)).toEqual(email);
    });
    it('replaces a non-empty webhook password with the sentinel', () => {
      expect(secretOf(redactSecret(webhook('pw')))).toBe(REDACTED);
    });
    it('leaves an empty webhook password empty (nothing to hide)', () => {
      expect(secretOf(redactSecret(webhook('')))).toBe('');
    });
  });

  describe('encryptSecret', () => {
    it('encrypts a non-empty webhook password to recoverable ciphertext', async () => {
      const cipher = must(secretOf(await encryptSecret(webhook('pw'), KEY)));
      expect(cipher).not.toBe('pw');
      expect(await decryptCredentials(cipher, KEY)).toBe('pw');
    });
    it('is a no-op for email', async () => {
      expect(await encryptSecret(email, KEY)).toEqual(email);
    });
    it('is a no-op for an empty password', async () => {
      expect(secretOf(await encryptSecret(webhook(''), KEY))).toBe('');
    });
  });

  describe('resolveSecretOnUpdate', () => {
    it('keeps the prior ciphertext when the sentinel comes back (same type)', async () => {
      const out = await resolveSecretOnUpdate(webhook(REDACTED), webhook('stored-ciphertext'), KEY);
      expect(secretOf(out)).toBe('stored-ciphertext');
    });

    it('encrypts a real new secret instead of preserving', async () => {
      const cipher = must(secretOf(await resolveSecretOnUpdate(webhook('brand-new'), webhook('old-ciphertext'), KEY)));
      expect(cipher).not.toBe('brand-new');
      expect(cipher).not.toBe('old-ciphertext');
      expect(await decryptCredentials(cipher, KEY)).toBe('brand-new');
    });

    it('never bleeds a secret across provider types: sentinel from a different prev type yields empty', async () => {
      // Prior settings were email (no secret); incoming is a webhook still holding the sentinel.
      const out = await resolveSecretOnUpdate(webhook(REDACTED), email, KEY);
      expect(secretOf(out)).toBe('');
    });
  });
});

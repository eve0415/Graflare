import { describe, expect, it } from 'vitest';

import { encryptCredentials } from '../crypto/credentials';

import { authHeaders, decryptedAuth } from './auth';

const testKey = (): string => btoa(String.fromCodePoint(...crypto.getRandomValues(new Uint8Array(32))));

describe('authHeaders', () => {
  it('builds a Basic header from username + password', () => {
    expect(authHeaders({ type: 'basic', credentials: { username: 'alice', password: 's3cret' } })).toEqual({
      Authorization: `Basic ${btoa('alice:s3cret')}`,
    });
  });

  it('builds a Bearer header from a token', () => {
    expect(authHeaders({ type: 'bearer', credentials: { token: 'tok-123' } })).toEqual({ Authorization: 'Bearer tok-123' });
  });

  it('returns no header when there are no credentials', () => {
    expect(authHeaders({ type: 'none' })).toEqual({});
  });

  it('returns no header for Basic auth missing the password half', () => {
    expect(authHeaders({ type: 'basic', credentials: { username: 'alice' } })).toEqual({});
  });

  it('returns no header for Bearer auth with an empty token', () => {
    expect(authHeaders({ type: 'bearer', credentials: { token: '' } })).toEqual({});
  });
});

describe('decryptedAuth', () => {
  it('returns none when there is no stored blob', async () => {
    expect(await decryptedAuth(null, 'bearer', testKey())).toEqual({ type: 'none' });
  });

  it('returns none for an auth type that carries no credentials', async () => {
    const key = testKey();
    const encrypted = await encryptCredentials(JSON.stringify({ token: 'tok' }), key);
    // authType 'none' (or anything other than basic/bearer) must not decrypt/attach credentials.
    expect(await decryptedAuth(encrypted, 'none', key)).toEqual({ type: 'none' });
  });

  it('round-trips a bearer credential', async () => {
    const key = testKey();
    const encrypted = await encryptCredentials(JSON.stringify({ token: 'tok-xyz' }), key);
    expect(await decryptedAuth(encrypted, 'bearer', key)).toEqual({ type: 'bearer', credentials: { token: 'tok-xyz' } });
  });

  it('round-trips a basic credential', async () => {
    const key = testKey();
    const encrypted = await encryptCredentials(JSON.stringify({ username: 'bob', password: 'pw' }), key);
    expect(await decryptedAuth(encrypted, 'basic', key)).toEqual({ type: 'basic', credentials: { username: 'bob', password: 'pw' } });
  });
});

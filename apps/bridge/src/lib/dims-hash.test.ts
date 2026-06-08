import { describe, expect, it } from 'vitest';

import { dimsHash } from './dims-hash';

describe('dimsHash', () => {
  it('returns 00000000 for empty dims', () => {
    expect(dimsHash({})).toBe('00000000');
  });

  it('is deterministic', () => {
    const dims = { scriptName: 'worker-a', region: 'us-east' };
    expect(dimsHash(dims)).toBe(dimsHash(dims));
  });

  it('is order-independent', () => {
    const a = dimsHash({ scriptName: 'worker-a', region: 'us-east' });
    const b = dimsHash({ region: 'us-east', scriptName: 'worker-a' });
    expect(a).toBe(b);
  });

  it('produces different hashes for different dims', () => {
    const a = dimsHash({ scriptName: 'worker-a' });
    const b = dimsHash({ scriptName: 'worker-b' });
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different keys with same values', () => {
    const a = dimsHash({ a: 'x' });
    const b = dimsHash({ b: 'x' });
    expect(a).not.toBe(b);
  });

  it('returns 8-char hex string', () => {
    const hash = dimsHash({ action: 'read', bucket: 'my-bucket' });
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('handles single dim', () => {
    const hash = dimsHash({ scriptName: 'worker' });
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(hash).not.toBe('00000000');
  });
});

import { describe, expect, it } from 'vitest';

import { datasourceIdSchema, orgIdSchema } from './ids';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const ORG_ID = `org-${'a1b2c3d4'.repeat(4)}`;

describe('datasourceIdSchema', () => {
  it('accepts a UUID (the shape crypto.randomUUID() produces)', () => {
    expect(datasourceIdSchema.safeParse(UUID).success).toBe(true);
  });

  it('rejects a non-UUID', () => {
    expect(datasourceIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('rejects an org id', () => {
    expect(datasourceIdSchema.safeParse(ORG_ID).success).toBe(false);
  });
});

describe('orgIdSchema', () => {
  it('accepts org-<32 lowercase hex>', () => {
    expect(orgIdSchema.safeParse(ORG_ID).success).toBe(true);
  });

  it('rejects a UUID (the latent organizationSchema.id bug)', () => {
    expect(orgIdSchema.safeParse(UUID).success).toBe(false);
  });

  it("rejects the transitional 'default' value", () => {
    expect(orgIdSchema.safeParse('default').success).toBe(false);
  });

  it('rejects wrong-length hex', () => {
    expect(orgIdSchema.safeParse(`org-${'a'.repeat(31)}`).success).toBe(false);
  });

  it('rejects uppercase hex', () => {
    expect(orgIdSchema.safeParse(`org-${'A'.repeat(32)}`).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { organizationSchema } from './organization';

const validOrganization = {
  id: `org-${'a1b2c3d4'.repeat(4)}`,
  name: 'Acme',
  createdAt: 1716854400000,
  updatedAt: 1716854400000,
};

describe('organizationSchema', () => {
  it('accepts an org-format id', () => {
    expect(organizationSchema.safeParse(validOrganization).success).toBe(true);
  });

  it('rejects a UUID id (the field was z.uuid(), a bug)', () => {
    const result = organizationSchema.safeParse({
      ...validOrganization,
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(organizationSchema.safeParse({ ...validOrganization, name: '' }).success).toBe(false);
  });
});

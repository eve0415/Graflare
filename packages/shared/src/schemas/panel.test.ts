import { describe, expect, it } from 'vitest';

import { panelSchema } from './panel';

const base = {
  id: 'panel-1',
  type: 'timeseries',
  title: 'CPU',
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
};

describe('panelSchema — repeat fields', () => {
  it('parses a pre-repeat panel unchanged and fills the repeat defaults', () => {
    const parsed = panelSchema.parse(base);
    expect(parsed.repeat).toBeUndefined();
    expect(parsed.repeatDirection).toBe('h');
    expect(parsed.maxPerRow).toBe(4);
  });

  it('parses an explicit repeat configuration', () => {
    const parsed = panelSchema.parse({ ...base, repeat: 'instance', repeatDirection: 'v', maxPerRow: 6 });
    expect(parsed.repeat).toBe('instance');
    expect(parsed.repeatDirection).toBe('v');
    expect(parsed.maxPerRow).toBe(6);
  });

  it('rejects an empty repeat name (absent means no repeat)', () => {
    expect(panelSchema.safeParse({ ...base, repeat: '' }).success).toBe(false);
  });

  it('rejects a repeat name longer than 128 characters', () => {
    expect(panelSchema.safeParse({ ...base, repeat: 'v'.repeat(129) }).success).toBe(false);
  });

  it('rejects maxPerRow outside 1..24 and non-integers', () => {
    expect(panelSchema.safeParse({ ...base, maxPerRow: 0 }).success).toBe(false);
    expect(panelSchema.safeParse({ ...base, maxPerRow: 25 }).success).toBe(false);
    expect(panelSchema.safeParse({ ...base, maxPerRow: 2.5 }).success).toBe(false);
  });

  it('rejects an unknown repeatDirection', () => {
    expect(panelSchema.safeParse({ ...base, repeatDirection: 'x' }).success).toBe(false);
  });
});

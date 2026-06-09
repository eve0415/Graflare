import { describe, expect, it } from 'vitest';

import { panelSchema } from './panel';
import { TRANSFORMATION_IDS, makeTransformation, transformationSchema } from './transformation';

// A minimal valid panel literal (no transformations key) to prove backward compatibility.
const basePanelInput = {
  id: 'p1',
  type: 'timeseries',
  title: 'T',
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
};

describe('transformationSchema', () => {
  describe('per-id option parsing + defaults', () => {
    it('reduce defaults calc to "last"', () => {
      const parsed = transformationSchema.parse({ id: 'reduce', options: {} });
      expect(parsed).toEqual({ id: 'reduce', options: { calc: 'last' } });
    });

    it('reduce accepts a valid calc', () => {
      expect(transformationSchema.parse({ id: 'reduce', options: { calc: 'mean' } })).toEqual({ id: 'reduce', options: { calc: 'mean' } });
    });

    it('reduce rejects an unknown calc', () => {
      expect(transformationSchema.safeParse({ id: 'reduce', options: { calc: 'median' } }).success).toBe(false);
    });

    it('filterFieldsByName defaults mode/match/value', () => {
      expect(transformationSchema.parse({ id: 'filterFieldsByName', options: {} })).toEqual({
        id: 'filterFieldsByName',
        options: { mode: 'include', match: 'byName', value: '' },
      });
    });

    it('organize defaults all three maps to empty', () => {
      expect(transformationSchema.parse({ id: 'organize', options: {} })).toEqual({
        id: 'organize',
        options: { excludeByName: {}, renameByName: {}, indexByName: {} },
      });
    });

    it('sortBy defaults by/desc', () => {
      expect(transformationSchema.parse({ id: 'sortBy', options: {} })).toEqual({ id: 'sortBy', options: { by: 'name', desc: false } });
    });

    it('limit defaults count to 10 and bounds it', () => {
      expect(transformationSchema.parse({ id: 'limit', options: {} })).toEqual({ id: 'limit', options: { count: 10 } });
      expect(transformationSchema.safeParse({ id: 'limit', options: { count: -1 } }).success).toBe(false);
      expect(transformationSchema.safeParse({ id: 'limit', options: { count: 10001 } }).success).toBe(false);
    });
  });

  it('rejects an unknown transform id (discriminated union is closed)', () => {
    expect(transformationSchema.safeParse({ id: 'merge', options: {} }).success).toBe(false);
  });
});

describe('the canonical TRANSFORMATION_IDS tuple', () => {
  it('lists every transform id exactly once', () => {
    expect([...TRANSFORMATION_IDS].sort()).toEqual(['filterFieldsByName', 'limit', 'organize', 'reduce', 'sortBy']);
  });
});

describe('makeTransformation', () => {
  it('builds a parseable transform for every id', () => {
    for (const id of TRANSFORMATION_IDS) {
      const made = makeTransformation(id);
      expect(made.id).toBe(id);
      // Round-trips through the schema unchanged — the factory's options match the schema's defaults.
      expect(transformationSchema.parse(made)).toEqual(made);
    }
  });
});

describe('panelSchema with transformations', () => {
  it('a panel WITHOUT a transformations key parses to an empty array (backward compatible)', () => {
    const parsed = panelSchema.parse(basePanelInput);
    expect(parsed.transformations).toEqual([]);
  });

  it('a panel WITH transformations parses and normalizes each entry', () => {
    const parsed = panelSchema.parse({
      ...basePanelInput,
      transformations: [
        { id: 'reduce', options: {} },
        { id: 'limit', options: { count: 5 } },
      ],
    });
    expect(parsed.transformations).toEqual([
      { id: 'reduce', options: { calc: 'last' } },
      { id: 'limit', options: { count: 5 } },
    ]);
  });

  it('a panel with an invalid transform fails to parse (no silent drop at the schema layer)', () => {
    expect(panelSchema.safeParse({ ...basePanelInput, transformations: [{ id: 'nope', options: {} }] }).success).toBe(false);
  });
});

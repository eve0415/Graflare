import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig, FieldConfigDefaults } from '@graflare/shared/schemas/field-config';

import { describe, expect, it } from 'vitest';

import { statusHistoryCells } from './status-history-data';

// A Prometheus matrix response (the shape usePanelData returns for a range query).
// Values are stringified the way the wire format delivers them.
const matrix = (rows: { metric: Record<string, string>; values: [number, number][] }[]): PanelDataResult[] => [
  {
    status: 'success',
    data: { resultType: 'matrix', result: rows.map(r => ({ metric: r.metric, values: r.values.map(([t, v]): [number, string] => [t, String(v)]) })) },
  },
];

// Wrap a defaults block in a no-overrides field config — the regression case (every lane
// resolves to this defaults reference, so formatting/colour is identical to before).
const noOverrides = (defaults: FieldConfigDefaults): FieldConfig => ({ defaults, overrides: [] });

const defaults: FieldConfigDefaults = { unit: 'short', mappings: [] };
const config = noOverrides(defaults);

describe('statusHistoryCells', () => {
  it('returns no lanes for null/undefined data', () => {
    const missing: PanelDataResult[] | undefined = undefined;
    expect(statusHistoryCells(null, config)).toEqual([]);
    expect(statusHistoryCells(missing, config)).toEqual([]);
  });

  it('emits one cell per sample with no merging of equal values', () => {
    const [lane] = statusHistoryCells(
      matrix([
        {
          metric: { __name__: 'state' },
          values: [
            [0, 1],
            [10, 1],
            [20, 1],
          ],
        },
      ]),
      config,
    );
    expect(lane?.label).toBe('state');
    // Three identical samples stay three separate cells (unlike state-timeline, which
    // would merge them into one segment).
    expect(lane?.cells).toEqual([
      { time: 0, value: 1, displayValue: '1' },
      { time: 10, value: 1, displayValue: '1' },
      { time: 20, value: 1, displayValue: '1' },
    ]);
  });

  it('keeps one cell per sample for alternating values', () => {
    const [lane] = statusHistoryCells(
      matrix([
        {
          metric: { __name__: 'state' },
          values: [
            [0, 0],
            [10, 1],
            [20, 2],
          ],
        },
      ]),
      config,
    );
    expect(lane?.cells).toHaveLength(3);
    expect(lane?.cells.map(c => c.value)).toEqual([0, 1, 2]);
  });

  it('formats each cell display value through the field config unit', () => {
    const [lane] = statusHistoryCells(matrix([{ metric: { __name__: 'bytes' }, values: [[0, 1024]] }]), noOverrides({ unit: 'bytes', mappings: [] }));
    expect(lane?.cells[0]?.displayValue).toBe('1 KiB');
  });

  it('drops samples whose value is not finite', () => {
    const [lane] = statusHistoryCells(
      matrix([
        {
          metric: { __name__: 'state' },
          values: [
            [0, 1],
            [10, Number.NaN],
            [20, 3],
          ],
        },
      ]),
      config,
    );
    expect(lane?.cells).toEqual([
      { time: 0, value: 1, displayValue: '1' },
      { time: 20, value: 3, displayValue: '3' },
    ]);
  });

  it('produces no cells for an empty series but still emits the lane', () => {
    const lanes = statusHistoryCells(matrix([{ metric: { __name__: 'empty' }, values: [] }]), config);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.label).toBe('empty');
    expect(lanes[0]?.cells).toEqual([]);
  });

  it('builds one lane per series, in order', () => {
    const lanes = statusHistoryCells(
      matrix([
        { metric: { __name__: 'a' }, values: [[0, 1]] },
        { metric: { __name__: 'b' }, values: [[0, 0]] },
        { metric: { instance: 'host-1' }, values: [[0, 2]] },
      ]),
      config,
    );
    expect(lanes.map(l => l.label)).toEqual(['a', 'b', 'host-1']);
    expect(lanes.every(l => l.cells.length === 1)).toBe(true);
  });

  it('resolves the defaults config reference for every lane when overrides is empty', () => {
    // Byte-equivalence at the data layer: a no-override resolve hands every lane the SAME
    // defaults object, so the display formatting AND the colour mappings are unchanged.
    const lanes = statusHistoryCells(
      matrix([
        { metric: { __name__: 'a' }, values: [[0, 1]] },
        { metric: { __name__: 'b' }, values: [[0, 0]] },
      ]),
      config,
    );
    expect(lanes[0]?.config).toBe(config.defaults);
    expect(lanes[1]?.config).toBe(config.defaults);
  });

  it('applies a byName unit override to its matched lane only', () => {
    const overridden: FieldConfig = {
      defaults: { unit: 'short', mappings: [] },
      overrides: [{ matcher: { id: 'byName', options: 'bytes' }, properties: [{ id: 'unit', value: 'bytes' }] }],
    };
    const lanes = statusHistoryCells(
      matrix([
        { metric: { __name__: 'bytes' }, values: [[0, 1024]] },
        { metric: { __name__: 'plain' }, values: [[0, 1024]] },
      ]),
      overridden,
    );
    expect(lanes[0]?.cells[0]?.displayValue).toBe('1 KiB');
    expect(lanes[0]?.config.unit).toBe('bytes');
    expect(lanes[1]?.config).toBe(overridden.defaults);
  });

  it('carries a byName mappings override on the matched lane (drives the renderer colour path)', () => {
    // The lane carries its own resolved mappings so the SVG's stateColor recolours only
    // this lane. formatValue handles only unit/decimals, so displayValue is untouched.
    const mappings = [{ type: 'value' as const, value: '1', result: { text: 'UP', color: '#0f0' } }];
    const overridden: FieldConfig = {
      defaults: { unit: 'short', mappings: [] },
      overrides: [{ matcher: { id: 'byName', options: 'state' }, properties: [{ id: 'mappings', value: mappings }] }],
    };
    const [lane] = statusHistoryCells(matrix([{ metric: { __name__: 'state' }, values: [[0, 1]] }]), overridden);
    expect(lane?.config.mappings).toEqual(mappings);
    expect(lane?.cells[0]?.displayValue).toBe('1');
  });
});

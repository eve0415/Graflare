import type { PanelDataResult } from './use-panel-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';

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

const defaults: FieldConfigDefaults = { unit: 'short', mappings: [] };

describe('statusHistoryCells', () => {
  it('returns no lanes for null/undefined data', () => {
    const missing: PanelDataResult[] | undefined = undefined;
    expect(statusHistoryCells(null, defaults)).toEqual([]);
    expect(statusHistoryCells(missing, defaults)).toEqual([]);
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
      defaults,
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
      defaults,
    );
    expect(lane?.cells).toHaveLength(3);
    expect(lane?.cells.map(c => c.value)).toEqual([0, 1, 2]);
  });

  it('formats each cell display value through the field config unit', () => {
    const [lane] = statusHistoryCells(matrix([{ metric: { __name__: 'bytes' }, values: [[0, 1024]] }]), { unit: 'bytes', mappings: [] });
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
      defaults,
    );
    expect(lane?.cells).toEqual([
      { time: 0, value: 1, displayValue: '1' },
      { time: 20, value: 3, displayValue: '3' },
    ]);
  });

  it('produces no cells for an empty series but still emits the lane', () => {
    const lanes = statusHistoryCells(matrix([{ metric: { __name__: 'empty' }, values: [] }]), defaults);
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
      defaults,
    );
    expect(lanes.map(l => l.label)).toEqual(['a', 'b', 'host-1']);
    expect(lanes.every(l => l.cells.length === 1)).toBe(true);
  });
});

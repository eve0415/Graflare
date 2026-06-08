import type { PanelDataResult } from './use-panel-data';
import type { FieldConfigDefaults } from '@graflare/shared/schemas/field-config';

import { describe, expect, it } from 'vitest';

import { stateTimelineLanes } from './state-timeline-data';

// A Prometheus matrix response (the shape usePanelData returns for a range query).
// Values are stringified the way the wire format delivers them.
const matrix = (rows: { metric: Record<string, string>; values: [number, number][] }[]): PanelDataResult[] => [
  {
    status: 'success',
    data: { resultType: 'matrix', result: rows.map(r => ({ metric: r.metric, values: r.values.map(([t, v]): [number, string] => [t, String(v)]) })) },
  },
];

const defaults: FieldConfigDefaults = { unit: 'short', mappings: [] };

describe('stateTimelineLanes', () => {
  it('returns no lanes for null/undefined data', () => {
    const missing: PanelDataResult[] | undefined = undefined;
    expect(stateTimelineLanes(null, defaults)).toEqual([]);
    expect(stateTimelineLanes(missing, defaults)).toEqual([]);
  });

  it('collapses a series with a single constant value into one segment', () => {
    const [lane] = stateTimelineLanes(
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
    expect(lane?.segments).toHaveLength(1);
    // The single segment spans the whole series: first sample time to last sample time.
    expect(lane?.segments[0]).toMatchObject({ startTime: 0, endTime: 20, value: 1 });
  });

  it('splits alternating values into one segment per run', () => {
    const [lane] = stateTimelineLanes(
      matrix([
        {
          metric: { __name__: 'state' },
          values: [
            [0, 0],
            [10, 1],
            [20, 0],
            [30, 1],
          ],
        },
      ]),
      defaults,
    );
    // Four distinct runs -> four segments. Each segment ends where the next run starts;
    // the last segment ends at the series' final sample time.
    expect(lane?.segments).toEqual([
      { startTime: 0, endTime: 10, value: 0, displayValue: '0' },
      { startTime: 10, endTime: 20, value: 1, displayValue: '1' },
      { startTime: 20, endTime: 30, value: 0, displayValue: '0' },
      { startTime: 30, endTime: 30, value: 1, displayValue: '1' },
    ]);
  });

  it('merges consecutive equal values into a single segment spanning the run', () => {
    const [lane] = stateTimelineLanes(
      matrix([
        {
          metric: { __name__: 'state' },
          values: [
            [0, 5],
            [10, 5],
            [20, 5],
            [30, 9],
            [40, 9],
          ],
        },
      ]),
      defaults,
    );
    expect(lane?.segments).toEqual([
      { startTime: 0, endTime: 30, value: 5, displayValue: '5' },
      { startTime: 30, endTime: 40, value: 9, displayValue: '9' },
    ]);
  });

  it('formats the display value through the field config unit', () => {
    const [lane] = stateTimelineLanes(matrix([{ metric: { __name__: 'bytes' }, values: [[0, 2048]] }]), { unit: 'bytes', mappings: [] });
    // 2048 bytes formats to "2 KiB" under the bytes unit — proves formatValue is wired
    // with the panel's defaults, not a raw number.
    expect(lane?.segments[0]?.displayValue).toBe('2 KiB');
  });

  it('drops samples whose value is not finite, keeping the run structure intact', () => {
    const [lane] = stateTimelineLanes(
      matrix([
        {
          metric: { __name__: 'state' },
          values: [
            [0, 1],
            [10, Number.NaN],
            [20, 1],
          ],
        },
      ]),
      defaults,
    );
    // The NaN sample is skipped; the two surrounding 1s merge into one continuous run.
    expect(lane?.segments).toEqual([{ startTime: 0, endTime: 20, value: 1, displayValue: '1' }]);
  });

  it('produces no segments for an empty series but still emits the lane', () => {
    const lanes = stateTimelineLanes(matrix([{ metric: { __name__: 'empty' }, values: [] }]), defaults);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.label).toBe('empty');
    expect(lanes[0]?.segments).toEqual([]);
  });

  it('builds one lane per series, in order', () => {
    const lanes = stateTimelineLanes(
      matrix([
        { metric: { __name__: 'a' }, values: [[0, 1]] },
        { metric: { __name__: 'b' }, values: [[0, 0]] },
        { metric: { instance: 'host-1' }, values: [[0, 2]] },
      ]),
      defaults,
    );
    expect(lanes.map(l => l.label)).toEqual(['a', 'b', 'host-1']);
    expect(lanes.every(l => l.segments.length === 1)).toBe(true);
  });
});

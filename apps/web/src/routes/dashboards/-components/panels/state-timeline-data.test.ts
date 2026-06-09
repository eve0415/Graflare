import type { PanelDataResult } from './use-panel-data';
import type { FieldConfig, FieldConfigDefaults } from '@graflare/shared/schemas/field-config';

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

// Wrap a defaults block in a no-overrides field config — the regression case (every lane
// resolves to this defaults reference, so formatting/colour is identical to before).
const noOverrides = (defaults: FieldConfigDefaults): FieldConfig => ({ defaults, overrides: [] });

const defaults: FieldConfigDefaults = { unit: 'short', mappings: [] };
const config = noOverrides(defaults);

describe('stateTimelineLanes', () => {
  it('returns no lanes for null/undefined data', () => {
    const missing: PanelDataResult[] | undefined = undefined;
    expect(stateTimelineLanes(null, config)).toEqual([]);
    expect(stateTimelineLanes(missing, config)).toEqual([]);
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
      config,
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
      config,
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
      config,
    );
    expect(lane?.segments).toEqual([
      { startTime: 0, endTime: 30, value: 5, displayValue: '5' },
      { startTime: 30, endTime: 40, value: 9, displayValue: '9' },
    ]);
  });

  it('formats the display value through the field config unit', () => {
    const [lane] = stateTimelineLanes(matrix([{ metric: { __name__: 'bytes' }, values: [[0, 2048]] }]), noOverrides({ unit: 'bytes', mappings: [] }));
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
      config,
    );
    // The NaN sample is skipped; the two surrounding 1s merge into one continuous run.
    expect(lane?.segments).toEqual([{ startTime: 0, endTime: 20, value: 1, displayValue: '1' }]);
  });

  it('produces no segments for an empty series but still emits the lane', () => {
    const lanes = stateTimelineLanes(matrix([{ metric: { __name__: 'empty' }, values: [] }]), config);
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
      config,
    );
    expect(lanes.map(l => l.label)).toEqual(['a', 'b', 'host-1']);
    expect(lanes.every(l => l.segments.length === 1)).toBe(true);
  });

  it('resolves the defaults config reference for every lane when overrides is empty', () => {
    // Byte-equivalence at the data layer: a no-override resolve hands every lane the SAME
    // defaults object, so the display formatting AND the colour mappings are unchanged.
    const lanes = stateTimelineLanes(
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
    // `bytes` formats its display value through the bytes unit; `plain` keeps the
    // defaults reference. The override changes only the matched lane.
    const overridden: FieldConfig = {
      defaults: { unit: 'short', mappings: [] },
      overrides: [{ matcher: { id: 'byName', options: 'bytes' }, properties: [{ id: 'unit', value: 'bytes' }] }],
    };
    const lanes = stateTimelineLanes(
      matrix([
        { metric: { __name__: 'bytes' }, values: [[0, 2048]] },
        { metric: { __name__: 'plain' }, values: [[0, 2048]] },
      ]),
      overridden,
    );
    expect(lanes[0]?.segments[0]?.displayValue).toBe('2 KiB');
    expect(lanes[0]?.config.unit).toBe('bytes');
    expect(lanes[1]?.config).toBe(overridden.defaults);
  });

  it('carries a byName mappings override on the matched lane (drives the renderer colour path)', () => {
    // A mappings override is what recolours a lane: the lane carries its own resolved
    // mappings so the SVG's stateColor uses them, not the panel defaults. (formatValue
    // handles only unit/decimals — mappings never touch displayValue here, only colour.)
    const mappings = [{ type: 'value' as const, value: '1', result: { text: 'UP', color: '#0f0' } }];
    const overridden: FieldConfig = {
      defaults: { unit: 'short', mappings: [] },
      overrides: [{ matcher: { id: 'byName', options: 'state' }, properties: [{ id: 'mappings', value: mappings }] }],
    };
    const [lane] = stateTimelineLanes(matrix([{ metric: { __name__: 'state' }, values: [[0, 1]] }]), overridden);
    // The resolved mappings ride on the lane (so stateColor recolours only this lane);
    // displayValue still follows the unit, unchanged by the mapping.
    expect(lane?.config.mappings).toEqual(mappings);
    expect(lane?.segments[0]?.displayValue).toBe('1');
  });
});

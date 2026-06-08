import type { Annotation } from '@graflare/shared/schemas/annotation';

import { describe, expect, it } from 'vitest';

import { ANNOTATION_COLORS, annotationMarkers } from './annotations-plugin';

// The API returns annotation `time`/`timeEnd` as epoch MILLISECONDS (the schema's
// `z.int()`, materialised from the DB's `timestamp_ms` Date via `.getTime()`), while
// the chart x-axis is epoch SECONDS (Prometheus sample timestamps). The pure mapper
// converts ms -> s and filters to the visible window; the canvas draw is untestable
// under jsdom, so only this mapping is covered here.

const base: Omit<Annotation, 'time'> = {
  id: '11111111-1111-4111-8111-111111111111',
  orgId: 'org-1',
  text: 'deploy',
  tags: [],
  createdAt: 1_700_000_000_000,
};

const annotation = (overrides: Partial<Annotation>): Annotation => ({ ...base, time: 1_700_000_000_000, ...overrides });

describe('annotationMarkers', () => {
  it('converts epoch-ms time to epoch-seconds for the chart axis', () => {
    const markers = annotationMarkers([annotation({ time: 1_700_000_000_000 })], 1_699_999_000, 1_700_001_000);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.time).toBe(1_700_000_000);
    expect(markers[0]?.timeEnd).toBeUndefined();
    expect(markers[0]?.text).toBe('deploy');
  });

  it('converts a ranged annotation timeEnd to seconds', () => {
    const markers = annotationMarkers([annotation({ time: 1_700_000_000_000, timeEnd: 1_700_000_600_000 })], 1_699_999_000, 1_700_001_000);
    expect(markers[0]?.time).toBe(1_700_000_000);
    expect(markers[0]?.timeEnd).toBe(1_700_000_600);
  });

  it('returns an empty array for no annotations', () => {
    expect(annotationMarkers([], 0, 1000)).toEqual([]);
  });

  it('drops point annotations outside the window', () => {
    const before = annotation({ time: 1_699_000_000_000 });
    const after = annotation({ time: 1_701_000_000_000 });
    expect(annotationMarkers([before, after], 1_699_999_000, 1_700_001_000)).toEqual([]);
  });

  it('keeps a point annotation exactly on each window boundary (inclusive)', () => {
    const onFrom = annotation({ id: '22222222-2222-4222-8222-222222222222', time: 1_699_999_000_000 });
    const onTo = annotation({ id: '33333333-3333-4333-8333-333333333333', time: 1_700_001_000_000 });
    const markers = annotationMarkers([onFrom, onTo], 1_699_999_000, 1_700_001_000);
    expect(markers.map(m => m.time)).toEqual([1_699_999_000, 1_700_001_000]);
  });

  it('includes a ranged annotation that starts before the window but overlaps it', () => {
    // Starts well before `from`, ends inside the window -> the band is partly visible,
    // so it must be kept. A naive `time`-in-window filter would wrongly drop it.
    const spanning = annotation({ time: 1_699_900_000_000, timeEnd: 1_700_000_100_000 });
    const markers = annotationMarkers([spanning], 1_699_999_000, 1_700_001_000);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.time).toBe(1_699_900_000);
    expect(markers[0]?.timeEnd).toBe(1_700_000_100);
  });

  it('drops a ranged annotation that ends before the window starts', () => {
    const past = annotation({ time: 1_698_000_000_000, timeEnd: 1_699_000_000_000 });
    expect(annotationMarkers([past], 1_699_999_000, 1_700_001_000)).toEqual([]);
  });

  it('colors alert annotations by newState (Firing/Pending alarm, Normal/Resolved ok)', () => {
    const firing = annotation({ id: '44444444-4444-4444-8444-444444444444', time: 1_700_000_000_000, newState: 'Firing' });
    const pending = annotation({ id: '55555555-5555-4555-8555-555555555555', time: 1_700_000_000_000, newState: 'Pending' });
    const normal = annotation({ id: '66666666-6666-4666-8666-666666666666', time: 1_700_000_000_000, newState: 'Normal' });
    const resolved = annotation({ id: '77777777-7777-4777-8777-777777777777', time: 1_700_000_000_000, newState: 'Resolved' });
    const markers = annotationMarkers([firing, pending, normal, resolved], 1_699_999_000, 1_700_001_000);
    expect(markers[0]?.color).toBe(ANNOTATION_COLORS.alarm);
    expect(markers[1]?.color).toBe(ANNOTATION_COLORS.alarm);
    expect(markers[2]?.color).toBe(ANNOTATION_COLORS.ok);
    expect(markers[3]?.color).toBe(ANNOTATION_COLORS.ok);
  });

  it('uses the neutral accent for non-alert annotations (no newState)', () => {
    const markers = annotationMarkers([annotation({ time: 1_700_000_000_000 })], 1_699_999_000, 1_700_001_000);
    expect(markers[0]?.color).toBe(ANNOTATION_COLORS.neutral);
  });
});

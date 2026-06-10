import type { GridPos, Panel } from '../schemas/panel';
import type { Variable } from '../schemas/variable';

import { describe, expect, it } from 'vitest';

import { panelSchema } from '../schemas/panel';
import { variableSchema } from '../schemas/variable';

import { expandRepeats } from './repeat';

const mkPanel = (id: string, gridPos: GridPos, over: { repeat?: string; repeatDirection?: 'h' | 'v'; maxPerRow?: number } = {}): Panel =>
  panelSchema.parse({ id, type: 'timeseries', title: id, gridPos, ...over });

const mkVariable = (name: string, over: { multi?: boolean; includeAll?: boolean } = {}): Variable => variableSchema.parse({ name, type: 'custom', ...over });

const pos = (x: number, y: number, w: number, h: number): GridPos => ({ x, y, w, h });

describe('expandRepeats — non-repeat panels', () => {
  it('passes a non-repeat panel through untouched, sharing the original map identity', () => {
    const panel = mkPanel('a', pos(0, 0, 12, 8));
    const values = new Map<string, string | string[]>([['job', 'node']]);
    const out = expandRepeats([panel], [], values);
    expect(out).toHaveLength(1);
    expect(out[0]?.panel).toBe(panel);
    expect(out[0]?.values).toBe(values);
    expect(out[0]?.key).toBe('a');
    expect(out[0]?.isRepeatClone).toBe(false);
    expect(out[0]?.sourceId).toBe('a');
  });

  it('returns an empty list for no panels', () => {
    expect(expandRepeats([], [], new Map())).toEqual([]);
  });
});

describe('expandRepeats — horizontal layout', () => {
  it('balances 5 values at maxPerRow 4 into a 2×3 grid of width-8 slots on the full band', () => {
    const panel = mkPanel('p', pos(3, 2, 6, 4), { repeat: 'host', maxPerRow: 4 });
    const values = new Map<string, string | string[]>([['host', ['h1', 'h2', 'h3', 'h4', 'h5']]]);
    const out = expandRepeats([panel], [mkVariable('host', { multi: true })], values);
    expect(out).toHaveLength(5);
    // The source's own x/w are overridden by slot 0 of the 24-wide band.
    expect(out.map(r => r.panel.gridPos)).toEqual([
      { x: 0, y: 2, w: 8, h: 4 },
      { x: 8, y: 2, w: 8, h: 4 },
      { x: 16, y: 2, w: 8, h: 4 },
      { x: 0, y: 6, w: 8, h: 4 },
      { x: 8, y: 6, w: 8, h: 4 },
    ]);
  });

  it('distributes the remainder width over the leading columns (5 values at maxPerRow 5)', () => {
    const panel = mkPanel('p', pos(0, 0, 12, 8), { repeat: 'host', maxPerRow: 5 });
    const values = new Map<string, string | string[]>([['host', ['h1', 'h2', 'h3', 'h4', 'h5']]]);
    const out = expandRepeats([panel], [mkVariable('host', { multi: true })], values);
    expect(out.map(r => r.panel.gridPos)).toEqual([
      { x: 0, y: 0, w: 5, h: 8 },
      { x: 5, y: 0, w: 5, h: 8 },
      { x: 10, y: 0, w: 5, h: 8 },
      { x: 15, y: 0, w: 5, h: 8 },
      { x: 20, y: 0, w: 4, h: 8 },
    ]);
  });

  it('scopes every instance — including the source at index 0 — to its single value', () => {
    const panel = mkPanel('p', pos(0, 0, 12, 8), { repeat: 'host' });
    const values = new Map<string, string | string[]>([
      ['host', ['h1', 'h2']],
      ['job', 'node'],
    ]);
    const out = expandRepeats([panel], [mkVariable('host', { multi: true })], values);
    expect(out[0]?.values.get('host')).toEqual(['h1']);
    expect(out[1]?.values.get('host')).toEqual(['h2']);
    // The rest of the map is carried into each scoped copy; the shared map is not mutated.
    expect(out[0]?.values.get('job')).toBe('node');
    expect(values.get('host')).toEqual(['h1', 'h2']);
    expect(out[0]?.key).toBe('p');
    expect(out[0]?.isRepeatClone).toBe(false);
    expect(out[1]?.key).toBe('p:repeat:h2');
    expect(out[1]?.isRepeatClone).toBe(true);
    expect(out[1]?.sourceId).toBe('p');
  });

  it('forces a one-value repeat onto the full-width band slot with no clones, still scoped', () => {
    const panel = mkPanel('p', pos(2, 0, 6, 4), { repeat: 'host' });
    const out = expandRepeats([panel], [mkVariable('host')], new Map([['host', 'only']]));
    expect(out).toHaveLength(1);
    expect(out[0]?.panel.gridPos).toEqual({ x: 0, y: 0, w: 24, h: 4 });
    expect(out[0]?.key).toBe('p');
    expect(out[0]?.isRepeatClone).toBe(false);
    expect(out[0]?.values.get('host')).toBe('only');
  });
});

describe('expandRepeats — vertical layout', () => {
  it('stacks instances downward, keeping the source x/w', () => {
    const panel = mkPanel('p', pos(6, 1, 10, 5), { repeat: 'env', repeatDirection: 'v' });
    const values = new Map<string, string | string[]>([['env', ['dev', 'stage', 'prod']]]);
    const out = expandRepeats([panel], [mkVariable('env', { multi: true })], values);
    expect(out.map(r => r.panel.gridPos)).toEqual([
      { x: 6, y: 1, w: 10, h: 5 },
      { x: 6, y: 6, w: 10, h: 5 },
      { x: 6, y: 11, w: 10, h: 5 },
    ]);
    expect(out.map(r => r.key)).toEqual(['p', 'p:repeat:stage', 'p:repeat:prod']);
  });
});

describe('expandRepeats — y-shifting', () => {
  it('shifts later panels down by the added block height, leaving earlier panels alone', () => {
    const above = mkPanel('above', pos(0, 0, 24, 2));
    const left = mkPanel('left', pos(0, 2, 6, 4));
    const src = mkPanel('src', pos(6, 2, 6, 4), { repeat: 'env', repeatDirection: 'v' });
    const below = mkPanel('below', pos(0, 6, 24, 3));
    const values = new Map<string, string | string[]>([['env', ['a', 'b', 'c']]]);
    const out = expandRepeats([above, left, src, below], [mkVariable('env', { multi: true })], values);
    expect(out.map(r => r.key)).toEqual(['above', 'left', 'src', 'src:repeat:b', 'src:repeat:c', 'below']);
    // A panel above the repeat does not move; neither does one at the same y to its left.
    expect(out[0]?.panel).toBe(above);
    expect(out[1]?.panel).toBe(left);
    // The repeat grew from h=4 to 3*4=12, so the panel below moves down by 2*h = 8.
    const shifted = out.at(5);
    expect(shifted?.panel.gridPos).toEqual({ x: 0, y: 14, w: 24, h: 3 });
    // The shifted passthrough still shares the original values map and keeps its key.
    expect(shifted?.values).toBe(values);
    expect(shifted?.key).toBe('below');
    expect(shifted?.isRepeatClone).toBe(false);
  });

  it('accumulates the shift across two stacked repeat panels', () => {
    const a = mkPanel('a', pos(0, 0, 12, 4), { repeat: 'env', repeatDirection: 'v' });
    const b = mkPanel('b', pos(0, 4, 12, 4), { repeat: 'host', repeatDirection: 'v' });
    const plain = mkPanel('plain', pos(0, 8, 24, 2));
    const values = new Map<string, string | string[]>([
      ['env', ['e1', 'e2', 'e3']],
      ['host', ['h1', 'h2']],
    ]);
    const variables = [mkVariable('env', { multi: true }), mkVariable('host', { multi: true })];
    const out = expandRepeats([a, b, plain], variables, values);
    expect(out.map(r => [r.key, r.panel.gridPos.y])).toEqual([
      ['a', 0],
      ['a:repeat:e2', 4],
      ['a:repeat:e3', 8],
      ['b', 12],
      ['b:repeat:h2', 16],
      ['plain', 20],
    ]);
  });
});

describe('expandRepeats — placeholder cases', () => {
  it('renders one placeholder scoped to the empty string when the value is missing from the map', () => {
    const panel = mkPanel('p', pos(3, 1, 6, 4), { repeat: 'env' });
    const out = expandRepeats([panel], [mkVariable('env')], new Map());
    expect(out).toHaveLength(1);
    // The original gridPos is untouched (no band forcing), so the original object is reused.
    expect(out[0]?.panel).toBe(panel);
    expect(out[0]?.key).toBe('p');
    expect(out[0]?.isRepeatClone).toBe(false);
    expect(out[0]?.values.get('env')).toBe('');
  });

  it('treats an empty string and an empty array the same as a missing value', () => {
    const panel = mkPanel('p', pos(3, 1, 6, 4), { repeat: 'env' });
    const empties: (string | string[])[] = ['', []];
    for (const empty of empties) {
      const out = expandRepeats([panel], [mkVariable('env')], new Map([['env', empty]]));
      expect(out).toHaveLength(1);
      expect(out[0]?.panel).toBe(panel);
      expect(out[0]?.values.get('env')).toBe('');
    }
  });

  it('array-wraps the placeholder scope for a multi variable', () => {
    const panel = mkPanel('p', pos(0, 0, 12, 8), { repeat: 'env' });
    const out = expandRepeats([panel], [mkVariable('env', { multi: true })], new Map());
    expect(out[0]?.values.get('env')).toEqual(['']);
  });

  it('renders one placeholder when the repeat variable name is unknown, even if the map has a value', () => {
    const panel = mkPanel('p', pos(3, 1, 6, 4), { repeat: 'ghost' });
    const out = expandRepeats([panel], [], new Map([['ghost', ['a', 'b']]]));
    expect(out).toHaveLength(1);
    expect(out[0]?.panel).toBe(panel);
    expect(out[0]?.key).toBe('p');
    expect(out[0]?.values.get('ghost')).toBe('');
  });
});

describe('expandRepeats — value scoping by variable kind', () => {
  it('array-wraps the scoped value for multi and includeAll variables, bare string otherwise', () => {
    const panel = mkPanel('p', pos(0, 0, 12, 8), { repeat: 'v' });
    const values = new Map<string, string | string[]>([['v', ['a', 'b']]]);
    const multi = expandRepeats([panel], [mkVariable('v', { multi: true })], values);
    expect(multi[0]?.values.get('v')).toEqual(['a']);
    const all = expandRepeats([panel], [mkVariable('v', { includeAll: true })], values);
    expect(all[0]?.values.get('v')).toEqual(['a']);
    const single = expandRepeats([panel], [mkVariable('v')], values);
    expect(single[0]?.values.get('v')).toBe('a');
    expect(single[1]?.values.get('v')).toBe('b');
  });
});

describe('expandRepeats — keys', () => {
  it('encodes the value inside clone keys with encodeURIComponent', () => {
    const panel = mkPanel('p', pos(0, 0, 12, 8), { repeat: 'v' });
    const out = expandRepeats([panel], [mkVariable('v', { multi: true })], new Map([['v', ['first', 'a:b c']]]));
    expect(out[1]?.key).toBe('p:repeat:a%3Ab%20c');
  });

  it('cannot collide even when ids and values contain ":repeat:"', () => {
    // Without encoding, (id 'p1', value 'x:repeat:y') and (id 'p1:repeat:x', value 'y') would
    // both produce 'p1:repeat:x:repeat:y'. Encoding the value keeps them distinct.
    const p1 = mkPanel('p1', pos(0, 0, 12, 4), { repeat: 'v', repeatDirection: 'v' });
    const p2 = mkPanel('p1:repeat:x', pos(0, 50, 12, 4), { repeat: 'v', repeatDirection: 'v' });
    const values = new Map<string, string | string[]>([['v', ['z', 'x:repeat:y', 'y']]]);
    const out = expandRepeats([p1, p2], [mkVariable('v', { multi: true })], values);
    const keys = out.map(r => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('p1:repeat:x%3Arepeat%3Ay');
    expect(keys).toContain('p1:repeat:x:repeat:y');
  });
});

describe('expandRepeats — determinism', () => {
  it('produces the same ordered output for the same inputs, regardless of input order', () => {
    const src = mkPanel('src', pos(0, 0, 12, 4), { repeat: 'env', repeatDirection: 'v' });
    const below = mkPanel('below', pos(0, 4, 24, 2));
    const variables = [mkVariable('env', { multi: true })];
    const values = new Map<string, string | string[]>([['env', ['a', 'b']]]);
    const fromSorted = expandRepeats([src, below], variables, values);
    const fromReversed = expandRepeats([below, src], variables, values);
    expect(fromReversed).toEqual(fromSorted);
    expect(fromReversed.map(r => r.key)).toEqual(['src', 'src:repeat:b', 'below']);
  });
});

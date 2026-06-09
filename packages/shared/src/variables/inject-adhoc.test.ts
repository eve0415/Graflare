import type { AdhocFilter } from '../schemas/variable';

import { describe, expect, it } from 'vitest';

import { injectAdhocFilters } from './inject-adhoc';

const f = (key: string, operator: AdhocFilter['operator'], value: string): AdhocFilter => ({ key, operator, value });

const ENV = [f('env', '=', 'prod')];

describe('injectAdhocFilters — identity / no-op', () => {
  it('returns the query unchanged when filters is empty (byte-identical)', () => {
    const q = 'rate(http_requests_total[5m]) / sum(up) by (instance)';
    expect(injectAdhocFilters(q, [])).toBe(q);
  });

  it('returns the same string reference for empty filters (strict equality via toBe/Object.is)', () => {
    const q = 'up';
    // `.toBe` is Object.is, so this asserts the exact same string reference is returned unchanged.
    expect(injectAdhocFilters(q, [])).toBe(q);
  });

  it('leaves an empty query empty', () => {
    expect(injectAdhocFilters('', ENV)).toBe('');
  });

  it('leaves a whitespace-only query untouched', () => {
    expect(injectAdhocFilters('   ', ENV)).toBe('   ');
  });

  it('does not touch a query with no vector selectors (scalar literal)', () => {
    expect(injectAdhocFilters('42', ENV)).toBe('42');
  });

  it('returns the query unchanged when every filter has a blank key (would be invalid PromQL)', () => {
    // A partially-built chip (key not yet chosen) must not inject `up{="x"}`.
    expect(injectAdhocFilters('up', [f('', '=', 'x')])).toBe('up');
  });

  it('skips blank-key filters but still injects the valid ones (no `,=""` corruption)', () => {
    expect(injectAdhocFilters('up', [f('env', '=', 'prod'), f('', '=', 'x')])).toBe('up{env="prod"}');
  });
});

describe('injectAdhocFilters — bare metric selectors', () => {
  it('adds a matcher to a bare metric', () => {
    expect(injectAdhocFilters('up', ENV)).toBe('up{env="prod"}');
  });

  it('adds a matcher to a metric with a colon (recording-rule name)', () => {
    expect(injectAdhocFilters('job:rate5m', ENV)).toBe('job:rate5m{env="prod"}');
  });

  it('adds a matcher inside a range vector, before the [..] selector', () => {
    expect(injectAdhocFilters('http_requests_total[5m]', ENV)).toBe('http_requests_total{env="prod"}[5m]');
  });
});

describe('injectAdhocFilters — existing label set', () => {
  it('appends to a non-empty matcher set with a comma', () => {
    expect(injectAdhocFilters('up{job="api"}', ENV)).toBe('up{job="api",env="prod"}');
  });

  it('appends without a comma to an empty matcher set', () => {
    expect(injectAdhocFilters('up{}', ENV)).toBe('up{env="prod"}');
  });

  it('appends inside a range vector that already has matchers', () => {
    expect(injectAdhocFilters('http_requests_total{job="api"}[5m]', ENV)).toBe('http_requests_total{job="api",env="prod"}[5m]');
  });

  it('appends multiple filters in order', () => {
    const filters = [f('env', '=', 'prod'), f('region', '=', 'us')];
    expect(injectAdhocFilters('up{job="api"}', filters)).toBe('up{job="api",env="prod",region="us"}');
  });
});

describe('injectAdhocFilters — the four operators', () => {
  it('= equality', () => {
    expect(injectAdhocFilters('up', [f('env', '=', 'prod')])).toBe('up{env="prod"}');
  });

  it('!= negative equality', () => {
    expect(injectAdhocFilters('up', [f('env', '!=', 'prod')])).toBe('up{env!="prod"}');
  });

  it('=~ regex match', () => {
    expect(injectAdhocFilters('up', [f('env', '=~', 'prod|staging')])).toBe('up{env=~"prod|staging"}');
  });

  it('!~ negative regex match', () => {
    expect(injectAdhocFilters('up', [f('env', '!~', 'dev.*')])).toBe('up{env!~"dev.*"}');
  });
});

describe('injectAdhocFilters — value escaping', () => {
  it('escapes a double quote in the value', () => {
    expect(injectAdhocFilters('up', [f('label', '=', 'a"b')])).toBe(String.raw`up{label="a\"b"}`);
  });

  it('escapes a backslash in the value', () => {
    expect(injectAdhocFilters('up', [f('path', '=', String.raw`C:\tmp`)])).toBe(String.raw`up{path="C:\\tmp"}`);
  });

  it('escapes backslash then quote together (order: backslash first)', () => {
    // value: \"  →  \\\"
    expect(injectAdhocFilters('up', [f('l', '=', String.raw`\"`)])).toBe(String.raw`up{l="\\\""}`);
  });

  it('handles an empty value', () => {
    expect(injectAdhocFilters('up', [f('env', '=', '')])).toBe('up{env=""}');
  });
});

describe('injectAdhocFilters — multiple selectors in one expression', () => {
  it('injects into both operands of a binary expression', () => {
    expect(injectAdhocFilters('rate(a[5m]) / b', ENV)).toBe('rate(a{env="prod"}[5m]) / b{env="prod"}');
  });

  it('injects into every selector inside a function call', () => {
    expect(injectAdhocFilters('sum(rate(a[5m])) + sum(rate(c[5m]))', ENV)).toBe('sum(rate(a{env="prod"}[5m])) + sum(rate(c{env="prod"}[5m]))');
  });

  it('injects into a selector that already has matchers alongside a bare one', () => {
    expect(injectAdhocFilters('a{x="1"} + b', ENV)).toBe('a{x="1",env="prod"} + b{env="prod"}');
  });
});

describe('injectAdhocFilters — functions are not selectors', () => {
  it('does not treat a function name as a metric', () => {
    expect(injectAdhocFilters('rate(up[5m])', ENV)).toBe('rate(up{env="prod"}[5m])');
  });

  it('does not treat nested aggregation names as metrics', () => {
    expect(injectAdhocFilters('histogram_quantile(0.9, sum(rate(d[5m])))', ENV)).toBe('histogram_quantile(0.9, sum(rate(d{env="prod"}[5m])))');
  });

  it('handles whitespace between a function name and its paren', () => {
    expect(injectAdhocFilters('sum (up)', ENV)).toBe('sum (up{env="prod"})');
  });
});

describe('injectAdhocFilters — grouping clauses are NOT selectors (corruption guard)', () => {
  it('does not inject into a by(...) label list', () => {
    expect(injectAdhocFilters('sum by (instance) (up)', ENV)).toBe('sum by (instance) (up{env="prod"})');
  });

  it('does not inject into a without(...) label list', () => {
    expect(injectAdhocFilters('sum without (job) (up)', ENV)).toBe('sum without (job) (up{env="prod"})');
  });

  it('does not inject into on(...) / group_left(...) of a binary op', () => {
    const q = 'a * on (instance) group_left (role) b';
    expect(injectAdhocFilters(q, ENV)).toBe('a{env="prod"} * on (instance) group_left (role) b{env="prod"}');
  });

  it('does not inject into ignoring(...)', () => {
    expect(injectAdhocFilters('a / ignoring (le) b', ENV)).toBe('a{env="prod"} / ignoring (le) b{env="prod"}');
  });

  it('handles by-clause AFTER the aggregation: sum(up) by (instance)', () => {
    expect(injectAdhocFilters('sum(up) by (instance)', ENV)).toBe('sum(up{env="prod"}) by (instance)');
  });
});

describe('injectAdhocFilters — string awareness', () => {
  it('does not inject inside a double-quoted string literal', () => {
    // label_replace's last arg is a string; the bare word inside the quotes must not be touched.
    const q = 'label_replace(up, "foo", "bar", "instance", "(.*)")';
    expect(injectAdhocFilters(q, ENV)).toBe('label_replace(up{env="prod"}, "foo", "bar", "instance", "(.*)")');
  });

  it('does not inject inside a single-quoted string literal', () => {
    const q = "up{job='node'}";
    expect(injectAdhocFilters(q, ENV)).toBe('up{job=\'node\',env="prod"}');
  });

  it('finds the real closing brace when a value contains a }', () => {
    // existing matcher value contains a literal '}' — the scanner must not stop early.
    expect(injectAdhocFilters('up{re="a}b"}', ENV)).toBe('up{re="a}b",env="prod"}');
  });

  it('finds the real closing brace when a value contains an escaped quote', () => {
    expect(injectAdhocFilters(String.raw`up{l="a\"}"}`, ENV)).toBe(String.raw`up{l="a\"}",env="prod"}`);
  });
});

describe('injectAdhocFilters — documented punts (returned UNCHANGED, never mangled)', () => {
  it('leaves a name-less selector {__name__="up"} unchanged', () => {
    // A leading `{...}` with no metric name is a valid selector but our injector punts on it
    // rather than risk corrupting the matcher list ordering.
    const q = '{__name__="up"}';
    expect(injectAdhocFilters(q, ENV)).toBe(q);
  });

  it('does not double-inject; the bare metric still gets exactly one matcher set', () => {
    // sanity: a name-less selector punt does not suppress injection on a real metric elsewhere.
    expect(injectAdhocFilters('{__name__="up"} + node_load1', ENV)).toBe('{__name__="up"} + node_load1{env="prod"}');
  });

  it('injects the instant-vector part of a subquery but leaves the [1h:5m] range untouched', () => {
    // subquery: the inner selector is still a normal vector selector; the [1h:5m] is a duration.
    expect(injectAdhocFilters('rate(up[5m])[1h:5m]', ENV)).toBe('rate(up{env="prod"}[5m])[1h:5m]');
  });

  it('handles @ modifier and offset without corrupting them', () => {
    expect(injectAdhocFilters('up @ 1609459200', ENV)).toBe('up{env="prod"} @ 1609459200');
    expect(injectAdhocFilters('up offset 5m', ENV)).toBe('up{env="prod"} offset 5m');
  });
});

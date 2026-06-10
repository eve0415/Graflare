import type { PanelQuery } from '../schemas/panel';

import { describe, expect, it } from 'vitest';

import { interpolateAndInjectQueries, interpolateQueries, interpolateVariables } from './interpolate';

// Build "${name}" at runtime to avoid triggering no-template-curly-in-string.
const braced = (name: string): string => ['$', '{', name, '}'].join('');

// Build "${name" (unclosed) at runtime.
const unclosed = (name: string): string => ['$', '{', name].join('');

const query = (expr: string): PanelQuery => ({ refId: 'A', expr, legendFormat: '', format: 'time_series' });

describe('interpolateVariables', () => {
  it('replaces a single bare variable', () => {
    const vars = new Map([['job', 'prometheus']]);
    expect(interpolateVariables('up{job="$job"}', vars)).toBe('up{job="prometheus"}');
  });

  it('replaces multiple different variables', () => {
    const vars = new Map<string, string | string[]>([
      ['job', 'node'],
      ['instance', 'localhost:9090'],
    ]);
    expect(interpolateVariables('up{job="$job", instance="$instance"}', vars)).toBe('up{job="node", instance="localhost:9090"}');
  });

  it('replaces braced syntax', () => {
    const vars = new Map([['metric', 'cpu_usage']]);
    expect(interpolateVariables(`${braced('metric')}_total`, vars)).toBe('cpu_usage_total');
  });

  it('joins multi-value variables with pipe inside parentheses', () => {
    const vars = new Map<string, string | string[]>([['instance', ['host1', 'host2', 'host3']]]);
    expect(interpolateVariables('up{instance=~"$instance"}', vars)).toBe('up{instance=~"(host1|host2|host3)"}');
  });

  it('joins multi-value variables in braced syntax', () => {
    const vars = new Map<string, string | string[]>([['env', ['staging', 'prod']]]);
    expect(interpolateVariables(`up{env=~"${braced('env')}"}`, vars)).toBe('up{env=~"(staging|prod)"}');
  });

  it('leaves unknown bare variables as-is', () => {
    const vars = new Map<string, string | string[]>();
    expect(interpolateVariables('$missing', vars)).toBe('$missing');
  });

  it('leaves unknown braced variables as-is', () => {
    const vars = new Map<string, string | string[]>();
    expect(interpolateVariables(braced('missing'), vars)).toBe(braced('missing'));
  });

  it('replaces escaped $$ with a literal $', () => {
    const vars = new Map([['x', 'val']]);
    expect(interpolateVariables('cost is $$100 and $x', vars)).toBe('cost is $100 and val');
  });

  it('does not replace variables inside single-quoted strings', () => {
    const vars = new Map([['label', 'replaced']]);
    expect(interpolateVariables("metric{label=~'$label'} + $label", vars)).toBe("metric{label=~'$label'} + replaced");
  });

  it('handles $__interval special variable via map lookup', () => {
    const vars = new Map([['__interval', '15s']]);
    expect(interpolateVariables('rate(metric[$__interval])', vars)).toBe('rate(metric[15s])');
  });

  it('handles $__rate_interval special variable via map lookup', () => {
    const vars = new Map([['__rate_interval', '1m']]);
    expect(interpolateVariables('rate(metric[$__rate_interval])', vars)).toBe('rate(metric[1m])');
  });

  it('returns the expression unchanged with an empty map', () => {
    const vars = new Map<string, string | string[]>();
    const expr = 'up{job="prometheus"}';
    expect(interpolateVariables(expr, vars)).toBe(expr);
  });

  it('does not substitute a prefix when a longer variable name exists', () => {
    const vars = new Map<string, string | string[]>([['host', 'server1']]);
    // $hostname must NOT be partially replaced to "server1name"
    expect(interpolateVariables('$hostname', vars)).toBe('$hostname');
  });

  it('replaces both when shorter and longer names are in the map', () => {
    const vars = new Map<string, string | string[]>([
      ['host', 'server1'],
      ['hostname', 'server1.example.com'],
    ]);
    expect(interpolateVariables('$host and $hostname', vars)).toBe('server1 and server1.example.com');
  });

  it('handles an unclosed brace as a literal $', () => {
    const vars = new Map([['foo', 'bar']]);
    const input = unclosed('foo');
    expect(interpolateVariables(input, vars)).toBe(input);
  });

  it('handles a lone trailing $', () => {
    const vars = new Map<string, string | string[]>();
    expect(interpolateVariables('end$', vars)).toBe('end$');
  });

  it('handles an empty expression', () => {
    const vars = new Map([['x', 'v']]);
    expect(interpolateVariables('', vars)).toBe('');
  });

  it('handles single-quoted string that opens and closes', () => {
    const vars = new Map([['x', 'replaced']]);
    expect(interpolateVariables("'$x' $x", vars)).toBe("'$x' replaced");
  });

  it('handles $ followed by a non-word character', () => {
    const vars = new Map<string, string | string[]>();
    expect(interpolateVariables('$!bang', vars)).toBe('$!bang');
  });

  it('handles adjacent $$ and variable', () => {
    const vars = new Map([['x', 'v']]);
    expect(interpolateVariables('$$$x', vars)).toBe('$v');
  });

  it('replaces legacy [[name]] syntax', () => {
    const vars = new Map([['job', 'node']]);
    expect(interpolateVariables('up{job="[[job]]"}', vars)).toBe('up{job="node"}');
  });

  it('joins multi-value [[name]] with pipe inside parentheses', () => {
    const vars = new Map<string, string | string[]>([['env', ['staging', 'prod']]]);
    expect(interpolateVariables('up{env=~"[[env]]"}', vars)).toBe('up{env=~"(staging|prod)"}');
  });

  it('leaves unknown [[name]] as-is', () => {
    const vars = new Map<string, string | string[]>();
    expect(interpolateVariables('[[missing]]', vars)).toBe('[[missing]]');
  });

  it('does not touch a single-bracket PromQL range', () => {
    const vars = new Map([['m', '5m']]);
    expect(interpolateVariables('rate(metric[5m])', vars)).toBe('rate(metric[5m])');
  });

  it('does not replace [[name]] inside single-quoted strings', () => {
    const vars = new Map([['x', 'replaced']]);
    expect(interpolateVariables("metric{l='[[x]]'} + [[x]]", vars)).toBe("metric{l='[[x]]'} + replaced");
  });
});

describe('interpolateVariables — multi-value PromQL formatting', () => {
  // Grafana's prometheus rule: RE2-escape each value (backslash first, then the metacharacters),
  // join with '|', parenthesize only when there is more than one value.
  it('escapes every RE2 metacharacter in a multi-value element', () => {
    const cases: [string, string][] = [
      ['a$b', String.raw`a\$b`],
      ['a^b', String.raw`a\^b`],
      ['a*b', String.raw`a\*b`],
      ['a{b', String.raw`a\{b`],
      ['a}b', String.raw`a\}b`],
      ['a[b', String.raw`a\[b`],
      ['a]b', String.raw`a\]b`],
      ['a+b', String.raw`a\+b`],
      ['a?b', String.raw`a\?b`],
      ['a.b', String.raw`a\.b`],
      ['a(b', String.raw`a\(b`],
      ['a)b', String.raw`a\)b`],
      ['a|b', String.raw`a\|b`],
      [String.raw`a\b`, String.raw`a\\b`],
    ];
    for (const [raw, escaped] of cases) {
      const vars = new Map<string, string | string[]>([['v', [raw]]]);
      expect(interpolateVariables('$v', vars)).toBe(escaped);
    }
  });

  it('escapes the backslash first so combined values do not double-escape', () => {
    const vars = new Map<string, string | string[]>([['v', [String.raw`host.with*meta\chars`]]]);
    expect(interpolateVariables('$v', vars)).toBe(String.raw`host\.with\*meta\\chars`);
  });

  it('wraps in parentheses only when there is more than one value', () => {
    const vars = new Map<string, string | string[]>([
      ['two', ['a', 'b']],
      ['one', ['a']],
    ]);
    expect(interpolateVariables('$two', vars)).toBe('(a|b)');
    expect(interpolateVariables('$one', vars)).toBe('a');
  });

  it('escapes a single-element array without parentheses', () => {
    const vars = new Map<string, string | string[]>([['v', ['10.0.0.1:9090']]]);
    expect(interpolateVariables('$v', vars)).toBe(String.raw`10\.0\.0\.1:9090`);
  });

  it('escapes each element before joining so a value containing | stays one alternative', () => {
    const vars = new Map<string, string | string[]>([['v', ['a|b', 'c']]]);
    expect(interpolateVariables('$v', vars)).toBe(String.raw`(a\|b|c)`);
  });

  it('renders an empty array as an empty string', () => {
    const vars = new Map<string, string | string[]>([['v', []]]);
    expect(interpolateVariables('up{instance=~"$v"}', vars)).toBe('up{instance=~""}');
  });

  it('leaves plain-string values untouched, even when they contain metacharacters', () => {
    // Documented divergence from Grafana's regular-escape: single values are pasted raw.
    const vars = new Map<string, string | string[]>([['v', String.raw`a.b|c$d\e`]]);
    expect(interpolateVariables('$v', vars)).toBe(String.raw`a.b|c$d\e`);
  });
});

describe('interpolateQueries', () => {
  it('interpolates each query expr and preserves the other fields', () => {
    const vars = new Map([['job', 'node']]);
    const [result] = interpolateQueries([{ refId: 'B', expr: 'up{job="$job"}', legendFormat: '$job', format: 'table' }], vars);
    expect(result?.expr).toBe('up{job="node"}');
    expect(result?.refId).toBe('B');
    expect(result?.legendFormat).toBe('$job');
    expect(result?.format).toBe('table');
  });

  it('interpolates every query in the list', () => {
    const vars = new Map<string, string | string[]>([
      ['job', 'node'],
      ['env', ['staging', 'prod']],
    ]);
    const result = interpolateQueries([query('up{job="$job"}'), query('rate(req{env=~"$env"}[5m])')], vars);
    expect(result.map(q => q.expr)).toEqual(['up{job="node"}', 'rate(req{env=~"(staging|prod)"}[5m])']);
  });

  it('returns the queries unchanged with an empty variable map', () => {
    const vars = new Map<string, string | string[]>();
    const input = [query('up{job="prometheus"}')];
    expect(interpolateQueries(input, vars)).toEqual(input);
  });
});

describe('interpolateAndInjectQueries', () => {
  const noVars = new Map<string, string | string[]>();

  it('is byte-identical to interpolateQueries when there are no adhoc filters', () => {
    const vars = new Map<string, string | string[]>([['job', 'node']]);
    const input = [query('up{job="$job"}'), query('rate(req[5m]) / total')];
    expect(interpolateAndInjectQueries(input, vars, [])).toEqual(interpolateQueries(input, vars));
  });

  it('injects adhoc matchers into every selector after interpolation', () => {
    const vars = new Map<string, string | string[]>([['job', 'node']]);
    const result = interpolateAndInjectQueries([query('up{job="$job"}')], vars, [{ key: 'env', operator: '=', value: 'prod' }]);
    expect(result[0]?.expr).toBe('up{job="node",env="prod"}');
  });

  it('injects into a $var that expands to a bare metric name', () => {
    const vars = new Map<string, string | string[]>([['metric', 'http_requests_total']]);
    const result = interpolateAndInjectQueries([query('$metric')], vars, [{ key: 'env', operator: '=~', value: 'prod|staging' }]);
    expect(result[0]?.expr).toBe('http_requests_total{env=~"prod|staging"}');
  });

  it('preserves refId/legendFormat/format and leaves the input queries untouched', () => {
    const input = [{ refId: 'B', expr: 'up', legendFormat: 'L', format: 'table' } as const];
    const result = interpolateAndInjectQueries(input, noVars, [{ key: 'env', operator: '=', value: 'prod' }]);
    expect(result[0]).toEqual({ refId: 'B', expr: 'up{env="prod"}', legendFormat: 'L', format: 'table' });
    // The original query object is not mutated.
    expect(input[0]?.expr).toBe('up');
  });
});

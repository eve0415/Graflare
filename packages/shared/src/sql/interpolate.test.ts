import { describe, expect, it } from 'vitest';

import { interpolateSqlVariables } from './interpolate';

const braced = (name: string): string => ['$', '{', name, '}'].join('');

describe('interpolateSqlVariables', () => {
  it('replaces a single string variable with quoted value', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['host', 'server1']]);
    expect(interpolateSqlVariables('WHERE host = $host', vars)).toBe("WHERE host = 'server1'");
  });

  it('replaces a numeric variable without quotes', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['limit', 100]]);
    expect(interpolateSqlVariables('LIMIT $limit', vars)).toBe('LIMIT 100');
  });

  it('replaces braced syntax', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['table', 'metrics']]);
    expect(interpolateSqlVariables(`FROM ${braced('table')}`, vars)).toBe("FROM 'metrics'");
  });

  it('joins multi-value strings with comma for IN clause', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['names', ['alice', 'bob', 'charlie']]]);
    expect(interpolateSqlVariables('WHERE name IN ($names)', vars)).toBe("WHERE name IN ('alice', 'bob', 'charlie')");
  });

  it('joins multi-value numbers with comma', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['ids', [1, 2, 3]]]);
    expect(interpolateSqlVariables('WHERE id IN ($ids)', vars)).toBe('WHERE id IN (1, 2, 3)');
  });

  it('joins mixed string/number multi-value', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['vals', ['a', 1, 'b']]]);
    expect(interpolateSqlVariables('IN ($vals)', vars)).toBe("IN ('a', 1, 'b')");
  });

  it('escapes single quotes in string values', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['name', "O'Brien"]]);
    expect(interpolateSqlVariables('WHERE name = $name', vars)).toBe("WHERE name = 'O''Brien'");
  });

  it('escapes single quotes in multi-value strings', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['names', ["it's", "won't"]]]);
    expect(interpolateSqlVariables('IN ($names)', vars)).toBe("IN ('it''s', 'won''t')");
  });

  it('does not replace variables inside SQL string literals', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['x', 'replaced']]);
    expect(interpolateSqlVariables("'$x' || $x", vars)).toBe("'$x' || 'replaced'");
  });

  it('handles escaped single quotes inside string literals', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['x', 'val']]);
    expect(interpolateSqlVariables("'''$x''' || $x", vars)).toBe("'''$x''' || 'val'");
  });

  it('replaces escaped $$ with literal $', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['x', 'val']]);
    expect(interpolateSqlVariables('$$100 and $x', vars)).toBe("$100 and 'val'");
  });

  it('leaves unknown variables as-is', () => {
    const vars = new Map<string, string | number | (string | number)[]>();
    expect(interpolateSqlVariables('$missing', vars)).toBe('$missing');
  });

  it('leaves unknown braced variables as-is', () => {
    const vars = new Map<string, string | number | (string | number)[]>();
    expect(interpolateSqlVariables(braced('missing'), vars)).toBe(braced('missing'));
  });

  it('handles empty string', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['x', 'v']]);
    expect(interpolateSqlVariables('', vars)).toBe('');
  });

  it('handles lone trailing $', () => {
    const vars = new Map<string, string | number | (string | number)[]>();
    expect(interpolateSqlVariables('end$', vars)).toBe('end$');
  });

  it('handles unclosed brace as literal $', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['foo', 'bar']]);
    const input = ['$', '{', 'foo'].join('');
    expect(interpolateSqlVariables(input, vars)).toBe(input);
  });

  it('prevents SQL injection via variable value', () => {
    const vars = new Map<string, string | number | (string | number)[]>([['inject', "'; DROP TABLE users; --"]]);
    const result = interpolateSqlVariables('WHERE name = $inject', vars);
    expect(result).toBe("WHERE name = '''; DROP TABLE users; --'");
  });

  it('handles multiple variables in one query', () => {
    const vars = new Map<string, string | number | (string | number)[]>([
      ['dataset', 'workers'],
      ['limit', 10],
    ]);
    expect(interpolateSqlVariables('WHERE dataset = $dataset LIMIT $limit', vars)).toBe("WHERE dataset = 'workers' LIMIT 10");
  });
});

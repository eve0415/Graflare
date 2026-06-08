import type { SqlBuilderState } from './builder';

import { describe, expect, it } from 'vitest';

import { buildSql } from './builder';

const empty: SqlBuilderState = {
  table: '',
  columns: [],
  where: [],
  groupBy: [],
  orderBy: [],
  limit: undefined,
  timeColumn: '',
  timeGroupInterval: '',
};

describe('buildSql', () => {
  it('returns empty string when no table is selected', () => {
    expect(buildSql(empty)).toBe('');
  });

  it('generates SELECT * when no columns are specified', () => {
    expect(buildSql({ ...empty, table: 'metrics' })).toBe('SELECT *\nFROM metrics');
  });

  it('generates SELECT with specific columns', () => {
    expect(buildSql({ ...empty, table: 'metrics', columns: ['ts', 'value', 'host'] })).toBe('SELECT ts, value, host\nFROM metrics');
  });

  describe('wHERE clauses', () => {
    it('generates a single WHERE condition', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        where: [{ column: 'host', operator: '=', value: 'web-01' }],
      });
      expect(result).toBe("SELECT *\nFROM metrics\nWHERE host = 'web-01'");
    });

    it('generates multiple WHERE conditions with AND', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        where: [
          { column: 'host', operator: '=', value: 'web-01' },
          { column: 'value', operator: '>', value: '100' },
        ],
      });
      expect(result).toBe("SELECT *\nFROM metrics\nWHERE host = 'web-01'\n  AND value > '100'");
    });

    it('handles != operator', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        where: [{ column: 'status', operator: '!=', value: 'error' }],
      });
      expect(result).toContain("status != 'error'");
    });

    it('handles >= and <= operators', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        where: [
          { column: 'value', operator: '>=', value: '10' },
          { column: 'value', operator: '<=', value: '100' },
        ],
      });
      expect(result).toContain("value >= '10'");
      expect(result).toContain("value <= '100'");
    });

    it('handles LIKE operator', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        where: [{ column: 'host', operator: 'LIKE', value: '%web%' }],
      });
      expect(result).toContain("host LIKE '%web%'");
    });

    it('handles IN operator with multiple values', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        where: [{ column: 'region', operator: 'IN', value: 'us-east,us-west,eu-west' }],
      });
      expect(result).toContain("region IN ('us-east', 'us-west', 'eu-west')");
    });

    it('handles IS NULL without value', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        where: [{ column: 'deleted_at', operator: 'IS NULL', value: '' }],
      });
      expect(result).toContain('deleted_at IS NULL');
      expect(result).not.toContain("''");
    });

    it('handles IS NOT NULL without value', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        where: [{ column: 'host', operator: 'IS NOT NULL', value: '' }],
      });
      expect(result).toContain('host IS NOT NULL');
    });
  });

  describe('string escaping', () => {
    it('doubles single quotes in values', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        where: [{ column: 'name', operator: '=', value: "O'Brien" }],
      });
      expect(result).toContain("name = 'O''Brien'");
    });
  });

  describe('macro injection', () => {
    it('injects $__timeFilter when timeColumn is set', () => {
      const result = buildSql({ ...empty, table: 'metrics', timeColumn: 'ts' });
      expect(result).toContain('$__timeFilter(ts)');
      expect(result).toBe('SELECT *\nFROM metrics\nWHERE $__timeFilter(ts)');
    });

    it('injects $__timeFilter alongside other WHERE clauses', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        timeColumn: 'ts',
        where: [{ column: 'host', operator: '=', value: 'web-01' }],
      });
      expect(result).toContain("host = 'web-01'");
      expect(result).toContain('$__timeFilter(ts)');
    });

    it('injects $__timeGroup and $__time when both timeColumn and timeGroupInterval are set', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        columns: ['value'],
        timeColumn: 'ts',
        timeGroupInterval: '5m',
      });
      expect(result).toContain('$__time(ts)');
      expect(result).toContain('$__timeGroup(ts, 5m)');
      expect(result).toContain('$__timeFilter(ts)');
    });

    it('adds $__time to SELECT and $__timeGroup to GROUP BY', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        columns: ['avg(value)'],
        timeColumn: 'ts',
        timeGroupInterval: '1h',
        groupBy: ['region'],
      });
      expect(result).toMatch(/^SELECT \$__time\(ts\), avg\(value\)/);
      expect(result).toContain('GROUP BY $__timeGroup(ts, 1h), region');
    });
  });

  describe('gROUP BY', () => {
    it('generates GROUP BY clause', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        columns: ['host', 'count(*)'],
        groupBy: ['host'],
      });
      expect(result).toContain('GROUP BY host');
    });

    it('generates GROUP BY with multiple columns', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        groupBy: ['host', 'region'],
      });
      expect(result).toContain('GROUP BY host, region');
    });
  });

  describe('oRDER BY', () => {
    it('generates ORDER BY clause', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        orderBy: [{ column: 'ts', direction: 'DESC' }],
      });
      expect(result).toContain('ORDER BY ts DESC');
    });

    it('generates ORDER BY with multiple columns', () => {
      const result = buildSql({
        ...empty,
        table: 'metrics',
        orderBy: [
          { column: 'ts', direction: 'DESC' },
          { column: 'host', direction: 'ASC' },
        ],
      });
      expect(result).toContain('ORDER BY ts DESC, host ASC');
    });
  });

  describe('lIMIT', () => {
    it('generates LIMIT clause', () => {
      const result = buildSql({ ...empty, table: 'metrics', limit: 100 });
      expect(result).toContain('LIMIT 100');
    });

    it('omits LIMIT when undefined', () => {
      const result = buildSql({ ...empty, table: 'metrics' });
      expect(result).not.toContain('LIMIT');
    });
  });

  describe('complex query', () => {
    it('generates a full query with all clauses', () => {
      const result = buildSql({
        table: 'metrics',
        columns: ['host', 'avg(value)'],
        where: [
          { column: 'region', operator: '=', value: 'us-east' },
          { column: 'status', operator: '!=', value: 'down' },
        ],
        groupBy: ['host'],
        orderBy: [{ column: 'avg(value)', direction: 'DESC' }],
        limit: 10,
        timeColumn: 'ts',
        timeGroupInterval: '5m',
      });

      const lines = result.split('\n');
      expect(lines[0]).toBe('SELECT $__time(ts), host, avg(value)');
      expect(lines[1]).toBe('FROM metrics');
      expect(lines[2]).toContain('$__timeFilter(ts)');
      expect(result).toContain("region = 'us-east'");
      expect(result).toContain("status != 'down'");
      expect(result).toContain('GROUP BY $__timeGroup(ts, 5m), host');
      expect(result).toContain('ORDER BY avg(value) DESC');
      expect(result).toContain('LIMIT 10');
    });
  });
});

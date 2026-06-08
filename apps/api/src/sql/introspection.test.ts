import { describe, expect, it } from 'vitest';

import { describeTableQuery, listTablesQuery } from './introspection';

describe('listTablesQuery', () => {
  it('generates SQLite query excluding system tables', () => {
    const q = listTablesQuery('sqlite');
    expect(q.sql).toContain('sqlite_master');
    expect(q.sql).toContain("NOT LIKE 'sqlite_%'");
    expect(q.params).toEqual([]);
  });

  it('generates PostgreSQL query excluding system schemas', () => {
    const q = listTablesQuery('postgres');
    expect(q.sql).toContain('information_schema.tables');
    expect(q.sql).toContain("'pg_catalog'");
    expect(q.sql).toContain("'information_schema'");
    expect(q.params).toEqual([]);
  });
});

describe('describeTableQuery', () => {
  it('generates SQLite query using pragma_table_info with bound param', () => {
    const q = describeTableQuery('sqlite', 'metrics');
    expect(q.sql).toContain('pragma_table_info(?)');
    expect(q.params).toEqual(['metrics']);
  });

  it('generates PostgreSQL query with table_name and default public schema', () => {
    const q = describeTableQuery('postgres', 'users');
    expect(q.sql).toContain('information_schema.columns');
    expect(q.sql).toContain('table_name = ?');
    expect(q.sql).toContain('table_schema = ?');
    expect(q.params).toEqual(['users', 'public']);
  });

  it('generates PostgreSQL query with provided schema', () => {
    const q = describeTableQuery('postgres', 'events', 'analytics');
    expect(q.params).toEqual(['events', 'analytics']);
  });
});

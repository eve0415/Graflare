import { describe, expect, it } from 'vitest';

import { expandSqlMacros } from './macros';

const range = { from: 1700000000, to: 1700003600 };

describe('expandSqlMacros', () => {
	describe('$__time', () => {
		it('aliases column as time (sqlite)', () => {
			const result = expandSqlMacros('SELECT $__time(ts) FROM metrics', 'sqlite', range);
			expect(result.sql).toBe('SELECT ts AS "time" FROM metrics');
			expect(result.params).toEqual([]);
		});

		it('aliases column as time (postgres)', () => {
			const result = expandSqlMacros('SELECT $__time(created_at) FROM metrics', 'postgres', range);
			expect(result.sql).toBe('SELECT created_at AS "time" FROM metrics');
			expect(result.params).toEqual([]);
		});
	});

	describe('$__timeFilter', () => {
		it('generates range filter with bind params (sqlite)', () => {
			const result = expandSqlMacros('WHERE $__timeFilter(ts)', 'sqlite', range);
			expect(result.sql).toBe('WHERE ts >= ? AND ts <= ?');
			expect(result.params).toEqual([1700000000, 1700003600]);
		});

		it('generates range filter with bind params (postgres)', () => {
			const result = expandSqlMacros('WHERE $__timeFilter(ts)', 'postgres', range);
			expect(result.sql).toBe('WHERE ts >= ? AND ts <= ?');
			expect(result.params).toEqual([1700000000, 1700003600]);
		});
	});

	describe('$__timeFrom / $__timeTo', () => {
		it('injects from as bind param', () => {
			const result = expandSqlMacros('WHERE ts >= $__timeFrom()', 'sqlite', range);
			expect(result.sql).toBe('WHERE ts >= ?');
			expect(result.params).toEqual([1700000000]);
		});

		it('injects to as bind param', () => {
			const result = expandSqlMacros('WHERE ts <= $__timeTo()', 'sqlite', range);
			expect(result.sql).toBe('WHERE ts <= ?');
			expect(result.params).toEqual([1700003600]);
		});
	});

	describe('$__timeGroup', () => {
		it('groups by interval (sqlite)', () => {
			const result = expandSqlMacros("SELECT $__timeGroup(ts, '5m') FROM m", 'sqlite', range);
			expect(result.sql).toBe('SELECT (ts / ?) * ? FROM m');
			expect(result.params).toEqual([300, 300]);
		});

		it('groups by interval (postgres)', () => {
			const result = expandSqlMacros("SELECT $__timeGroup(ts, '1h') FROM m", 'postgres', range);
			expect(result.sql).toBe('SELECT (EXTRACT(EPOCH FROM ts)::integer / ?) * ? FROM m');
			expect(result.params).toEqual([3600, 3600]);
		});

		it('handles seconds interval', () => {
			const result = expandSqlMacros("SELECT $__timeGroup(ts, '30s') FROM m", 'sqlite', range);
			expect(result.params).toEqual([30, 30]);
		});

		it('handles day interval', () => {
			const result = expandSqlMacros("SELECT $__timeGroup(ts, '1d') FROM m", 'sqlite', range);
			expect(result.params).toEqual([86400, 86400]);
		});

		it('handles week interval', () => {
			const result = expandSqlMacros("SELECT $__timeGroup(ts, '1w') FROM m", 'sqlite', range);
			expect(result.params).toEqual([604800, 604800]);
		});
	});

	describe('$__unixEpochFilter', () => {
		it('generates epoch range filter', () => {
			const result = expandSqlMacros('WHERE $__unixEpochFilter(epoch_ts)', 'sqlite', range);
			expect(result.sql).toBe('WHERE epoch_ts >= ? AND epoch_ts <= ?');
			expect(result.params).toEqual([1700000000, 1700003600]);
		});
	});

	describe('$__unixEpochFrom / $__unixEpochTo', () => {
		it('injects epoch from as bind param', () => {
			const result = expandSqlMacros('WHERE ts >= $__unixEpochFrom()', 'sqlite', range);
			expect(result.sql).toBe('WHERE ts >= ?');
			expect(result.params).toEqual([1700000000]);
		});

		it('injects epoch to as bind param', () => {
			const result = expandSqlMacros('WHERE ts <= $__unixEpochTo()', 'sqlite', range);
			expect(result.sql).toBe('WHERE ts <= ?');
			expect(result.params).toEqual([1700003600]);
		});
	});

	describe('column name validation', () => {
		it('rejects SQL injection in column name', () => {
			expect(() => expandSqlMacros('$__time(ts; DROP TABLE metrics)', 'sqlite', range)).toThrow('Invalid column name');
		});

		it('rejects column names with spaces', () => {
			expect(() => expandSqlMacros('$__timeFilter(my column)', 'sqlite', range)).toThrow('Invalid column name');
		});

		it('rejects empty column name', () => {
			expect(() => expandSqlMacros('$__time()', 'sqlite', range)).toThrow('column name is required');
		});

		it('allows underscored column names', () => {
			const result = expandSqlMacros('$__time(created_at_utc)', 'sqlite', range);
			expect(result.sql).toBe('created_at_utc AS "time"');
		});

		it('allows column names starting with underscore', () => {
			const result = expandSqlMacros('$__time(_ts)', 'sqlite', range);
			expect(result.sql).toBe('_ts AS "time"');
		});
	});

	describe('interval validation', () => {
		it('rejects invalid interval format', () => {
			expect(() => expandSqlMacros("$__timeGroup(ts, 'invalid')", 'sqlite', range)).toThrow('Invalid interval');
		});

		it('rejects interval with injection', () => {
			expect(() => expandSqlMacros("$__timeGroup(ts, '5; DROP')", 'sqlite', range)).toThrow('Invalid interval');
		});
	});

	describe('edge cases', () => {
		it('passes through SQL with no macros', () => {
			const sql = 'SELECT * FROM metrics WHERE ts > 100';
			const result = expandSqlMacros(sql, 'sqlite', range);
			expect(result.sql).toBe(sql);
			expect(result.params).toEqual([]);
		});

		it('passes through empty string', () => {
			const result = expandSqlMacros('', 'sqlite', range);
			expect(result.sql).toBe('');
			expect(result.params).toEqual([]);
		});

		it('passes through unknown macros unchanged', () => {
			const sql = 'SELECT $__unknown(ts) FROM metrics';
			const result = expandSqlMacros(sql, 'sqlite', range);
			expect(result.sql).toBe(sql);
		});

		it('expands multiple macros in one query', () => {
			const sql = 'SELECT $__time(ts), value FROM metrics WHERE $__timeFilter(ts) ORDER BY time';
			const result = expandSqlMacros(sql, 'sqlite', range);
			expect(result.sql).toBe('SELECT ts AS "time", value FROM metrics WHERE ts >= ? AND ts <= ? ORDER BY time');
			expect(result.params).toEqual([1700000000, 1700003600]);
		});

		it('accumulates params from multiple macros in order', () => {
			const sql = 'WHERE $__timeFilter(ts) AND bucket = $__timeGroup(ts, \'5m\')';
			const result = expandSqlMacros(sql, 'sqlite', range);
			expect(result.params).toEqual([1700000000, 1700003600, 300, 300]);
		});
	});
});

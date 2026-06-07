import type { PrometheusResponse } from '#schemas/prometheus';
import type { SqlResponse } from '#schemas/sql';
import { describe, expect, it } from 'vitest';

import { sqlRowsToSeries } from './adapters';

const getMatrixResult = (response: PrometheusResponse) => {
	expect(response.status).toBe('success');
	expect(response.data).toBeDefined();
	const { data } = response;
	expect(data).toBeDefined();
	expect(typeof data === 'object' && data !== null && 'resultType' in data).toBe(true);
	if (typeof data !== 'object' || data === null || !('resultType' in data)) throw new Error('test');
	expect(data.resultType).toBe('matrix');
	expect(Array.isArray(data.result)).toBe(true);
	if (!Array.isArray(data.result)) throw new Error('test');
	return data.result;
};

describe('sqlRowsToSeries', () => {
	it('pivots rows into matrix result with time column', () => {
		const response: SqlResponse = {
			columns: [
				{ name: 'time', type: 'time' },
				{ name: 'requests', type: 'number' },
			],
			rows: [
				[1700000000, 100],
				[1700000060, 150],
				[1700000120, 200],
			],
		};

		const series = getMatrixResult(sqlRowsToSeries(response));
		expect(series).toHaveLength(1);
		expect(series[0]).toMatchObject({
			metric: { __name__: 'requests' },
			values: [
				[1700000000, '100'],
				[1700000060, '150'],
				[1700000120, '200'],
			],
		});
	});

	it('handles multiple numeric columns as separate series', () => {
		const response: SqlResponse = {
			columns: [
				{ name: 'time', type: 'time' },
				{ name: 'requests', type: 'number' },
				{ name: 'errors', type: 'number' },
			],
			rows: [
				[1700000000, 100, 5],
				[1700000060, 150, 3],
			],
		};

		const series = getMatrixResult(sqlRowsToSeries(response));
		expect(series).toHaveLength(2);
	});

	it('uses string columns as metric labels', () => {
		const response: SqlResponse = {
			columns: [
				{ name: 'time', type: 'time' },
				{ name: 'host', type: 'string' },
				{ name: 'cpu', type: 'number' },
			],
			rows: [
				[1700000000, 'server1', 0.5],
				[1700000000, 'server2', 0.8],
				[1700000060, 'server1', 0.6],
				[1700000060, 'server2', 0.7],
			],
		};

		const series = getMatrixResult(sqlRowsToSeries(response));
		expect(series).toHaveLength(2);
		expect(series[0]).toMatchObject({ metric: { host: 'server1' } });
		expect(series[1]).toMatchObject({ metric: { host: 'server2' } });
	});

	it('returns error when no time column exists', () => {
		const response: SqlResponse = {
			columns: [{ name: 'value', type: 'number' }],
			rows: [[42]],
		};

		const result = sqlRowsToSeries(response);
		expect(result.status).toBe('error');
		expect(result.error).toContain('time');
	});

	it('finds time column case-insensitively', () => {
		const response: SqlResponse = {
			columns: [
				{ name: 'TIME', type: 'time' },
				{ name: 'v', type: 'number' },
			],
			rows: [[1700000000, 1]],
		};

		expect(sqlRowsToSeries(response).status).toBe('success');
	});

	it('handles empty rows', () => {
		const response: SqlResponse = {
			columns: [
				{ name: 'time', type: 'time' },
				{ name: 'value', type: 'number' },
			],
			rows: [],
		};

		const series = getMatrixResult(sqlRowsToSeries(response));
		expect(series).toEqual([]);
	});

	it('skips null values', () => {
		const response: SqlResponse = {
			columns: [
				{ name: 'time', type: 'time' },
				{ name: 'value', type: 'number' },
			],
			rows: [
				[1700000000, null],
				[1700000060, 42],
			],
		};

		const series = getMatrixResult(sqlRowsToSeries(response));
		expect(series).toHaveLength(1);
		expect(series[0]).toMatchObject({
			values: [[1700000060, '42']],
		});
	});

	it('passes through error responses', () => {
		const response: SqlResponse = {
			columns: [],
			rows: [],
			error: 'query failed',
		};

		const result = sqlRowsToSeries(response);
		expect(result.status).toBe('error');
		expect(result.error).toBe('query failed');
	});

	it('returns empty result when no numeric columns exist', () => {
		const response: SqlResponse = {
			columns: [
				{ name: 'time', type: 'time' },
				{ name: 'label', type: 'string' },
			],
			rows: [[1700000000, 'a']],
		};

		const series = getMatrixResult(sqlRowsToSeries(response));
		expect(series).toEqual([]);
	});

	it('treats untyped non-time columns as numeric', () => {
		const response: SqlResponse = {
			columns: [
				{ name: 'time' },
				{ name: 'value' },
			],
			rows: [[1700000000, 42]],
		};

		const series = getMatrixResult(sqlRowsToSeries(response));
		expect(series).toHaveLength(1);
	});
});

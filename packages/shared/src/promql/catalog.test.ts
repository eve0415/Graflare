import { describe, expect, it } from 'vitest';

import { FUNCTION_CATALOG, catalogByName } from './catalog';

describe('fUNCTION_CATALOG', () => {
	it('contains all expected entries', () => {
		const names = FUNCTION_CATALOG.map((e) => e.name);
		expect(names).toContain('rate');
		expect(names).toContain('sum');
		expect(names).toContain('histogram_quantile');
		expect(names).toContain('topk');
		expect(names).toContain('clamp');
	});

	it('catalogByName resolves all entries', () => {
		for (const entry of FUNCTION_CATALOG) {
			expect(catalogByName.get(entry.name)).toBe(entry);
		}
	});
});

describe('render methods', () => {
	it('rate wraps bare selector with range', () => {
		const entry = catalogByName.get('rate');
		expect(entry).toBeDefined();
		const result = entry!.render('http_requests_total', [{ kind: 'range', value: '5m' }]);
		expect(result).toBe('rate(http_requests_total[5m])');
	});

	it('rate uses subquery form when inner is already wrapped', () => {
		const entry = catalogByName.get('rate');
		expect(entry).toBeDefined();
		const result = entry!.render('sum by (job)(http_requests_total)', [{ kind: 'range', value: '5m' }]);
		expect(result).toBe('rate(sum by (job)(http_requests_total)[5m:])');
	});

	it('irate renders with range', () => {
		const entry = catalogByName.get('irate');
		expect(entry).toBeDefined();
		expect(entry!.render('metric', [{ kind: 'range', value: '1m' }])).toBe('irate(metric[1m])');
	});

	it('sum renders with grouping', () => {
		const entry = catalogByName.get('sum');
		expect(entry).toBeDefined();
		const result = entry!.render('metric', [{ kind: 'grouping', mode: 'by', labels: ['job'] }]);
		expect(result).toBe('sum by (job)(metric)');
	});

	it('sum renders without grouping', () => {
		const entry = catalogByName.get('sum');
		expect(entry).toBeDefined();
		expect(entry!.render('metric', [])).toBe('sum(metric)');
	});

	it('topk renders scalar-first', () => {
		const entry = catalogByName.get('topk');
		expect(entry).toBeDefined();
		const result = entry!.render('metric', [{ kind: 'scalar', value: '5' }]);
		expect(result).toBe('topk(5, metric)');
	});

	it('bottomk renders scalar-first', () => {
		const entry = catalogByName.get('bottomk');
		expect(entry).toBeDefined();
		const result = entry!.render('metric', [{ kind: 'scalar', value: '3' }]);
		expect(result).toBe('bottomk(3, metric)');
	});

	it('histogram_quantile renders scalar-first', () => {
		const entry = catalogByName.get('histogram_quantile');
		expect(entry).toBeDefined();
		const result = entry!.render('metric', [{ kind: 'scalar', value: '0.95' }]);
		expect(result).toBe('histogram_quantile(0.95, metric)');
	});

	it('quantile aggregation renders scalar-first with grouping', () => {
		const entry = catalogByName.get('quantile');
		expect(entry).toBeDefined();
		const result = entry!.render('metric', [
			{ kind: 'scalar', value: '0.5' },
			{ kind: 'grouping', mode: 'by', labels: ['instance'] },
		]);
		expect(result).toBe('quantile by (instance)(0.5, metric)');
	});

	it('clamp renders with min and max', () => {
		const entry = catalogByName.get('clamp');
		expect(entry).toBeDefined();
		const result = entry!.render('metric', [
			{ kind: 'scalar', value: '0' },
			{ kind: 'scalar', value: '100' },
		]);
		expect(result).toBe('clamp(metric, 0, 100)');
	});

	it('round renders without precision when default', () => {
		const entry = catalogByName.get('round');
		expect(entry).toBeDefined();
		expect(entry!.render('metric', [])).toBe('round(metric)');
		expect(entry!.render('metric', [{ kind: 'scalar', value: '1' }])).toBe('round(metric)');
	});

	it('round renders with custom precision', () => {
		const entry = catalogByName.get('round');
		expect(entry).toBeDefined();
		expect(entry!.render('metric', [{ kind: 'scalar', value: '0.1' }])).toBe('round(metric, 0.1)');
	});

	it('abs renders as simple wrapper', () => {
		const entry = catalogByName.get('abs');
		expect(entry).toBeDefined();
		expect(entry!.render('metric', [])).toBe('abs(metric)');
	});

	it('aggregation with without mode', () => {
		const entry = catalogByName.get('avg');
		expect(entry).toBeDefined();
		const result = entry!.render('metric', [{ kind: 'grouping', mode: 'without', labels: ['instance'] }]);
		expect(result).toBe('avg without (instance)(metric)');
	});

	it('topk with grouping', () => {
		const entry = catalogByName.get('topk');
		expect(entry).toBeDefined();
		const result = entry!.render('metric', [
			{ kind: 'scalar', value: '5' },
			{ kind: 'grouping', mode: 'by', labels: ['job'] },
		]);
		expect(result).toBe('topk by (job)(5, metric)');
	});
});

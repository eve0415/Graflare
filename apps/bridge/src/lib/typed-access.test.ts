import { describe, expect, it } from 'vitest';

import { getAtPath, getNumberAtPath, getStringAtPath, isRecord } from './typed-access';

describe('isRecord', () => {
	it('accepts plain objects', () => {
		expect(isRecord({})).toBe(true);
		expect(isRecord({ a: 1 })).toBe(true);
	});

	it('rejects non-objects', () => {
		const undef: unknown = void 0;
		expect(isRecord(null)).toBe(false);
		expect(isRecord(undef)).toBe(false);
		expect(isRecord(42)).toBe(false);
		expect(isRecord('str')).toBe(false);
		expect(isRecord(true)).toBe(false);
	});
});

describe('getAtPath', () => {
	it('traverses nested objects', () => {
		expect(getAtPath({ a: { b: { c: 42 } } }, 'a', 'b', 'c')).toBe(42);
	});

	it('returns undefined for missing paths', () => {
		expect(getAtPath({ a: 1 }, 'b')).toBeUndefined();
		expect(getAtPath({ a: 1 }, 'a', 'b')).toBeUndefined();
	});

	it('returns undefined for non-object intermediate', () => {
		expect(getAtPath({ a: 'str' }, 'a', 'b')).toBeUndefined();
	});
});

describe('getNumberAtPath', () => {
	it('returns number at path', () => {
		expect(getNumberAtPath({ sum: { requests: 42 } }, 'sum', 'requests')).toBe(42);
	});

	it('returns undefined for non-number', () => {
		expect(getNumberAtPath({ sum: { requests: 'str' } }, 'sum', 'requests')).toBeUndefined();
	});
});

describe('getStringAtPath', () => {
	it('returns string at path', () => {
		expect(getStringAtPath({ dimensions: { name: 'foo' } }, 'dimensions', 'name')).toBe('foo');
	});

	it('returns undefined for non-string', () => {
		expect(getStringAtPath({ dimensions: { name: 42 } }, 'dimensions', 'name')).toBeUndefined();
	});
});

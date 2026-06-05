import { describe, expect, it } from 'vitest';

import { buildAlias, buildFragment, buildTimeVarType } from './generic-fragment';
import { REGISTRY } from './registry';

const findConfig = (name: string) => {
	const config = REGISTRY.find((c) => c.datasetName === name);
	if (config === undefined) throw new Error(`Dataset ${name} not found`);
	return config;
};

describe('buildFragment', () => {
	it('generates workers fragment with correct fields', () => {
		const frag = buildFragment(findConfig('workers'));
		expect(frag).toContain('workers: workersInvocationsAdaptive');
		expect(frag).toContain('datetimeMinute_geq: $fromTime');
		expect(frag).toContain('datetimeMinute_leq: $toTime');
		expect(frag).toContain('dimensions { datetimeMinute scriptName }');
		expect(frag).toContain('sum { requests errors subrequests wallTime }');
		expect(frag).toContain('quantiles { cpuTimeP50 cpuTimeP99 }');
		expect(frag).toContain('limit: 10000');
		expect(frag).toContain('orderBy: [datetimeMinute_ASC]');
	});

	it('generates d1 fragment with Date variables', () => {
		const frag = buildFragment(findConfig('d1'));
		expect(frag).toContain('d1: d1AnalyticsAdaptiveGroups');
		expect(frag).toContain('date_geq: $fromDate');
		expect(frag).toContain('date_leq: $toDate');
		expect(frag).toContain('dimensions { date databaseId }');
		expect(frag).toContain('sum { readQueries writeQueries }');
	});

	it('generates http-requests fragment with extra filter', () => {
		const frag = buildFragment(findConfig('http-requests'));
		expect(frag).toContain('httpRequests: httpRequestsAdaptiveGroups');
		expect(frag).toContain('requestSource: "eyeball"');
		expect(frag).toContain('count');
		expect(frag).toContain('dimensions { datetimeFiveMinutes }');
		expect(frag).toContain('sum { edgeResponseBytes visits }');
	});

	it('generates r2 fragment with datetime filter but no time dimension', () => {
		const frag = buildFragment(findConfig('r2'));
		expect(frag).toContain('r2: r2OperationsAdaptiveGroups');
		expect(frag).toContain('datetime_geq: $fromTime');
		expect(frag).toContain('dimensions { actionType bucketName }');
		expect(frag).toContain('sum { requests }');
	});

	it('generates firewall-events with count-only metric', () => {
		const frag = buildFragment(findConfig('firewall-events'));
		expect(frag).toContain('firewallEvents: firewallEventsAdaptiveGroups');
		expect(frag).toContain('count');
		expect(frag).toContain('dimensions { datetimeFiveMinutes action source }');
	});

	it('generates dns fragment with date filter', () => {
		const frag = buildFragment(findConfig('dns'));
		expect(frag).toContain('dns: dnsAnalyticsAdaptiveGroups');
		expect(frag).toContain('date_geq: $fromDate');
		expect(frag).toContain('count');
		expect(frag).toContain('dimensions { date queryType responseCode }');
	});
});

describe('buildAlias', () => {
	it('strips hyphens from dataset names', () => {
		expect(buildAlias(findConfig('http-requests'))).toBe('httpRequests');
		expect(buildAlias(findConfig('firewall-events'))).toBe('firewallEvents');
		expect(buildAlias(findConfig('durable-objects'))).toBe('durableObjects');
		expect(buildAlias(findConfig('workers'))).toBe('workers');
	});
});

describe('buildTimeVarType', () => {
	it('returns Time for time-filtered datasets', () => {
		expect(buildTimeVarType(findConfig('workers'))).toBe('Time');
		expect(buildTimeVarType(findConfig('r2'))).toBe('Time');
		expect(buildTimeVarType(findConfig('http-requests'))).toBe('Time');
	});

	it('returns Date for date-filtered datasets', () => {
		expect(buildTimeVarType(findConfig('d1'))).toBe('Date');
		expect(buildTimeVarType(findConfig('kv'))).toBe('Date');
		expect(buildTimeVarType(findConfig('dns'))).toBe('Date');
	});
});

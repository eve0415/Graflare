interface DatasetTimeConfig {
	kind: 'dimension' | 'dateDimension' | 'fromSeconds';
	field?: string;
}

interface DatasetFilterConfig {
	kind: 'time' | 'date';
	filterField: string;
	extraFilters?: Record<string, string>;
}

interface MetricSpec {
	source: 'count' | 'sum' | 'quantiles' | 'avg';
	field?: string;
	name?: string;
}

export interface DatasetConfig {
	nodeName: string;
	datasetName: string;
	scope: 'account' | 'zone';
	time: DatasetTimeConfig;
	filter: DatasetFilterConfig;
	orderBy: string;
	limit: number;
	resourceDimension: string;
	dimKeys: readonly string[];
	metrics: readonly MetricSpec[];
}

export const REGISTRY: DatasetConfig[] = [
	{
		nodeName: 'workersInvocationsAdaptive',
		datasetName: 'workers',
		scope: 'account',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: 'scriptName',
		dimKeys: ['scriptName'],
		metrics: [
			{ source: 'sum', field: 'requests' },
			{ source: 'sum', field: 'errors' },
			{ source: 'sum', field: 'subrequests' },
			{ source: 'sum', field: 'wallTime' },
			{ source: 'quantiles', field: 'cpuTimeP50' },
			{ source: 'quantiles', field: 'cpuTimeP99' },
		],
	},
	{
		nodeName: 'durableObjectsInvocationsAdaptiveGroups',
		datasetName: 'durable-objects',
		scope: 'account',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: 'scriptName',
		dimKeys: ['scriptName'],
		metrics: [
			{ source: 'sum', field: 'requests' },
			{ source: 'sum', field: 'responseBodySize' },
		],
	},
	{
		nodeName: 'd1AnalyticsAdaptiveGroups',
		datasetName: 'd1',
		scope: 'account',
		time: { kind: 'dateDimension', field: 'date' },
		filter: { kind: 'date', filterField: 'date' },
		orderBy: 'date_ASC',
		limit: 10000,
		resourceDimension: 'databaseId',
		dimKeys: ['databaseId'],
		metrics: [
			{ source: 'sum', field: 'readQueries' },
			{ source: 'sum', field: 'writeQueries' },
		],
	},
	{
		nodeName: 'kvOperationsAdaptiveGroups',
		datasetName: 'kv',
		scope: 'account',
		time: { kind: 'dateDimension', field: 'date' },
		filter: { kind: 'date', filterField: 'date' },
		orderBy: 'date_ASC',
		limit: 10000,
		resourceDimension: '_all',
		dimKeys: ['actionType'],
		metrics: [
			{ source: 'sum', field: 'requests' },
		],
	},
	{
		nodeName: 'r2OperationsAdaptiveGroups',
		datasetName: 'r2',
		scope: 'account',
		time: { kind: 'fromSeconds' },
		filter: { kind: 'time', filterField: 'datetime' },
		orderBy: 'sum_requests_DESC',
		limit: 10000,
		resourceDimension: 'bucketName',
		dimKeys: ['actionType', 'bucketName'],
		metrics: [
			{ source: 'sum', field: 'requests' },
		],
	},
	{
		nodeName: 'httpRequestsAdaptiveGroups',
		datasetName: 'http-requests',
		scope: 'zone',
		time: { kind: 'dimension', field: 'datetimeFiveMinutes' },
		filter: { kind: 'time', filterField: 'datetime', extraFilters: { requestSource: '"eyeball"' } },
		orderBy: 'datetimeFiveMinutes_ASC',
		limit: 10000,
		resourceDimension: '_scopeId',
		dimKeys: [],
		metrics: [
			{ source: 'count', name: 'requests' },
			{ source: 'sum', field: 'edgeResponseBytes' },
			{ source: 'sum', field: 'visits' },
		],
	},
	{
		nodeName: 'firewallEventsAdaptiveGroups',
		datasetName: 'firewall-events',
		scope: 'zone',
		time: { kind: 'dimension', field: 'datetimeFiveMinutes' },
		filter: { kind: 'time', filterField: 'datetime' },
		orderBy: 'datetimeFiveMinutes_ASC',
		limit: 10000,
		resourceDimension: '_scopeId',
		dimKeys: ['action', 'source'],
		metrics: [
			{ source: 'count', name: 'count' },
		],
	},
	{
		nodeName: 'dnsAnalyticsAdaptiveGroups',
		datasetName: 'dns',
		scope: 'zone',
		time: { kind: 'dateDimension', field: 'date' },
		filter: { kind: 'date', filterField: 'date' },
		orderBy: 'date_ASC',
		limit: 10000,
		resourceDimension: '_scopeId',
		dimKeys: ['queryType', 'responseCode'],
		metrics: [
			{ source: 'count', name: 'count' },
		],
	},

	// --- Expanded datasets (discovery filters unavailable ones) ---
	// Datasets below got permission_denied (correct fragments, needs token scope).
	// Datasets with unverified field structures were removed — add back after
	// verifying via GraphQL introspection once the token has Analytics Read.

	// Account-scoped
	{
		nodeName: 'streamMinutesViewedAdaptiveGroups',
		datasetName: 'stream',
		scope: 'account',
		time: { kind: 'dateDimension', field: 'date' },
		filter: { kind: 'date', filterField: 'date' },
		orderBy: 'date_ASC',
		limit: 10000,
		resourceDimension: 'uid',
		dimKeys: ['uid', 'clientCountryName'],
		metrics: [
			{ source: 'sum', field: 'minutesViewed' },
		],
	},
	{
		nodeName: 'aiGatewayRequestsAdaptiveGroups',
		datasetName: 'ai-gateway',
		scope: 'account',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeHour' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: 'gateway',
		dimKeys: ['gateway', 'model', 'provider'],
		metrics: [
			{ source: 'count', name: 'requests' },
		],
	},
	{
		nodeName: 'queueMessageOperationsAdaptiveGroups',
		datasetName: 'queues',
		scope: 'account',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: 'queueId',
		dimKeys: ['queueId'],
		metrics: [
			{ source: 'count', name: 'operations' },
			{ source: 'sum', field: 'bytes' },
		],
	},
	{
		nodeName: 'logpushHealthAdaptiveGroups',
		datasetName: 'logpush-health',
		scope: 'account',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: '_all',
		dimKeys: [],
		metrics: [
			{ source: 'count', name: 'events' },
		],
	},
];

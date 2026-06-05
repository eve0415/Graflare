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

	// Account-scoped
	{
		nodeName: 'kvStorageAdaptiveGroups',
		datasetName: 'kv-storage',
		scope: 'account',
		time: { kind: 'dateDimension', field: 'date' },
		filter: { kind: 'date', filterField: 'date' },
		orderBy: 'date_ASC',
		limit: 10000,
		resourceDimension: '_all',
		dimKeys: [],
		metrics: [
			{ source: 'avg', field: 'storedBytes' },
			{ source: 'avg', field: 'storedKeys' },
		],
	},
	{
		nodeName: 'r2StorageAdaptiveGroups',
		datasetName: 'r2-storage',
		scope: 'account',
		time: { kind: 'dateDimension', field: 'date' },
		filter: { kind: 'date', filterField: 'date' },
		orderBy: 'date_ASC',
		limit: 10000,
		resourceDimension: 'bucketName',
		dimKeys: ['bucketName'],
		metrics: [
			{ source: 'avg', field: 'objectCount' },
			{ source: 'avg', field: 'payloadSize' },
			{ source: 'avg', field: 'metadataSize' },
		],
	},
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
		nodeName: 'dosdAttackAnalyticsGroups',
		datasetName: 'ddos-attacks',
		scope: 'account',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: '_all',
		dimKeys: ['mitigationType'],
		metrics: [
			{ source: 'count', name: 'attacks' },
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
		nodeName: 'workersSubrequestsAdaptiveGroups',
		datasetName: 'workers-subrequests',
		scope: 'account',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: 'scriptName',
		dimKeys: ['scriptName'],
		metrics: [
			{ source: 'sum', field: 'requests' },
		],
	},
	{
		nodeName: 'videoPlaybackEventsAdaptiveGroups',
		datasetName: 'stream-playback',
		scope: 'account',
		time: { kind: 'dateDimension', field: 'date' },
		filter: { kind: 'date', filterField: 'date' },
		orderBy: 'date_ASC',
		limit: 10000,
		resourceDimension: 'uid',
		dimKeys: ['uid'],
		metrics: [
			{ source: 'sum', field: 'plays' },
		],
	},
	{
		nodeName: 'magicTransitNetworkAnalyticsAdaptiveGroups',
		datasetName: 'magic-transit',
		scope: 'account',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: '_all',
		dimKeys: [],
		metrics: [
			{ source: 'sum', field: 'packets' },
			{ source: 'sum', field: 'bytes' },
		],
	},
	{
		nodeName: 'magicFirewallSamplesAdaptiveGroups',
		datasetName: 'magic-firewall',
		scope: 'account',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: '_all',
		dimKeys: [],
		metrics: [
			{ source: 'count', name: 'samples' },
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

	// Zone-scoped
	{
		nodeName: 'loadBalancingRequestsAdaptiveGroups',
		datasetName: 'load-balancing',
		scope: 'zone',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: '_scopeId',
		dimKeys: [],
		metrics: [
			{ source: 'count', name: 'requests' },
		],
	},
	{
		nodeName: 'healthCheckEventsAdaptiveGroups',
		datasetName: 'health-checks',
		scope: 'zone',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: '_scopeId',
		dimKeys: [],
		metrics: [
			{ source: 'count', name: 'events' },
		],
	},
	{
		nodeName: 'spectrumNetworkAnalyticsAdaptiveGroups',
		datasetName: 'spectrum',
		scope: 'zone',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: '_scopeId',
		dimKeys: [],
		metrics: [
			{ source: 'count', name: 'packets' },
			{ source: 'sum', field: 'bytes' },
		],
	},
	{
		nodeName: 'nelReportsAdaptiveGroups',
		datasetName: 'nel',
		scope: 'zone',
		time: { kind: 'dimension', field: 'datetimeMinute' },
		filter: { kind: 'time', filterField: 'datetimeMinute' },
		orderBy: 'datetimeMinute_ASC',
		limit: 10000,
		resourceDimension: '_scopeId',
		dimKeys: [],
		metrics: [
			{ source: 'count', name: 'reports' },
		],
	},
];

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
  source: 'count' | 'sum' | 'quantiles' | 'avg' | 'max';
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
    metrics: [{ source: 'sum', field: 'requests' }],
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
    metrics: [{ source: 'sum', field: 'requests' }],
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
    metrics: [{ source: 'count', name: 'count' }],
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
    metrics: [{ source: 'count', name: 'count' }],
  },

  // --- Expanded datasets (verified via CF docs / introspection) ---

  // Account-scoped
  {
    nodeName: 'kvStorageAdaptiveGroups',
    datasetName: 'kv-storage',
    scope: 'account',
    time: { kind: 'dateDimension', field: 'date' },
    filter: { kind: 'date', filterField: 'date' },
    orderBy: 'date_ASC',
    limit: 10000,
    resourceDimension: 'namespaceId',
    dimKeys: ['namespaceId'],
    metrics: [
      { source: 'max', field: 'keyCount' },
      { source: 'max', field: 'byteCount' },
    ],
  },
  {
    nodeName: 'r2StorageAdaptiveGroups',
    datasetName: 'r2-storage',
    scope: 'account',
    time: { kind: 'dimension', field: 'datetime' },
    filter: { kind: 'time', filterField: 'datetime' },
    orderBy: 'datetime_DESC',
    limit: 10000,
    resourceDimension: 'bucketName',
    dimKeys: ['bucketName'],
    metrics: [
      { source: 'max', field: 'objectCount' },
      { source: 'max', field: 'payloadSize' },
      { source: 'max', field: 'metadataSize' },
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
    metrics: [{ source: 'sum', field: 'minutesViewed' }],
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
    metrics: [{ source: 'count', name: 'requests' }],
  },
  {
    nodeName: 'queueMessageOperationsAdaptiveGroups',
    datasetName: 'queues',
    scope: 'account',
    time: { kind: 'dimension', field: 'datetimeMinute' },
    filter: { kind: 'time', filterField: 'datetime' },
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
      { source: 'count', name: 'plays' },
      { source: 'sum', field: 'timeViewedMinutes' },
    ],
  },
  {
    nodeName: 'magicFirewallSamplesAdaptiveGroups',
    datasetName: 'magic-firewall',
    scope: 'account',
    time: { kind: 'dimension', field: 'datetimeFiveMinute' },
    filter: { kind: 'time', filterField: 'datetime' },
    orderBy: 'datetimeFiveMinute_DESC',
    limit: 10000,
    resourceDimension: '_all',
    dimKeys: ['ruleId'],
    metrics: [
      { source: 'sum', field: 'bits' },
      { source: 'sum', field: 'packets' },
    ],
  },
  {
    nodeName: 'logpushHealthAdaptiveGroups',
    datasetName: 'logpush-health',
    scope: 'account',
    time: { kind: 'dimension', field: 'datetimeMinute' },
    filter: { kind: 'time', filterField: 'datetime' },
    orderBy: 'datetimeMinute_ASC',
    limit: 10000,
    resourceDimension: '_all',
    dimKeys: [],
    metrics: [{ source: 'count', name: 'events' }],
  },
  {
    nodeName: 'nelReportsAdaptiveGroups',
    datasetName: 'nel',
    scope: 'account',
    time: { kind: 'dimension', field: 'datetimeMinute' },
    filter: { kind: 'time', filterField: 'datetime' },
    orderBy: 'datetimeMinute_ASC',
    limit: 10000,
    resourceDimension: '_all',
    dimKeys: [],
    metrics: [{ source: 'count', name: 'reports' }],
  },

  // Zone-scoped
  {
    nodeName: 'loadBalancingRequestsAdaptiveGroups',
    datasetName: 'load-balancing',
    scope: 'zone',
    time: { kind: 'dimension', field: 'datetimeMinute' },
    filter: { kind: 'time', filterField: 'datetime' },
    orderBy: 'datetimeMinute_ASC',
    limit: 10000,
    resourceDimension: '_scopeId',
    dimKeys: [],
    metrics: [{ source: 'count', name: 'requests' }],
  },
  {
    nodeName: 'healthCheckEventsAdaptiveGroups',
    datasetName: 'health-checks',
    scope: 'zone',
    time: { kind: 'dimension', field: 'datetimeMinute' },
    filter: { kind: 'time', filterField: 'datetime' },
    orderBy: 'datetimeMinute_ASC',
    limit: 10000,
    resourceDimension: '_scopeId',
    dimKeys: [],
    metrics: [{ source: 'count', name: 'events' }],
  },
];

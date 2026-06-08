export interface DatasetOverride {
  resourceDimension?: string;
  extraFilters?: Record<string, string>;
  preferredTimeDim?: string;
  preferredOrderBy?: string;
}

export const OVERRIDES: Record<string, DatasetOverride> = {
  httpRequestsAdaptiveGroups: {
    extraFilters: { requestSource: '"eyeball"' },
    preferredTimeDim: 'datetimeFiveMinutes',
  },
  firewallEventsAdaptiveGroups: {
    preferredTimeDim: 'datetimeFiveMinutes',
  },
  workersInvocationsAdaptive: {
    resourceDimension: 'scriptName',
  },
  durableObjectsInvocationsAdaptiveGroups: {
    resourceDimension: 'scriptName',
  },
  d1AnalyticsAdaptiveGroups: {
    resourceDimension: 'databaseId',
  },
  r2OperationsAdaptiveGroups: {
    resourceDimension: 'bucketName',
    preferredOrderBy: 'sum_requests_DESC',
  },
  r2StorageAdaptiveGroups: {
    resourceDimension: 'bucketName',
  },
  kvStorageAdaptiveGroups: {
    resourceDimension: 'namespaceId',
  },
  streamMinutesViewedAdaptiveGroups: {
    resourceDimension: 'uid',
  },
  videoPlaybackEventsAdaptiveGroups: {
    resourceDimension: 'uid',
  },
  aiGatewayRequestsAdaptiveGroups: {
    resourceDimension: 'gateway',
  },
  queueMessageOperationsAdaptiveGroups: {
    resourceDimension: 'queueId',
  },
  magicFirewallSamplesAdaptiveGroups: {
    preferredTimeDim: 'datetimeFiveMinute',
  },
};

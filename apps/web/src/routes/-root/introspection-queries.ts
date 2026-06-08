import { queryOptions } from '@tanstack/react-query';

import { describeDatabase, describeTable, listLabelValues, listLabels, listMetrics, listTables } from '../../lib/introspection';

const STALE_5M = 5 * 60 * 1000;

export const tablesQueryOptions = (datasourceId: string) =>
  queryOptions({
    queryKey: ['introspection', 'tables', datasourceId],
    queryFn: () => listTables({ data: { datasourceId } }),
    staleTime: STALE_5M,
    enabled: datasourceId !== '',
  });

export const columnsQueryOptions = (datasourceId: string, tableName: string, schema?: string) =>
  queryOptions({
    queryKey: ['introspection', 'columns', datasourceId, tableName, schema],
    queryFn: () => describeTable({ data: { datasourceId, tableName, schema } }),
    staleTime: STALE_5M,
    enabled: datasourceId !== '' && tableName !== '',
  });

export const databaseSchemaQueryOptions = (datasourceId: string) =>
  queryOptions({
    queryKey: ['introspection', 'database', datasourceId],
    queryFn: () => describeDatabase({ data: { datasourceId } }),
    staleTime: STALE_5M,
    enabled: datasourceId !== '',
  });

export const metricsQueryOptions = (datasourceId: string) =>
  queryOptions({
    queryKey: ['introspection', 'metrics', datasourceId],
    queryFn: () => listMetrics({ data: { datasourceId } }),
    staleTime: STALE_5M,
    enabled: datasourceId !== '',
  });

export const labelsQueryOptions = (datasourceId: string, metric?: string) =>
  queryOptions({
    queryKey: ['introspection', 'labels', datasourceId, metric],
    queryFn: () => listLabels({ data: { datasourceId, metric } }),
    staleTime: STALE_5M,
    enabled: datasourceId !== '',
  });

export const labelValuesQueryOptions = (datasourceId: string, label: string, metric?: string) =>
  queryOptions({
    queryKey: ['introspection', 'labelValues', datasourceId, label, metric],
    queryFn: () => listLabelValues({ data: { datasourceId, label, metric } }),
    staleTime: STALE_5M,
    enabled: datasourceId !== '' && label !== '',
  });

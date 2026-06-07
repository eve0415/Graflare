import { queryOptions } from '@tanstack/react-query';

import { getDatasource, listDatasources } from './-api';

const STALE_5M = 5 * 60 * 1000;

export const datasourcesQueryOptions = () =>
  queryOptions({
    queryKey: ['datasources'],
    queryFn: () => listDatasources(),
    staleTime: STALE_5M,
  });

export const datasourceQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['datasource', id],
    queryFn: () => getDatasource({ data: id }),
  });

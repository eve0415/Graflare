import { queryOptions } from '@tanstack/react-query';

import { getDatasource, listDatasources } from './-api';

export const datasourcesQueryOptions = () =>
  queryOptions({
    queryKey: ['datasources'],
    queryFn: () => listDatasources(),
  });

export const datasourceQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['datasource', id],
    queryFn: () => getDatasource({ data: id }),
  });

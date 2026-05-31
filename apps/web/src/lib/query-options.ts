import { queryOptions } from '@tanstack/react-query';

import { getDashboard, getDatasource, listDashboardVersions, listDashboards, listDatasources, listFolders } from './api';

export const dashboardsQueryOptions = () =>
  queryOptions({
    queryKey: ['dashboards'],
    queryFn: () => listDashboards(),
  });

export const dashboardQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['dashboard', id],
    queryFn: () => getDashboard({ data: id }),
  });

export const dashboardVersionsQueryOptions = (dashboardId: string) =>
  queryOptions({
    queryKey: ['dashboard-versions', dashboardId],
    queryFn: () => listDashboardVersions({ data: dashboardId }),
  });

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

export const foldersQueryOptions = () =>
  queryOptions({
    queryKey: ['folders'],
    queryFn: () => listFolders(),
  });

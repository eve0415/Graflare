import { queryOptions } from '@tanstack/react-query';

import { getDashboard, listDashboardVersions, listDashboards, listFolders } from './-api';

const STALE_30S = 30 * 1000;
const STALE_5M = 5 * 60 * 1000;

export const dashboardsQueryOptions = () =>
  queryOptions({
    queryKey: ['dashboards'],
    queryFn: () => listDashboards(),
    staleTime: STALE_30S,
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

export const foldersQueryOptions = () =>
  queryOptions({
    queryKey: ['folders'],
    queryFn: () => listFolders(),
    staleTime: STALE_5M,
  });

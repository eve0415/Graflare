import { queryOptions } from '@tanstack/react-query';

import { getDashboard, listDashboardVersions, listDashboards, listFolders } from './-api';

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

export const foldersQueryOptions = () =>
  queryOptions({
    queryKey: ['folders'],
    queryFn: () => listFolders(),
  });

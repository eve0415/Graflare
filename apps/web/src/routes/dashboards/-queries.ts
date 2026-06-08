import { queryOptions } from '@tanstack/react-query';

import { getDashboard, listAnnotations, listDashboardVersions, listDashboards, listFolders } from './-api';

const STALE_30S = 30 * 1000;
const STALE_5M = 5 * 60 * 1000;

export const dashboardsQueryOptions = (options?: { enabled?: boolean }) =>
  queryOptions({
    queryKey: ['dashboards'],
    queryFn: () => listDashboards(),
    staleTime: STALE_30S,
    // Omit `enabled` entirely when unset — `exactOptionalPropertyTypes` rejects an
    // explicit `undefined`, and an absent key already means "always enabled".
    ...(options?.enabled === undefined ? {} : { enabled: options.enabled }),
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

// `from`/`to` are epoch MILLISECONDS bounding the dashboard's visible window. They
// belong in the key so panning/zooming the time range refetches; resolve them once
// per range selection at the call site (not every render) to keep the key stable.
export const annotationsQueryOptions = (dashboardId: string, from: number, to: number) =>
  queryOptions({
    queryKey: ['annotations', dashboardId, from, to],
    queryFn: () => listAnnotations({ data: { dashboardId, from, to } }),
    staleTime: STALE_30S,
  });

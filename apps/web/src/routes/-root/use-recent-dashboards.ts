import type { RecentDashboard } from './recent-dashboards-store';

import { useSyncExternalStore } from 'react';

import { getRecentDashboardsServerSnapshot, getRecentDashboardsSnapshot, recordRecentDashboard, subscribeRecentDashboards } from './recent-dashboards-store';

export interface UseRecentDashboards {
  readonly recents: readonly RecentDashboard[];
  readonly record: (entry: RecentDashboard) => void;
}

/**
 * React view onto the module-level recents store, subscribed via `useSyncExternalStore` so the
 * read is SSR-safe (the server snapshot is an empty list) and re-renders happen on record
 * rather than inside an effect.
 *
 * The subscription is module-level (not per-hook-instance) so the recorder (dashboard route)
 * and the reader (root-mounted palette) — which live in different component trees — share one
 * listener set: a visit recorded anywhere re-renders every subscriber.
 */
export const useRecentDashboards = (): UseRecentDashboards => {
  const recents = useSyncExternalStore(subscribeRecentDashboards, getRecentDashboardsSnapshot, getRecentDashboardsServerSnapshot);
  return { recents, record: recordRecentDashboard };
};

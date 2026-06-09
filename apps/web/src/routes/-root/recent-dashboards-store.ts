import * as z from 'zod/mini';

/** A recently-viewed dashboard, narrowed to what the palette needs to render + navigate. */
export interface RecentDashboard {
  readonly id: string;
  readonly title: string;
}

/**
 * Persistence boundary for recently-viewed dashboards. Modeled as an interface so a future
 * remote/D1-backed store can drop in without touching callers (the localStorage version is
 * the only implementation today).
 */
export interface RecentDashboardsStore {
  /** Newest-first list of recent dashboards. */
  list(): RecentDashboard[];
  /** Record a visit: de-dupe by id, move-to-front, cap at {@link MAX_RECENTS}. */
  record(entry: RecentDashboard): void;
}

const STORAGE_KEY = 'graflare.recentDashboards';
const MAX_RECENTS = 6;

const entrySchema = z.object({
  id: z.string(),
  title: z.string(),
});

const entriesSchema = z.array(entrySchema);

/**
 * SSR-safe handle to `localStorage`. Returns `undefined` when storage is absent (server
 * render, or a browser that disabled it) so every caller degrades to an empty list instead
 * of throwing.
 */
const getStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
};

/** Parse + validate the persisted array; any corruption or parse error yields an empty list. */
const readRaw = (storage: Storage): RecentDashboard[] => {
  const json = storage.getItem(STORAGE_KEY);
  if (json === null) return [];
  try {
    const parsed = entriesSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

const writeRaw = (storage: Storage, entries: readonly RecentDashboard[]): void => {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or storage disabled mid-session — drop the write silently; recents are a
    // convenience, never load-bearing.
  }
};

/** Move-to-front de-dupe by id, then cap at the newest {@link MAX_RECENTS}. */
const merge = (current: readonly RecentDashboard[], entry: RecentDashboard): RecentDashboard[] => {
  const withoutDup = current.filter(e => e.id !== entry.id);
  return [entry, ...withoutDup].slice(0, MAX_RECENTS);
};

/**
 * Single-key `localStorage`-backed recents store, per-user by virtue of running in the user's
 * browser. Implements {@link RecentDashboardsStore} so a future remote-backed store can drop in
 * without touching callers.
 */
export const createLocalStorageRecentDashboardsStore = (): RecentDashboardsStore => ({
  list() {
    const storage = getStorage();
    if (storage === undefined) return [];
    return readRaw(storage);
  },

  record(entry) {
    const storage = getStorage();
    if (storage === undefined) return;
    writeRaw(storage, merge(readRaw(storage), entry));
  },
});

// --- Live layer ------------------------------------------------------------------------------
// The recorder (dashboard route) and the reader (root-mounted palette) live in different
// component trees, so per-instance listeners would never sync. Mirror the theme-provider's
// module-level store: one shared listener set + one cached snapshot, notified on every record,
// so a visit recorded anywhere re-renders every `useSyncExternalStore` subscriber across trees.

const liveStore = createLocalStorageRecentDashboardsStore();
const listeners = new Set<() => void>();

// `null` = not yet read. The snapshot identity is stable between records so
// `useSyncExternalStore` doesn't loop on a fresh array each getSnapshot call.
let snapshot: RecentDashboard[] | null = null;

const EMPTY: readonly RecentDashboard[] = [];

/** Subscribe to recents changes; returns an unsubscribe. */
export const subscribeRecentDashboards = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

/** Cached, stable snapshot of recents — recomputed only when a record notifies. */
export const getRecentDashboardsSnapshot = (): readonly RecentDashboard[] => {
  snapshot ??= liveStore.list();
  return snapshot;
};

/** Server snapshot: no persisted state on the server, so a stable empty array. */
export const getRecentDashboardsServerSnapshot = (): readonly RecentDashboard[] => EMPTY;

/** Record a visit through the live store, then refresh the cache and notify subscribers. */
export const recordRecentDashboard = (entry: RecentDashboard): void => {
  liveStore.record(entry);
  snapshot = liveStore.list();
  for (const listener of listeners) listener();
};

/**
 * Reset the in-memory snapshot cache. Test-only: the module-level snapshot persists across
 * cases within a file, so a test that mutates `localStorage` directly must invalidate the
 * cache to observe the change. Not used by application code.
 */
export const resetRecentDashboardsCacheForTests = (): void => {
  snapshot = null;
};

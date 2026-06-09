import type { QueryHistoryDatasourceType, QueryHistoryEntry, QueryHistoryStore } from './query-history-store';

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import { createLocalStorageQueryHistoryStore } from './query-history-store';

export interface UseQueryHistory {
  entries: QueryHistoryEntry[];
  record: (input: { datasourceId: string; datasourceType: QueryHistoryDatasourceType; query: string }) => void;
  toggleStar: (id: string) => void;
  setComment: (id: string, comment: string) => void;
  remove: (id: string) => void;
}

const EMPTY: QueryHistoryEntry[] = [];

/**
 * React wrapper around a {@link QueryHistoryStore}, subscribed via
 * `useSyncExternalStore` so the read is SSR-safe (the server snapshot is an empty
 * list) and re-renders happen on mutation rather than inside an effect.
 *
 * The store interface is intentionally imperative, so this hook layers a tiny
 * subscription on top: a cached snapshot is recomputed (and listeners notified)
 * after every mutation, and the snapshot identity is stable between mutations so
 * `useSyncExternalStore` doesn't loop.
 *
 * Accepts an optional store for testing; defaults to the localStorage-backed one.
 */
export const useQueryHistory = (store?: QueryHistoryStore): UseQueryHistory => {
  const activeStore = useMemo(() => store ?? createLocalStorageQueryHistoryStore(), [store]);

  const listeners = useRef(new Set<() => void>());
  // `null` means "not yet read"; the first getSnapshot reads the store once.
  const snapshot = useRef<QueryHistoryEntry[] | null>(null);

  const subscribe = useCallback((onChange: () => void) => {
    const set = listeners.current;
    set.add(onChange);
    return () => {
      set.delete(onChange);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    snapshot.current ??= activeStore.list();
    return snapshot.current;
  }, [activeStore]);

  // The store has no server state, so the server snapshot is a stable empty array.
  const getServerSnapshot = useCallback(() => EMPTY, []);

  const refresh = useCallback(() => {
    snapshot.current = activeStore.list();
    for (const listener of listeners.current) listener();
  }, [activeStore]);

  const entries = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const record = useCallback(
    (input: { datasourceId: string; datasourceType: QueryHistoryDatasourceType; query: string }) => {
      activeStore.add(input);
      refresh();
    },
    [activeStore, refresh],
  );

  const toggleStar = useCallback(
    (id: string) => {
      activeStore.toggleStar(id);
      refresh();
    },
    [activeStore, refresh],
  );

  const setComment = useCallback(
    (id: string, comment: string) => {
      activeStore.setComment(id, comment);
      refresh();
    },
    [activeStore, refresh],
  );

  const remove = useCallback(
    (id: string) => {
      activeStore.remove(id);
      refresh();
    },
    [activeStore, refresh],
  );

  return { entries, record, toggleStar, setComment, remove };
};

import { datasourceType } from '@graflare/shared/schemas/datasource';
import * as z from 'zod/mini';

/** Data-source kinds that produce a query string Explore can re-run. Mirrors the shared enum. */
export type QueryHistoryDatasourceType = z.infer<typeof datasourceType>;

export interface QueryHistoryEntry {
  id: string;
  datasourceId: string;
  datasourceType: QueryHistoryDatasourceType;
  query: string;
  comment: string;
  starred: boolean;
  /** Epoch milliseconds. */
  createdAt: number;
}

export interface QueryHistoryStore {
  list(): QueryHistoryEntry[];
  add(input: { datasourceId: string; datasourceType: QueryHistoryDatasourceType; query: string }): QueryHistoryEntry;
  toggleStar(id: string): void;
  setComment(id: string, comment: string): void;
  remove(id: string): void;
}

const STORAGE_KEY = 'graflare.explore.queryHistory';
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;

const entrySchema = z.object({
  id: z.string(),
  datasourceId: z.string(),
  datasourceType,
  query: z.string(),
  comment: z.string(),
  starred: z.boolean(),
  createdAt: z.number(),
});

const entriesSchema = z.array(entrySchema);

/**
 * SSR-safe handle to `localStorage`. Returns `undefined` when storage is absent
 * (server render, or a browser that has disabled it) so every caller degrades to
 * an in-memory empty list instead of throwing.
 */
const getStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
};

/** Parse + validate the persisted array; any corruption or parse error yields an empty list. */
const readRaw = (storage: Storage): QueryHistoryEntry[] => {
  const json = storage.getItem(STORAGE_KEY);
  if (json === null) return [];
  try {
    const parsed = entriesSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

const writeRaw = (storage: Storage, entries: QueryHistoryEntry[]): void => {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or storage disabled mid-session — drop the write silently;
    // history is a convenience, never load-bearing.
  }
};

/** Drop entries older than two weeks unless starred (starred never prunes). */
const prune = (entries: QueryHistoryEntry[], now: number): QueryHistoryEntry[] => {
  const cutoff = now - TWO_WEEKS_MS;
  return entries.filter(e => e.starred || e.createdAt >= cutoff);
};

/**
 * Enforce the 200-entry cap by dropping the oldest *non-starred* entries first.
 * Assumes `entries` is already newest-first; starred entries are always retained.
 */
const enforceCap = (entries: QueryHistoryEntry[]): QueryHistoryEntry[] => {
  if (entries.length <= MAX_ENTRIES) return entries;
  let overflow = entries.length - MAX_ENTRIES;
  const kept: QueryHistoryEntry[] = [];
  // Walk oldest-first so the earliest non-starred entries are the ones dropped.
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry === undefined) continue;
    if (overflow > 0 && !entry.starred) {
      overflow--;
      continue;
    }
    kept.push(entry);
  }
  // `kept` was built oldest-first; restore newest-first order.
  return kept.reverse();
};

/**
 * The single read pipeline: load → validate → prune → sort newest-first → cap,
 * then persist the normalized result so pruning and the cap take effect on disk
 * (otherwise dropped entries resurrect on the next read). Returns the entries.
 */
const normalize = (storage: Storage, now: number): QueryHistoryEntry[] => {
  const loaded = readRaw(storage);
  const sorted = prune(loaded, now).sort((a, b) => b.createdAt - a.createdAt);
  const capped = enforceCap(sorted);
  if (capped.length !== loaded.length || capped.some((e, i) => e !== loaded[i])) {
    writeRaw(storage, capped);
  }
  return capped;
};

/**
 * Single-key `localStorage`-backed history store, per-user by virtue of running in
 * the user's browser. Entries carry their `datasourceType`, which the UI surfaces
 * as a badge and can filter on; the store itself keeps all types in one list.
 * Implements the `QueryHistoryStore` interface so a future D1/remote-backed store
 * can drop in without touching callers.
 */
export const createLocalStorageQueryHistoryStore = (): QueryHistoryStore => {
  const mutate = (fn: (entries: QueryHistoryEntry[], now: number) => QueryHistoryEntry[]): void => {
    const storage = getStorage();
    if (storage === undefined) return;
    const now = Date.now();
    const next = fn(normalize(storage, now), now);
    writeRaw(storage, next);
  };

  return {
    list() {
      const storage = getStorage();
      if (storage === undefined) return [];
      return normalize(storage, Date.now());
    },

    add(input) {
      const storage = getStorage();
      const now = Date.now();
      const entry: QueryHistoryEntry = {
        id: crypto.randomUUID(),
        datasourceId: input.datasourceId,
        datasourceType: input.datasourceType,
        query: input.query,
        comment: '',
        starred: false,
        createdAt: now,
      };
      if (storage === undefined) return entry;

      const current = normalize(storage, now);
      // De-dupe: re-running an identical (datasource, query) bumps the existing
      // entry's recency instead of appending a duplicate — preserve its star/comment.
      const existing = current.find(e => e.datasourceId === input.datasourceId && e.query === input.query);
      if (existing !== undefined) {
        const bumped: QueryHistoryEntry = { ...existing, createdAt: now };
        const rest = current.filter(e => e.id !== existing.id);
        writeRaw(storage, enforceCap([bumped, ...rest]));
        return bumped;
      }

      writeRaw(storage, enforceCap([entry, ...current]));
      return entry;
    },

    toggleStar(id) {
      mutate(entries => entries.map(e => (e.id === id ? { ...e, starred: !e.starred } : e)));
    },

    setComment(id, comment) {
      mutate(entries => entries.map(e => (e.id === id ? { ...e, comment } : e)));
    },

    remove(id) {
      mutate(entries => entries.filter(e => e.id !== id));
    },
  };
};

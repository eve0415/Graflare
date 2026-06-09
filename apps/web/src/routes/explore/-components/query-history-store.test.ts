import type { QueryHistoryEntry } from './query-history-store';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLocalStorageQueryHistoryStore } from './query-history-store';

const STORAGE_KEY = 'graflare.explore.queryHistory';
const DAY_MS = 24 * 60 * 60 * 1000;

const makeEntry = (over: Partial<QueryHistoryEntry>): QueryHistoryEntry => ({
  id: crypto.randomUUID(),
  datasourceId: 'ds-1',
  datasourceType: 'prometheus',
  query: 'up',
  comment: '',
  starred: false,
  createdAt: Date.now(),
  ...over,
});

const seed = (entries: QueryHistoryEntry[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

/** Read back the persisted entries' query strings (the only field these assertions inspect). */
const readPersistedQueries = (): string[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const items: unknown[] = parsed;
  const queries: string[] = [];
  for (const item of items) {
    if (typeof item === 'object' && item !== null && 'query' in item && typeof item.query === 'string') {
      queries.push(item.query);
    }
  }
  return queries;
};

/**
 * Run `fn` with `globalThis.localStorage` removed entirely, simulating a server render, then
 * restore it. Kept as a helper so the guard/restore logic stays out of the test body (where
 * `no-conditional-in-test` forbids branching).
 */
const withoutLocalStorage = (fn: () => void): void => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  if (original === undefined) throw new Error('expected jsdom to define localStorage');
  Reflect.deleteProperty(globalThis, 'localStorage');
  try {
    fn();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', original);
  }
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('createLocalStorageQueryHistoryStore', () => {
  it('adds an entry and lists it back', () => {
    const store = createLocalStorageQueryHistoryStore();
    const entry = store.add({ datasourceId: 'ds-1', datasourceType: 'prometheus', query: 'up' });

    const listed = store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(entry.id);
    expect(listed[0]?.query).toBe('up');
    expect(listed[0]?.comment).toBe('');
    expect(listed[0]?.starred).toBe(false);
  });

  it('lists newest entries first', () => {
    const now = Date.now();
    seed([
      makeEntry({ query: 'old', createdAt: now - 3 * DAY_MS }),
      makeEntry({ query: 'newest', createdAt: now - 1 * DAY_MS }),
      makeEntry({ query: 'middle', createdAt: now - 2 * DAY_MS }),
    ]);

    const store = createLocalStorageQueryHistoryStore();
    expect(store.list().map(e => e.query)).toEqual(['newest', 'middle', 'old']);
  });

  it('prunes entries older than two weeks but keeps starred ones', () => {
    const now = Date.now();
    seed([
      makeEntry({ query: 'fresh', createdAt: now - 1 * DAY_MS }),
      makeEntry({ query: 'stale', createdAt: now - 15 * DAY_MS }),
      makeEntry({ query: 'stale-but-starred', starred: true, createdAt: now - 30 * DAY_MS }),
    ]);

    const store = createLocalStorageQueryHistoryStore();
    const queries = store.list().map(e => e.query);
    expect(queries).toContain('fresh');
    expect(queries).toContain('stale-but-starred');
    expect(queries).not.toContain('stale');
    // Pruning is persisted, not just filtered in memory.
    expect(readPersistedQueries().sort()).toEqual(['fresh', 'stale-but-starred']);
  });

  it('caps total at 200, dropping the oldest non-starred entries first', () => {
    const now = Date.now();
    const entries: QueryHistoryEntry[] = [];
    // 205 fresh entries: index 0 newest, index 204 oldest. Mark the 3 oldest as starred.
    for (let i = 0; i < 205; i++) {
      entries.push(makeEntry({ query: `q-${String(i)}`, createdAt: now - i * 1000, starred: i >= 202 }));
    }
    seed(entries);

    const store = createLocalStorageQueryHistoryStore();
    const listed = store.list();
    expect(listed).toHaveLength(200);
    // All 3 starred entries survive even though they are the oldest.
    expect(listed.filter(e => e.starred)).toHaveLength(3);
    // The dropped entries are the oldest non-starred ones (q-199, q-200, q-201).
    const queries = new Set(listed.map(e => e.query));
    expect(queries.has('q-0')).toBe(true);
    expect(queries.has('q-199')).toBe(false);
    expect(queries.has('q-201')).toBe(false);
    expect(queries.has('q-202')).toBe(true);
  });

  it('de-dupes a re-run by bumping createdAt, preserving star and comment', () => {
    vi.useFakeTimers();
    const base = Date.UTC(2024, 0, 1, 12, 0, 0);
    vi.setSystemTime(base);

    const store = createLocalStorageQueryHistoryStore();
    const first = store.add({ datasourceId: 'ds-1', datasourceType: 'prometheus', query: 'up' });
    store.toggleStar(first.id);
    store.setComment(first.id, 'my note');
    store.add({ datasourceId: 'ds-2', datasourceType: 'sql', query: 'SELECT 1' });

    // Re-run the same (datasource, query) later.
    vi.setSystemTime(base + 60_000);
    const bumped = store.add({ datasourceId: 'ds-1', datasourceType: 'prometheus', query: 'up' });

    const listed = store.list();
    // No duplicate: still two distinct (datasource, query) entries.
    expect(listed).toHaveLength(2);
    expect(listed.filter(e => e.query === 'up')).toHaveLength(1);
    // Same id reused, createdAt bumped, star + comment preserved.
    expect(bumped.id).toBe(first.id);
    expect(bumped.createdAt).toBe(base + 60_000);
    expect(bumped.starred).toBe(true);
    expect(bumped.comment).toBe('my note');
    // Bumped entry is now newest.
    expect(listed[0]?.query).toBe('up');
  });

  it('toggleStar, setComment, and remove mutate the persisted entry', () => {
    const store = createLocalStorageQueryHistoryStore();
    const entry = store.add({ datasourceId: 'ds-1', datasourceType: 'prometheus', query: 'up' });

    store.toggleStar(entry.id);
    expect(store.list()[0]?.starred).toBe(true);
    store.toggleStar(entry.id);
    expect(store.list()[0]?.starred).toBe(false);

    store.setComment(entry.id, 'annotated');
    expect(store.list()[0]?.comment).toBe('annotated');

    store.remove(entry.id);
    expect(store.list()).toHaveLength(0);
  });

  it('returns an empty list and ignores corrupt persisted JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json');
    const store = createLocalStorageQueryHistoryStore();
    expect(store.list()).toEqual([]);
  });

  it('drops entries with the wrong shape via schema validation', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: 'x', query: 'up' }]));
    const store = createLocalStorageQueryHistoryStore();
    expect(store.list()).toEqual([]);
  });
});

describe('createLocalStorageQueryHistoryStore without localStorage (SSR)', () => {
  it('returns an empty list and no-ops mutations when localStorage is absent', () => {
    withoutLocalStorage(() => {
      const store = createLocalStorageQueryHistoryStore();
      expect(store.list()).toEqual([]);
      // add still returns a well-formed entry (in-memory) without throwing.
      const entry = store.add({ datasourceId: 'ds-1', datasourceType: 'prometheus', query: 'up' });
      expect(entry.query).toBe('up');
      // Mutations must not throw.
      expect(() => {
        store.toggleStar(entry.id);
        store.setComment(entry.id, 'x');
        store.remove(entry.id);
      }).not.toThrow();
      expect(store.list()).toEqual([]);
    });
  });
});

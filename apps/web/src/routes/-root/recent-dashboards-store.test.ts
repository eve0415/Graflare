import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createLocalStorageRecentDashboardsStore,
  getRecentDashboardsSnapshot,
  recordRecentDashboard,
  resetRecentDashboardsCacheForTests,
  subscribeRecentDashboards,
} from './recent-dashboards-store';

const STORAGE_KEY = 'graflare.recentDashboards';

/** Read back the persisted entries' ids (the field most assertions inspect). */
const readPersistedIds = (): string[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const items: unknown[] = parsed;
  const ids: string[] = [];
  for (const item of items) {
    if (typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string') {
      ids.push(item.id);
    }
  }
  return ids;
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
  // The live layer caches a module-level snapshot; clear it so each case reads fresh storage.
  resetRecentDashboardsCacheForTests();
});

afterEach(() => {
  localStorage.clear();
  resetRecentDashboardsCacheForTests();
});

describe('createLocalStorageRecentDashboardsStore', () => {
  it('records an entry and lists it back', () => {
    const store = createLocalStorageRecentDashboardsStore();
    store.record({ id: 'id-1', title: 'CPU Overview' });

    const listed = store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe('id-1');
    expect(listed[0]?.title).toBe('CPU Overview');
  });

  it('de-dupes by id and moves the re-recorded entry to the front', () => {
    const store = createLocalStorageRecentDashboardsStore();
    store.record({ id: 'id-1', title: 'First' });
    store.record({ id: 'id-2', title: 'Second' });
    // Re-record id-1 with an updated title.
    store.record({ id: 'id-1', title: 'First (renamed)' });

    const listed = store.list();
    expect(listed.map(e => e.id)).toEqual(['id-1', 'id-2']);
    expect(listed[0]?.title).toBe('First (renamed)');
  });

  it('caps at 6 entries, dropping the oldest', () => {
    const store = createLocalStorageRecentDashboardsStore();
    for (let i = 0; i < 8; i++) {
      store.record({ id: `id-${String(i)}`, title: `Dashboard ${String(i)}` });
    }

    const listed = store.list();
    expect(listed).toHaveLength(6);
    // Newest-first: id-7 down to id-2; the two oldest (id-0, id-1) are dropped.
    expect(listed.map(e => e.id)).toEqual(['id-7', 'id-6', 'id-5', 'id-4', 'id-3', 'id-2']);
    expect(readPersistedIds()).toEqual(['id-7', 'id-6', 'id-5', 'id-4', 'id-3', 'id-2']);
  });

  it('returns an empty list and ignores corrupt persisted JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json');
    const store = createLocalStorageRecentDashboardsStore();
    expect(store.list()).toEqual([]);
  });

  it('drops entries with the wrong shape via schema validation', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ id: 'x' }, { title: 'no id' }]));
    const store = createLocalStorageRecentDashboardsStore();
    expect(store.list()).toEqual([]);
  });
});

describe('createLocalStorageRecentDashboardsStore without localStorage (SSR)', () => {
  it('returns an empty list and no-ops record when localStorage is absent', () => {
    withoutLocalStorage(() => {
      const store = createLocalStorageRecentDashboardsStore();
      expect(store.list()).toEqual([]);
      expect(() => {
        store.record({ id: 'id-1', title: 'CPU Overview' });
      }).not.toThrow();
      expect(store.list()).toEqual([]);
    });
  });
});

describe('recent dashboards live layer', () => {
  it('exposes recorded entries through the cached snapshot and notifies subscribers', () => {
    const onChange = vi.fn<() => void>();
    const unsubscribe = subscribeRecentDashboards(onChange);

    recordRecentDashboard({ id: 'id-1', title: 'CPU Overview' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getRecentDashboardsSnapshot().map(e => e.id)).toEqual(['id-1']);

    recordRecentDashboard({ id: 'id-2', title: 'Memory Usage' });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(getRecentDashboardsSnapshot().map(e => e.id)).toEqual(['id-2', 'id-1']);

    unsubscribe();
    recordRecentDashboard({ id: 'id-3', title: 'Disk IO' });
    // No further notifications after unsubscribe.
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('keeps a stable snapshot identity between records (so useSyncExternalStore does not loop)', () => {
    recordRecentDashboard({ id: 'id-1', title: 'CPU Overview' });
    const first = getRecentDashboardsSnapshot();
    expect(getRecentDashboardsSnapshot()).toBe(first);
    recordRecentDashboard({ id: 'id-2', title: 'Memory Usage' });
    expect(getRecentDashboardsSnapshot()).not.toBe(first);
  });
});

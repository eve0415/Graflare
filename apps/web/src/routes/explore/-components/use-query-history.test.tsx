import type { QueryHistoryEntry, QueryHistoryStore } from './query-history-store';

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useQueryHistory } from './use-query-history';

/** In-memory store double so hook behaviour is tested without touching localStorage. */
const createMemoryStore = (): QueryHistoryStore => {
  let entries: QueryHistoryEntry[] = [];
  return {
    list: () => entries,
    add(input) {
      const entry: QueryHistoryEntry = {
        id: crypto.randomUUID(),
        datasourceId: input.datasourceId,
        datasourceType: input.datasourceType,
        query: input.query,
        comment: '',
        starred: false,
        createdAt: Date.now(),
      };
      entries = [entry, ...entries];
      return entry;
    },
    toggleStar(id) {
      entries = entries.map(e => (e.id === id ? { ...e, starred: !e.starred } : e));
    },
    setComment(id, comment) {
      entries = entries.map(e => (e.id === id ? { ...e, comment } : e));
    },
    remove(id) {
      entries = entries.filter(e => e.id !== id);
    },
  };
};

/** First entry's id, asserted present — keeps test bodies free of optional-chaining conditionals. */
const firstId = (entries: readonly QueryHistoryEntry[]): string => {
  const [first] = entries;
  if (first === undefined) throw new Error('expected at least one history entry');
  return first.id;
};

afterEach(cleanup);

describe('useQueryHistory', () => {
  it('reads existing entries on mount', () => {
    const store = createMemoryStore();
    store.add({ datasourceId: 'ds-1', datasourceType: 'prometheus', query: 'up' });

    const { result } = renderHook(() => useQueryHistory(store));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.query).toBe('up');
  });

  it('record adds an entry and updates state', () => {
    const store = createMemoryStore();
    const { result } = renderHook(() => useQueryHistory(store));
    expect(result.current.entries).toHaveLength(0);

    act(() => {
      result.current.record({ datasourceId: 'ds-1', datasourceType: 'sql', query: 'SELECT 1' });
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.query).toBe('SELECT 1');
    expect(result.current.entries[0]?.datasourceType).toBe('sql');
  });

  it('toggleStar reflects in state', () => {
    const store = createMemoryStore();
    const { result } = renderHook(() => useQueryHistory(store));
    act(() => {
      result.current.record({ datasourceId: 'ds-1', datasourceType: 'prometheus', query: 'up' });
    });
    const id = firstId(result.current.entries);

    act(() => {
      result.current.toggleStar(id);
    });
    expect(result.current.entries[0]?.starred).toBe(true);
  });

  it('setComment reflects in state', () => {
    const store = createMemoryStore();
    const { result } = renderHook(() => useQueryHistory(store));
    act(() => {
      result.current.record({ datasourceId: 'ds-1', datasourceType: 'prometheus', query: 'up' });
    });
    const id = firstId(result.current.entries);

    act(() => {
      result.current.setComment(id, 'note');
    });
    expect(result.current.entries[0]?.comment).toBe('note');
  });

  it('remove deletes the entry from state', () => {
    const store = createMemoryStore();
    const { result } = renderHook(() => useQueryHistory(store));
    act(() => {
      result.current.record({ datasourceId: 'ds-1', datasourceType: 'prometheus', query: 'up' });
    });
    const id = firstId(result.current.entries);

    act(() => {
      result.current.remove(id);
    });
    expect(result.current.entries).toHaveLength(0);
  });
});

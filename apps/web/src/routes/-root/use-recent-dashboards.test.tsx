import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetRecentDashboardsCacheForTests } from './recent-dashboards-store';
import { useRecentDashboards } from './use-recent-dashboards';

beforeEach(() => {
  localStorage.clear();
  resetRecentDashboardsCacheForTests();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetRecentDashboardsCacheForTests();
});

describe('useRecentDashboards', () => {
  it('starts empty and updates state when record is called', () => {
    const { result } = renderHook(() => useRecentDashboards());
    expect(result.current.recents).toHaveLength(0);

    act(() => {
      result.current.record({ id: 'id-1', title: 'CPU Overview' });
    });

    expect(result.current.recents).toHaveLength(1);
    expect(result.current.recents[0]?.id).toBe('id-1');
    expect(result.current.recents[0]?.title).toBe('CPU Overview');
  });

  it('reads entries already persisted before mount', () => {
    localStorage.setItem('graflare.recentDashboards', JSON.stringify([{ id: 'id-1', title: 'CPU Overview' }]));
    const { result } = renderHook(() => useRecentDashboards());
    expect(result.current.recents.map(e => e.id)).toEqual(['id-1']);
  });

  it('syncs across separate component trees: a record in one updates the other (module-level store)', () => {
    // The recorder (dashboard route) and reader (root palette) live in different trees, so the
    // store must be module-level — a per-instance listener set would leave the reader stale.
    const reader = renderHook(() => useRecentDashboards());
    const recorder = renderHook(() => useRecentDashboards());
    expect(reader.result.current.recents).toHaveLength(0);

    act(() => {
      recorder.result.current.record({ id: 'id-1', title: 'CPU Overview' });
    });

    // The reader (a distinct hook instance) sees the record without re-rendering itself.
    expect(reader.result.current.recents.map(e => e.id)).toEqual(['id-1']);
  });
});

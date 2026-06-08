import type { useNavigate } from '@tanstack/react-router';

import { describe, expect, it, vi } from 'vitest';

import { assembleCommands } from './command-data';
import { navItems } from './nav-items';

type Navigate = ReturnType<typeof useNavigate>;

// `assembleCommands` takes the router's generic `navigate`, which a plain spy can't be
// typed as. Wrap a typed spy in a `Navigate`-typed function: the spy records the options
// object (asserted below), the wrapper satisfies the parameter type.
const navigateSpy = vi.fn<(options: unknown) => void>();
const navigate: Navigate = options => {
  navigateSpy(options);
  return Promise.resolve();
};

const dashboards = [
  { id: 'id-1', title: 'CPU Overview' },
  { id: 'id-2', title: 'Memory Usage' },
];

describe('assembleCommands', () => {
  it('includes a Home page plus every sidebar nav item in the pages group', () => {
    const commands = assembleCommands({ navigate, dashboards: [] });
    const pages = commands.filter(c => c.group === 'pages');
    const labels = pages.map(c => c.label);
    expect(labels).toContain('Home');
    for (const item of navItems) {
      expect(labels).toContain(item.label);
    }
    expect(pages).toHaveLength(navItems.length + 1);
  });

  it('exposes create actions for dashboard, data source, and alert rule', () => {
    const commands = assembleCommands({ navigate, dashboards: [] });
    const actions = commands.filter(c => c.group === 'actions').map(c => c.label);
    expect(actions).toEqual(['New dashboard', 'New data source', 'New alert rule']);
  });

  it('maps every dashboard to a command in the dashboards group', () => {
    const commands = assembleCommands({ navigate, dashboards });
    const group = commands.filter(c => c.group === 'dashboards');
    expect(group.map(c => c.label)).toEqual(['CPU Overview', 'Memory Usage']);
  });

  it('produces no dashboard commands when there are no dashboards', () => {
    const commands = assembleCommands({ navigate, dashboards: [] });
    expect(commands.some(c => c.group === 'dashboards')).toBe(false);
  });

  it('gives every command a unique id', () => {
    const commands = assembleCommands({ navigate, dashboards });
    const ids = commands.map(c => c.id);
    expect([...new Set(ids)]).toHaveLength(ids.length);
  });

  it('navigates to the dashboard route with its id when a dashboard command runs', () => {
    navigateSpy.mockClear();
    const commands = assembleCommands({ navigate, dashboards });
    const cpu = commands.find(c => c.label === 'CPU Overview');
    cpu?.run();
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/dashboards/$id', params: { id: 'id-1' } });
  });

  it('navigates to the create route when the New dashboard action runs', () => {
    navigateSpy.mockClear();
    const commands = assembleCommands({ navigate, dashboards: [] });
    const newDash = commands.find(c => c.label === 'New dashboard');
    newDash?.run();
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/dashboards/new' });
  });

  it('navigates to the nav target when a page command runs', () => {
    navigateSpy.mockClear();
    const commands = assembleCommands({ navigate, dashboards: [] });
    const explore = commands.find(c => c.label === 'Explore');
    explore?.run();
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/explore' });
  });
});

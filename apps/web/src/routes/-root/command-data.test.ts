import type { RecentDashboard } from './recent-dashboards-store';
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

const toggleThemeSpy = vi.fn<() => void>();

const dashboards = [
  { id: 'id-1', title: 'CPU Overview' },
  { id: 'id-2', title: 'Memory Usage' },
];

// Default deps with empty recents and a no-op theme toggle, overridable per case — keeps the
// callsites focused on the slice each test asserts.
const assemble = (over?: { dashboards?: readonly { id: string; title: string }[]; recents?: readonly RecentDashboard[] }) =>
  assembleCommands({ navigate, dashboards: over?.dashboards ?? [], recents: over?.recents ?? [], toggleTheme: toggleThemeSpy });

describe('assembleCommands', () => {
  it('includes a Home page plus every sidebar nav item in the pages group', () => {
    const commands = assemble();
    const pages = commands.filter(c => c.group === 'pages');
    const labels = pages.map(c => c.label);
    expect(labels).toContain('Home');
    for (const item of navItems) {
      expect(labels).toContain(item.label);
    }
    expect(pages).toHaveLength(navItems.length + 1);
  });

  it('exposes create actions plus a theme toggle in the actions group', () => {
    const commands = assemble();
    const actions = commands.filter(c => c.group === 'actions').map(c => c.label);
    expect(actions).toEqual(['New dashboard', 'New data source', 'New alert rule', 'Toggle theme']);
  });

  it('maps every dashboard to a command in the dashboards group', () => {
    const commands = assemble({ dashboards });
    const group = commands.filter(c => c.group === 'dashboards');
    expect(group.map(c => c.label)).toEqual(['CPU Overview', 'Memory Usage']);
  });

  it('produces no dashboard commands when there are no dashboards', () => {
    const commands = assemble();
    expect(commands.some(c => c.group === 'dashboards')).toBe(false);
  });

  it('gives every command a unique id', () => {
    const commands = assemble({ dashboards });
    const ids = commands.map(c => c.id);
    expect([...new Set(ids)]).toHaveLength(ids.length);
  });

  it('navigates to the dashboard route with its id when a dashboard command runs', () => {
    navigateSpy.mockClear();
    const commands = assemble({ dashboards });
    const cpu = commands.find(c => c.label === 'CPU Overview');
    cpu?.run();
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/dashboards/$id', params: { id: 'id-1' } });
  });

  it('navigates to the create route when the New dashboard action runs', () => {
    navigateSpy.mockClear();
    const commands = assemble();
    const newDash = commands.find(c => c.label === 'New dashboard');
    newDash?.run();
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/dashboards/new' });
  });

  it('navigates to the nav target when a page command runs', () => {
    navigateSpy.mockClear();
    const commands = assemble();
    const explore = commands.find(c => c.label === 'Explore');
    explore?.run();
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/explore' });
  });

  it('runs the injected toggleTheme dep when the Toggle theme action runs', () => {
    toggleThemeSpy.mockClear();
    const commands = assemble();
    const toggle = commands.find(c => c.id === 'action:toggle-theme');
    toggle?.run();
    expect(toggleThemeSpy).toHaveBeenCalledTimes(1);
  });

  it('maps recents to a recents group with recent:-prefixed ids', () => {
    const recents: readonly RecentDashboard[] = [
      { id: 'id-1', title: 'CPU Overview' },
      { id: 'id-9', title: 'Disk IO' },
    ];
    const commands = assemble({ recents });
    const group = commands.filter(c => c.group === 'recents');
    expect(group.map(c => c.label)).toEqual(['CPU Overview', 'Disk IO']);
    expect(group.map(c => c.id)).toEqual(['recent:id-1', 'recent:id-9']);
  });

  it('navigates to the dashboard route when a recent command runs', () => {
    navigateSpy.mockClear();
    const commands = assemble({ recents: [{ id: 'id-9', title: 'Disk IO' }] });
    const recent = commands.find(c => c.id === 'recent:id-9');
    recent?.run();
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/dashboards/$id', params: { id: 'id-9' } });
  });

  it('keeps ids unique when a dashboard appears in both recents and dashboards', () => {
    const recents: readonly RecentDashboard[] = [{ id: 'id-1', title: 'CPU Overview' }];
    const commands = assemble({ dashboards, recents });
    const ids = commands.map(c => c.id);
    expect([...new Set(ids)]).toHaveLength(ids.length);
    // The same dashboard surfaces in both groups (Grafana does too) under distinct ids.
    expect(commands.filter(c => c.label === 'CPU Overview')).toHaveLength(2);
  });
});

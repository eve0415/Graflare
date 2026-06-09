import type { RecentDashboard } from './recent-dashboards-store';
import type { useNavigate } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';

import { Bell, Clock, Database, FileText, Home, LayoutDashboard, Sun } from 'lucide-react';

import { navItems } from './nav-items';

/**
 * Result of `useNavigate()` — a route-validated imperative navigation function.
 * Typing the dependency this way keeps every `navigate({ to })` call inside the
 * command builders checked against the generated route tree (no widening to string).
 */
type Navigate = ReturnType<typeof useNavigate>;

/**
 * The buckets a command can belong to. A union (not a free string) so the palette can
 * render groups in a known order and new groups are an explicit, additive change.
 */
export type CommandGroupId = 'recents' | 'pages' | 'actions' | 'dashboards';

/**
 * A single executable entry in the command palette. Commands are plain data so the list
 * is assembled declaratively and new commands/groups are additive — no central switch.
 */
export interface CommandDescriptor {
  /** Stable unique id, used as the React key and for de-duplication. */
  readonly id: string;
  readonly group: CommandGroupId;
  /** Human-readable, also the primary text matched by the filter. */
  readonly label: string;
  /** Optional leading icon. */
  readonly icon?: LucideIcon;
  /** Extra terms the filter matches against, beyond the label. */
  readonly keywords?: readonly string[];
  /** Invoked when the command is chosen. */
  readonly run: () => void;
}

/** A dashboard summary, narrowed to just what the palette needs. */
export interface DashboardSummary {
  readonly id: string;
  readonly title: string;
}

export interface AssembleCommandsDeps {
  readonly navigate: Navigate;
  readonly dashboards: readonly DashboardSummary[];
  /** Recently-viewed dashboards, newest-first, surfaced as a top group. */
  readonly recents: readonly RecentDashboard[];
  /** Flip the active theme between light and dark. */
  readonly toggleTheme: () => void;
}

const buildPageCommands = (navigate: Navigate): CommandDescriptor[] => [
  { id: 'page:home', group: 'pages', label: 'Home', icon: Home, run: () => void navigate({ to: '/' }) },
  ...navItems.map(
    (item): CommandDescriptor => ({
      id: `page:${item.to}`,
      group: 'pages',
      label: item.label,
      icon: item.icon,
      run: () => void navigate({ to: item.to }),
    }),
  ),
];

const buildActionCommands = (navigate: Navigate, toggleTheme: () => void): CommandDescriptor[] => [
  {
    id: 'action:new-dashboard',
    group: 'actions',
    label: 'New dashboard',
    icon: LayoutDashboard,
    keywords: ['create', 'add'],
    run: () => void navigate({ to: '/dashboards/new' }),
  },
  {
    id: 'action:new-datasource',
    group: 'actions',
    label: 'New data source',
    icon: Database,
    keywords: ['create', 'add', 'datasource', 'connection'],
    run: () => void navigate({ to: '/datasources/new' }),
  },
  {
    id: 'action:new-alert-rule',
    group: 'actions',
    label: 'New alert rule',
    icon: Bell,
    keywords: ['create', 'add', 'alerting'],
    run: () => void navigate({ to: '/alerting/rules/new' }),
  },
  {
    id: 'action:toggle-theme',
    group: 'actions',
    label: 'Toggle theme',
    icon: Sun,
    keywords: ['dark', 'light', 'appearance', 'mode'],
    run: toggleTheme,
  },
];

const buildDashboardCommands = (dashboards: readonly DashboardSummary[], navigate: Navigate): CommandDescriptor[] =>
  dashboards.map(
    (d): CommandDescriptor => ({
      id: `dashboard:${d.id}`,
      group: 'dashboards',
      label: d.title,
      icon: FileText,
      run: () => void navigate({ to: '/dashboards/$id', params: { id: d.id } }),
    }),
  );

/**
 * Recently-viewed dashboards as their own group. The `recent:` id prefix keeps each entry
 * distinct from its `dashboard:`-prefixed twin, so a dashboard surfacing in both Recents and
 * Dashboards search collides on neither React keys nor the unique-id invariant — Grafana
 * shows recents alongside search results the same way.
 */
const buildRecentCommands = (recents: readonly RecentDashboard[], navigate: Navigate): CommandDescriptor[] =>
  recents.map(
    (r): CommandDescriptor => ({
      id: `recent:${r.id}`,
      group: 'recents',
      label: r.title,
      icon: Clock,
      run: () => void navigate({ to: '/dashboards/$id', params: { id: r.id } }),
    }),
  );

/**
 * Assemble the full, flat command list from the current navigation context, recently-viewed
 * dashboards, and the loaded dashboards. Order is canonical (recents, pages, actions,
 * dashboards); the filter layer groups and ranks from here.
 */
export const assembleCommands = ({ navigate, dashboards, recents, toggleTheme }: AssembleCommandsDeps): CommandDescriptor[] => [
  ...buildRecentCommands(recents, navigate),
  ...buildPageCommands(navigate),
  ...buildActionCommands(navigate, toggleTheme),
  ...buildDashboardCommands(dashboards, navigate),
];

import type { LucideIcon } from 'lucide-react';

import { Bell, Compass, Database, Import, LayoutDashboard } from 'lucide-react';

/**
 * Top-level navigation targets, shared between the sidebar and the command palette so
 * the list has a single source of truth.
 *
 * Declared `as const` so each `to` keeps its literal type — both TanStack Router's
 * `<Link to>` (sidebar) and `navigate({ to })` (palette) type-check route paths against
 * the generated route tree, which a widened `string` would defeat.
 */
export const navItems = [
  { to: '/dashboards', label: 'Dashboards', icon: LayoutDashboard },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/alerting', label: 'Alerting', icon: Bell },
  { to: '/datasources', label: 'Data Sources', icon: Database },
  { to: '/import', label: 'Import', icon: Import },
] as const satisfies readonly { to: string; label: string; icon: LucideIcon }[];

export type NavItem = (typeof navItems)[number];

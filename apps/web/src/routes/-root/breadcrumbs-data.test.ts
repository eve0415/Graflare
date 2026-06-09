import type { CrumbMatch } from './breadcrumbs-data';

import { describe, expect, it } from 'vitest';

import { deriveBreadcrumbs } from './breadcrumbs-data';

/**
 * Build a synthetic match. Only the fields the derivation reads are required;
 * `loaderData` defaults to `undefined` (the pending/no-loader case).
 */
const match = (fullPath: string, pathname: string, params: Record<string, string> = {}, loaderData?: unknown): CrumbMatch =>
  loaderData === undefined ? { fullPath, pathname, params } : { fullPath, pathname, params, loaderData };

const root = match('/', '/');

describe('deriveBreadcrumbs', () => {
  it('returns a single, non-linked Home crumb at the root', () => {
    const crumbs = deriveBreadcrumbs([root]);
    expect(crumbs).toEqual([{ label: 'Home' }]);
  });

  it('links every crumb except the last (current) one', () => {
    const crumbs = deriveBreadcrumbs([root, match('/dashboards/', '/dashboards')]);
    expect(crumbs).toEqual([{ label: 'Home', to: '/' }, { label: 'Dashboards' }]);
  });

  it('labels a static section from the central map', () => {
    const crumbs = deriveBreadcrumbs([root, match('/datasources/', '/datasources')]);
    expect(crumbs).toEqual([{ label: 'Home', to: '/' }, { label: 'Data Sources' }]);
  });

  it('fills the missing section crumb when the detail route parents to root (dashboard detail)', () => {
    // `/dashboards/$id/` parents to root, so the raw match chain lacks a `/dashboards` match.
    // The trail is rebuilt from the leaf fullPath so "Dashboards" still appears.
    const loaderData = [{ id: 'abc', title: 'CPU Overview' }, []];
    const crumbs = deriveBreadcrumbs([root, match('/dashboards/$id/', '/dashboards/abc', { id: 'abc' }, loaderData)]);
    expect(crumbs).toEqual([{ label: 'Home', to: '/' }, { label: 'Dashboards', to: '/dashboards' }, { label: 'CPU Overview' }]);
  });

  it('falls back to the id when the dynamic entity name is not loaded yet', () => {
    const crumbs = deriveBreadcrumbs([root, match('/dashboards/$id/', '/dashboards/abc', { id: 'abc' })]);
    expect(crumbs).toEqual([{ label: 'Home', to: '/' }, { label: 'Dashboards', to: '/dashboards' }, { label: 'abc' }]);
  });

  it('falls back to the id when the loaded entity is null (not found)', () => {
    const loaderData = [null, []];
    const crumbs = deriveBreadcrumbs([root, match('/dashboards/$id/', '/dashboards/missing', { id: 'missing' }, loaderData)]);
    expect(crumbs).toEqual([{ label: 'Home', to: '/' }, { label: 'Dashboards', to: '/dashboards' }, { label: 'missing' }]);
  });

  it('reads a tuple loaderData entity title (alert rule detail)', () => {
    const loaderData = [{ id: 'rule-1', title: 'High CPU usage' }, []];
    const crumbs = deriveBreadcrumbs([
      root,
      match('/alerting', '/alerting'),
      match('/alerting/rules/$id', '/alerting/rules/rule-1', { id: 'rule-1' }, loaderData),
    ]);
    expect(crumbs).toEqual([
      { label: 'Home', to: '/' },
      { label: 'Alerting', to: '/alerting' },
      { label: 'Alert Rules', to: '/alerting/rules' },
      { label: 'High CPU usage' },
    ]);
  });

  it('reads a non-tuple loaderData entity name (datasource detail)', () => {
    // The datasource edit route loads the entity directly (not wrapped in a tuple).
    const loaderData = { id: 'ds-1', name: 'Prometheus Prod' };
    const crumbs = deriveBreadcrumbs([
      root,
      match('/datasources/$id', '/datasources/ds-1', { id: 'ds-1' }),
      match('/datasources/$id/', '/datasources/ds-1', { id: 'ds-1' }, loaderData),
    ]);
    expect(crumbs).toEqual([{ label: 'Home', to: '/' }, { label: 'Data Sources', to: '/datasources' }, { label: 'Prometheus Prod' }]);
  });

  it('handles a middle dynamic segment followed by a static one (datasource query test)', () => {
    // `/datasources/$id/test` has no loader for the datasource, so the middle `$id`
    // crumb falls back to the id; the trailing static "Query Test" comes from the map.
    const crumbs = deriveBreadcrumbs([
      root,
      match('/datasources/$id', '/datasources/ds-1', { id: 'ds-1' }),
      match('/datasources/$id/test', '/datasources/ds-1/test', { id: 'ds-1' }),
    ]);
    expect(crumbs).toEqual([
      { label: 'Home', to: '/' },
      { label: 'Data Sources', to: '/datasources' },
      { label: 'ds-1', to: '/datasources/ds-1' },
      { label: 'Query Test' },
    ]);
  });

  it('resolves the dynamic name from whichever match carries the matching entity', () => {
    // The id-bearing entity may sit on a deeper match than the one introducing the segment.
    const loaderData = { id: 'ds-1', name: 'Prometheus Prod' };
    const crumbs = deriveBreadcrumbs([
      root,
      match('/datasources/$id', '/datasources/ds-1', { id: 'ds-1' }),
      match('/datasources/$id/', '/datasources/ds-1', { id: 'ds-1' }, loaderData),
    ]);
    expect(crumbs[2]).toEqual({ label: 'Prometheus Prod' });
  });

  it('labels deep static section trails (contact points)', () => {
    const crumbs = deriveBreadcrumbs([
      root,
      match('/alerting', '/alerting'),
      match('/alerting/notifications', '/alerting/notifications'),
      match('/alerting/notifications/contact-points/', '/alerting/notifications/contact-points'),
    ]);
    expect(crumbs).toEqual([
      { label: 'Home', to: '/' },
      { label: 'Alerting', to: '/alerting' },
      { label: 'Notifications', to: '/alerting/notifications' },
      { label: 'Contact Points' },
    ]);
  });

  it('labels a "new" leaf from the map (new dashboard)', () => {
    const crumbs = deriveBreadcrumbs([root, match('/dashboards/new', '/dashboards/new')]);
    expect(crumbs).toEqual([{ label: 'Home', to: '/' }, { label: 'Dashboards', to: '/dashboards' }, { label: 'New' }]);
  });

  it('ignores a tuple entry whose id does not match the segment and falls back to the id', () => {
    // A stale/other entity in loaderData must not be picked up for a different id.
    const loaderData = [{ id: 'other', title: 'Some Other Dashboard' }, []];
    const crumbs = deriveBreadcrumbs([root, match('/dashboards/$id/', '/dashboards/abc', { id: 'abc' }, loaderData)]);
    expect(crumbs[2]).toEqual({ label: 'abc' });
  });

  it('prefers title over name when both are present', () => {
    const loaderData = { id: 'abc', title: 'Title Wins', name: 'name loses' };
    const crumbs = deriveBreadcrumbs([root, match('/dashboards/$id/', '/dashboards/abc', { id: 'abc' }, loaderData)]);
    expect(crumbs[2]).toEqual({ label: 'Title Wins' });
  });

  it('returns an empty array when there are no matches', () => {
    expect(deriveBreadcrumbs([])).toEqual([]);
  });

  it('falls back to the raw segment for an unknown static path', () => {
    // Defensive: a route with no map entry still renders a (humanized) crumb rather than crashing.
    const crumbs = deriveBreadcrumbs([root, match('/mystery/', '/mystery')]);
    expect(crumbs).toEqual([{ label: 'Home', to: '/' }, { label: 'Mystery' }]);
  });
});

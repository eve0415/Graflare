import { navItems } from './nav-items';

/**
 * One breadcrumb in the trail. `to` is the route to link to; an absent `to` marks the
 * crumb as the current page (rendered as plain, `aria-current` text, never a link).
 *
 * Modelled as plain data so the trail is a derived array — new routes and dynamic
 * labels are additive (extend {@link CRUMB_LABELS} or the dynamic resolver), never a
 * change to the rendering component.
 */
export interface Crumb {
  readonly label: string;
  readonly to?: string;
}

/**
 * The slice of a router match the derivation reads. Deliberately minimal (and wider
 * than the router's own per-route types) so the pure logic is unit-testable with
 * synthetic matches and never depends on the generated route tree.
 *
 * - `fullPath` is the route *template* (`/datasources/$id/test`) — its `$`-prefixed
 *   segments mark the dynamic positions, and it is the stable key into the label map.
 * - `pathname` is the *concrete* URL (`/datasources/ds-1/test`) — it supplies each
 *   crumb's real `to` and the concrete id for a dynamic segment.
 * - `loaderData` is whatever the route's loader resolved (shape varies per route, may
 *   be absent while pending), scanned structurally for a dynamic crumb's entity name.
 */
export interface CrumbMatch {
  readonly fullPath: string;
  readonly pathname: string;
  readonly params: Record<string, string>;
  readonly loaderData?: unknown;
}

/**
 * Template-prefix → label for the static (non-dynamic) segments. The five top-level
 * sections reuse {@link navItems} so their labels have a single source of truth shared
 * with the sidebar and command palette; deeper segments are listed inline. Adding a
 * route's crumb is a one-line addition here.
 *
 * Dynamic (`$id`) segments are intentionally absent — their labels come from the
 * route's loaded entity (see {@link resolveDynamicLabel}), falling back to the id.
 */
const CRUMB_LABELS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(navItems.map(item => [item.to, item.label])),
  '/dashboards/new': 'New',
  '/datasources/new': 'New',
  '/datasources/$id/test': 'Query Test',
  '/alerting/rules': 'Alert Rules',
  '/alerting/rules/new': 'New',
  '/alerting/alerts': 'Alerts',
  '/alerting/silences': 'Silences',
  '/alerting/silences/new': 'New',
  '/alerting/mute-timings': 'Mute Timings',
  '/alerting/mute-timings/new': 'New',
  '/alerting/notifications': 'Notifications',
  '/alerting/notifications/contact-points': 'Contact Points',
  '/alerting/notifications/contact-points/new': 'New',
  '/alerting/notifications/policies': 'Notification Policies',
  '/alerting/notifications/policies/new': 'New',
};

const ROOT_CRUMB: Crumb = { label: 'Home', to: '/' };

/** Drop empty segments so a trailing slash or `//` doesn't yield blank crumbs. */
const segmentsOf = (path: string): string[] => path.split('/').filter(segment => segment.length > 0);

/** A template segment is dynamic when it is a TanStack path param (`$id`, `$slug`, …). */
const isDynamicSegment = (templateSegment: string): boolean => templateSegment.startsWith('$');

/** Title-case a raw path segment as a last-resort label for an unmapped static route. */
const humanizeSegment = (segment: string): string =>
  segment
    .split('-')
    .map(word => {
      const [first, ...rest] = word;
      return first === undefined ? word : first.toUpperCase() + rest.join('');
    })
    .join(' ');

/**
 * Pull a display name out of one loaded entity. Returns the entity's `title` (preferred,
 * for dashboards/rules) or `name` (datasources/contact points) only when the entity's
 * `id` matches the segment value — so a stale or sibling entity is never mislabelled.
 * Pure structural narrowing; no casts.
 */
const nameFromEntity = (entity: unknown, id: string): string | undefined => {
  if (typeof entity !== 'object' || entity === null) return undefined;
  if (!('id' in entity) || entity.id !== id) return undefined;
  if ('title' in entity && typeof entity.title === 'string' && entity.title.length > 0) return entity.title;
  if ('name' in entity && typeof entity.name === 'string' && entity.name.length > 0) return entity.name;
  return undefined;
};

/**
 * Find a dynamic segment's human label by scanning every match's `loaderData` for the
 * entity whose `id` equals the segment value. Loaders return that entity either directly
 * (datasource, contact point) or as the first element of a `[entity, …]` tuple (dashboard,
 * alert rule), so both the value and its array elements are inspected. Falls back to the
 * id when nothing has loaded yet (pending), the entity is `null` (not found), or the route
 * simply has no loader for it.
 */
const resolveDynamicLabel = (matches: readonly CrumbMatch[], id: string): string => {
  for (const candidate of matches) {
    const { loaderData } = candidate;
    if (Array.isArray(loaderData)) {
      for (const element of loaderData) {
        const name = nameFromEntity(element, id);
        if (name !== undefined) return name;
      }
    } else {
      const name = nameFromEntity(loaderData, id);
      if (name !== undefined) return name;
    }
  }
  return id;
};

/**
 * Build the breadcrumb trail for the active route from its matches.
 *
 * The trail mirrors the information-architecture hierarchy, not browser history: it is
 * rebuilt from the leaf match's `fullPath` so intermediate section crumbs appear even
 * when a detail route parents directly to the root (e.g. `/dashboards/$id/` →
 * `Home / Dashboards / <title>`). Every crumb links to its real page except the last,
 * which is the current page. Returns `[]` only when there are no matches at all.
 */
export const deriveBreadcrumbs = (matches: readonly CrumbMatch[]): Crumb[] => {
  const leaf = matches.at(-1);
  if (leaf === undefined) return [];

  const templateSegments = segmentsOf(leaf.fullPath);
  const concreteSegments = segmentsOf(leaf.pathname);

  const crumbs: Crumb[] = [ROOT_CRUMB];

  for (const [depth, templateSegment] of templateSegments.entries()) {
    // The concrete URL can be shorter than the template when an optional trailing
    // segment is absent; fall back to the template segment to stay in lockstep.
    const concreteSegment = concreteSegments[depth] ?? templateSegment;
    const templatePrefix = `/${templateSegments.slice(0, depth + 1).join('/')}`;
    const concretePrefix = `/${concreteSegments.slice(0, depth + 1).join('/')}`;

    const label = isDynamicSegment(templateSegment)
      ? resolveDynamicLabel(matches, concreteSegment)
      : (CRUMB_LABELS[templatePrefix] ?? humanizeSegment(templateSegment));

    crumbs.push({ label, to: concretePrefix });
  }

  // The current page (last crumb) is plain text, not a link.
  const current = crumbs.at(-1);
  if (current !== undefined) {
    crumbs[crumbs.length - 1] = { label: current.label };
  }

  return crumbs;
};

import type { CrumbMatch } from './breadcrumbs-data';

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@graflare/ui/components/breadcrumb';
import { Link, useMatches } from '@tanstack/react-router';
import { Fragment } from 'react';

import { deriveBreadcrumbs } from './breadcrumbs-data';

/**
 * Project the router's wide match union down to the minimal {@link CrumbMatch} the
 * derivation needs. Defined at module scope so its identity is stable across renders
 * (a fresh `select` each render would defeat `useMatches`' structural-sharing memo).
 */
const selectCrumbMatches = (matches: readonly { fullPath: string; pathname: string; params: Record<string, string>; loaderData?: unknown }[]): CrumbMatch[] =>
  matches.map(({ fullPath, pathname, params, loaderData }) => ({ fullPath, pathname, params, loaderData }));

/**
 * Top-bar breadcrumbs reflecting where the active route sits in the navigation tree
 * (e.g. `Home / Dashboards / CPU Overview`), not browser history. Driven entirely by
 * the router's active matches via {@link deriveBreadcrumbs}; every crumb links to its
 * page except the current one, which is plain `aria-current` text.
 */
export const Breadcrumbs = () => {
  const crumbs = useMatches({ select: selectCrumbMatches });
  const trail = deriveBreadcrumbs(crumbs);

  if (trail.length === 0) return null;

  return (
    // Override the primitive's lowercase default to the conventional capitalised label.
    // `min-w-0` + a single non-wrapping, clipped line let a deep trail truncate instead of
    // forcing the header (and the whole content pane) wider than the viewport — the h-12 bar is
    // too short to wrap to two lines, so the last crumb truncates with an ellipsis when cramped.
    <Breadcrumb aria-label='Breadcrumb' className='min-w-0'>
      <BreadcrumbList className='flex-nowrap overflow-hidden whitespace-nowrap'>
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          // `to` is the concrete, already-encoded pathname from the active match —
          // safe to feed straight back to <Link> (no raw param interpolation).
          const key = crumb.to ?? `current:${crumb.label}`;
          return (
            <Fragment key={key}>
              {index > 0 && <BreadcrumbSeparator className='shrink-0' />}
              {/* Earlier crumbs stay intact; only the last (current page) truncates, so the trail
                  reads "Home / … / Long Page Name…" rather than clipping mid-path. */}
              <BreadcrumbItem className={isLast ? 'min-w-0' : 'shrink-0'}>
                {isLast || crumb.to === undefined ? (
                  <BreadcrumbPage className='truncate'>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={crumb.to}>{crumb.label}</Link>} />
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

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
    <Breadcrumb aria-label='Breadcrumb'>
      <BreadcrumbList>
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          // `to` is the concrete, already-encoded pathname from the active match —
          // safe to feed straight back to <Link> (no raw param interpolation).
          const key = crumb.to ?? `current:${crumb.label}`;
          return (
            <Fragment key={key}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast || crumb.to === undefined ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
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

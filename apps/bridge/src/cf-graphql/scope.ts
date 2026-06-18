/** Per-scope pieces of a Cloudflare GraphQL `viewer` query — the bits that differ between an
 * account-scoped and a zone-scoped query (variable name, filter field, and viewer node). */
export interface ScopeConfig {
  /** GraphQL variable reference, e.g. `$accountId`. */
  idVar: string;
  /** `filter` field selecting the scope, e.g. `accountTag`. */
  filterKey: string;
  /** `viewer` child node holding the scope's data, e.g. `accounts`. */
  node: string;
}

export const SCOPE_CONFIG: Record<'account' | 'zone', ScopeConfig> = {
  account: { idVar: '$accountId', filterKey: 'accountTag', node: 'accounts' },
  zone: { idVar: '$zoneId', filterKey: 'zoneTag', node: 'zones' },
};

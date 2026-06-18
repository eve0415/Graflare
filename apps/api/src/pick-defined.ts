/**
 * Build a partial-update bag: copy only the keys whose value is `undefined`-free. Used by the
 * resource ops' update methods so a PATCH only writes the fields the caller actually sent.
 *
 * Returns `Record<string, unknown>` (the shape Drizzle's `.set()` accepts for a partial update) so
 * callers can spread it alongside computed fields, e.g. `{ ...pickDefined(input, keys), updatedAt }`.
 * Update bags whose fields need transforms (slugify, Date, secret resolution) stay explicit.
 */
export const pickDefined = <T extends object>(source: T, keys: readonly (keyof T)[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) out[String(key)] = value;
  }
  return out;
};

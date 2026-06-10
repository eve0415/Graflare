// Shared compiled-regex cache for user-authored patterns evaluated at render time
// (value mappings, field-override matchers). Patterns are few and stable while renders
// are hot (per table cell in the worst case), so compile each distinct pattern once.
// `null` is cached for invalid patterns so they don't retry compilation and behave as
// non-matching — exactly the try/catch→false semantics the call sites had inline.
const cache = new Map<string, RegExp | null>();

/** Compile `pattern` (no flags) once; returns null for invalid patterns. */
export const getCachedRegex = (pattern: string): RegExp | null => {
  const cached = cache.get(pattern);
  if (cached !== undefined) return cached;
  let compiled: RegExp | null;
  try {
    compiled = new RegExp(pattern);
  } catch {
    compiled = null;
  }
  cache.set(pattern, compiled);
  return compiled;
};

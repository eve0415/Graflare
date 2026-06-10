import type { Variable, VariableType } from '@graflare/shared/schemas/variable';

import { variableSchema } from '@graflare/shared/schemas/variable';

// Grafana's variable-name rule: letters, digits, and underscores only. The pattern also rejects
// an empty string, so a single regex test covers both the "required" and "bad chars" cases.
// `variableSchema` deliberately does NOT enforce this (its `name` is just min/max length), so the
// editor validates the format here and uniqueness against the dashboard's other variables.
const NAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export type NameError = 'empty' | 'invalid' | 'duplicate';

/**
 * Validate a variable name against Grafana's rules. Returns `null` when valid, otherwise the
 * specific reason so the form can show a precise message:
 * - `empty`: blank / whitespace-only
 * - `invalid`: contains anything outside `[a-zA-Z0-9_]`
 * - `duplicate`: collides (case-sensitively, like Grafana) with another variable's name
 *
 * `existingNames` must EXCLUDE the name of the row being edited so renaming a variable to its own
 * current value isn't flagged as a duplicate.
 */
export const validateVariableName = (name: string, existingNames: readonly string[]): NameError | null => {
  if (name.trim().length === 0) return 'empty';
  if (!NAME_PATTERN.test(name)) return 'invalid';
  if (existingNames.includes(name)) return 'duplicate';
  return null;
};

// Split a comma-separated list into trimmed, non-empty entries — used for `custom` choices and
// `interval` steps, both of which live in `options[]`.
export const splitCsv = (raw: string): string[] =>
  raw
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0);

/**
 * Reset the type-specific fields of a variable when its type changes, preserving only the common
 * fields (name, label, type). Everything else returns to the schema's defaults so a stale query,
 * regex, or option list can't leak across an unrelated type.
 */
export const resetForType = (variable: Variable, type: VariableType): Variable => ({
  name: variable.name,
  label: variable.label,
  type,
  // datasourceId is intentionally dropped on type change — only `query`/`adhoc` variables use it,
  // and it is re-selected from the per-type form.
  query: '',
  regex: '',
  sort: 'disabled',
  multi: false,
  includeAll: false,
  current: '',
  allValue: '',
  options: [],
  // Filters reset with the type; an adhoc variable's live filters are managed by the bar, not here.
  filters: [],
});

/**
 * A fresh variable for the "add" flow. `query` is the conventional first type in Grafana's editor.
 */
export const blankVariable = (): Variable => ({
  name: '',
  label: '',
  type: 'query',
  query: '',
  regex: '',
  sort: 'disabled',
  multi: false,
  includeAll: false,
  current: '',
  allValue: '',
  options: [],
  filters: [],
});

// A blocked save is either a name problem (which `variableSchema` can't express) or some other
// field failing the schema (e.g. an over-long query/regex). Keeping these distinct lets the form
// show the right message instead of blaming the name for an unrelated field.
export type VariableValidation = { ok: true; variable: Variable } | { ok: false; nameError: NameError } | { ok: false; fieldError: string };

/**
 * Final validation gate before a draft variable is committed. Checks the name (format +
 * uniqueness) first since `variableSchema` can't, then runs the schema as the catch-all for the
 * remaining fields. Returns the parsed (defaults-applied) variable on success, or a discriminated
 * error: `nameError` for a name problem, `fieldError` (a human-readable message) for anything else.
 */
export const validateVariable = (draft: Variable, existingNames: readonly string[]): VariableValidation => {
  const nameError = validateVariableName(draft.name, existingNames);
  if (nameError !== null) return { ok: false, nameError };
  const parsed = variableSchema.safeParse(draft);
  if (!parsed.success) {
    const [first] = parsed.error.issues;
    return { ok: false, fieldError: first?.message ?? 'Invalid variable configuration.' };
  }
  return { ok: true, variable: parsed.data };
};

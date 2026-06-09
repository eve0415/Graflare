import * as z from 'zod/mini';

// Panel data transformations — Grafana's `transformations: [{ id, options }]` panel field. Each
// transform runs in array order, taking the previous transform's series and returning new series
// (see transform/apply.ts). Modelled as a union of id-tagged objects (same pattern as
// fieldOverridePropertySchema / valueMappingSchema): one branch per transform id, each carrying an
// `options` shape typed to that id — never `any`, so the pipeline narrows on `id` with no casts.
// The set is additive: a new transform is a new branch + a new entry in the canonical id tuple
// below, and existing consumers keep narrowing exhaustively. Backward compatible — a stored panel
// with `transformations: []` (or none) parses and is a no-op.
//
// Grafana grounding (option keys mapped on import, see import/transformation-mapping.ts):
//   - reduce             collapse each series' samples to one value via a calc (Grafana ReducerID)
//   - filterFieldsByName include/exclude series whose label matches a name or regexp
//   - organize           rename / reorder / exclude series by label (Grafana organizeFields)
//   - sortBy             order the series list by label or value (see the divergence note below)
//   - limit              keep the first N series
//
// `sortBy` deliberately diverges from Grafana: Grafana's sortBy sorts ROWS within a frame by a
// named field (`{ sort: [{ field, desc }] }`); a Prometheus `ResultSeries` has no row table to sort,
// so here it sorts the SERIES LIST by derived label or latest value. The import maps Grafana's shape
// loosely (desc carries; the field name can't, so it picks value vs name heuristically).

// The reduce calc set: the single-value reducers that are meaningful on one series' samples and map
// 1:1 onto Grafana ReducerID names. `last`/`first` pick an endpoint sample; the rest aggregate the
// numeric samples. (Grafana allows an array of reducers producing multiple fields; a ResultSeries
// holds exactly one `value`, so we model one calc — import keeps reducers[0], warn-drops the rest.)
export const REDUCE_CALCS = ['last', 'first', 'min', 'max', 'mean', 'sum', 'count'] as const;
export const reduceCalcSchema = z.enum(REDUCE_CALCS);
export type ReduceCalc = z.infer<typeof reduceCalcSchema>;

const reduceTransformation = z.object({
  id: z.literal('reduce'),
  options: z.object({
    calc: z._default(reduceCalcSchema, 'last'),
  }),
});

// How filterFieldsByName matches a series label: exact name equality, or a RegExp test. Mirrors the
// two string-option field matchers we already model (byName / byRegexp in field-config.ts).
export const FILTER_FIELDS_MATCH_KINDS = ['byName', 'byRegexp'] as const;
export const filterFieldsMatchSchema = z.enum(FILTER_FIELDS_MATCH_KINDS);
export type FilterFieldsMatch = z.infer<typeof filterFieldsMatchSchema>;

const filterFieldsByNameTransformation = z.object({
  id: z.literal('filterFieldsByName'),
  options: z.object({
    // include keeps only matching series; exclude drops matching series.
    mode: z._default(z.enum(['include', 'exclude']), 'include'),
    match: z._default(filterFieldsMatchSchema, 'byName'),
    // The name to equal (byName) or the RegExp source to test (byRegexp). An empty value matches
    // nothing for include (keep none) / nothing for exclude (drop none) — see the transform.
    value: z._default(z.string().check(z.maxLength(512)), ''),
  }),
});

// organize: rename / reorder / exclude series keyed by their CURRENT derived label (Grafana keys by
// field name; our key is the same display label deriveSeriesLabel returns). All three maps default
// to empty, so an organize with only renames (or only an order) is valid. Bounds keep a hostile
// import from carrying an unbounded map (mirrors the override-array cap).
const organizeTransformation = z.object({
  id: z.literal('organize'),
  options: z.object({
    // label → true means "exclude this series". (false / absent = keep.)
    excludeByName: z._default(z.record(z.string(), z.boolean()), {}),
    // label → new display label. Empty string = no rename (keep the original label).
    renameByName: z._default(z.record(z.string(), z.string()), {}),
    // label → desired position. Series are ordered by this index ascending; series with no entry
    // keep their original relative order after the indexed ones (stable — see the transform).
    indexByName: z._default(z.record(z.string(), z.number()), {}),
  }),
});

const sortByTransformation = z.object({
  id: z.literal('sortBy'),
  options: z.object({
    // Sort the series list by its derived label ('name') or its latest sample value ('value').
    by: z._default(z.enum(['name', 'value']), 'name'),
    desc: z._default(z.boolean(), false),
  }),
});

const limitTransformation = z.object({
  id: z.literal('limit'),
  options: z.object({
    // Keep the first `count` series (after any preceding sort). 0 keeps none. Bounded so a hostile
    // import can't request an absurd slice; real dashboards stay well under.
    count: z._default(z.int().check(z.minimum(0), z.maximum(10000)), 10),
  }),
});

export const transformationSchema = z.union([
  reduceTransformation,
  filterFieldsByNameTransformation,
  organizeTransformation,
  sortByTransformation,
  limitTransformation,
]);

export type Transformation = z.infer<typeof transformationSchema>;
export type TransformationId = Transformation['id'];

// Per-id option types, projected off the union so the pipeline's per-transform fns take exactly
// their own options shape (never the whole union, never `any`). Extract<T, {id}> narrows the union
// to the one branch, `['options']` reads its options.
export type ReduceOptions = Extract<Transformation, { id: 'reduce' }>['options'];
export type FilterFieldsByNameOptions = Extract<Transformation, { id: 'filterFieldsByName' }>['options'];
export type OrganizeOptions = Extract<Transformation, { id: 'organize' }>['options'];
export type SortByOptions = Extract<Transformation, { id: 'sortBy' }>['options'];
export type LimitOptions = Extract<Transformation, { id: 'limit' }>['options'];

// Compile-time guard that an id tuple lists EVERY TransformationId (same trick as
// exhaustivePropertyIds in field-config.ts): the parameter type resolves to the tuple only when
// `Exclude` of the listed ids from the union is `never`, else to `never`. Keeps the canonical array
// below in lockstep with the union — adding a transform branch without listing its id fails to
// compile, exactly where the editor would otherwise silently stop offering it.
const exhaustiveTransformationIds = <const T extends readonly TransformationId[]>(ids: [Exclude<TransformationId, T[number]>] extends [never] ? T : never): T =>
  ids;

// The canonical transform-id set: the single source of truth for the (deferred) transform editor's
// "Add transformation" menu and for the import mapping's supported-id check. Adding a 6th transform
// to the union without listing it here fails to compile.
export const TRANSFORMATION_IDS = exhaustiveTransformationIds(['reduce', 'filterFieldsByName', 'organize', 'sortBy', 'limit']);

// Build a fresh, well-formed transformation of the given id with neutral starting options (same
// factory pattern as makeFieldOverrideProperty / makeValueMapping). The deferred editor uses this
// when "Add transformation" picks an id: the transforms array must stay a valid union, and a spread
// would leave options of the wrong shape for the new branch.
export const makeTransformation = (id: TransformationId): Transformation => {
  switch (id) {
    case 'reduce':
      return { id, options: { calc: 'last' } };
    case 'filterFieldsByName':
      return { id, options: { mode: 'include', match: 'byName', value: '' } };
    case 'organize':
      return { id, options: { excludeByName: {}, renameByName: {}, indexByName: {} } };
    case 'sortBy':
      return { id, options: { by: 'name', desc: false } };
    case 'limit':
      return { id, options: { count: 10 } };
    default: {
      // Exhaustiveness guard: a new transformation id must add a branch above.
      const _exhaustive: never = id;
      throw new Error(`Unknown transformation id: ${String(_exhaustive)}`);
    }
  }
};

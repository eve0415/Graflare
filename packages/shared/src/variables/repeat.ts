import type { GridPos, Panel } from '../schemas/panel';
import type { Variable } from '../schemas/variable';

/** One renderable instance produced by {@link expandRepeats}. */
export interface RepeatedPanel {
  /** The panel to render — gridPos recomputed; the original object when nothing changed. */
  panel: Panel;
  /**
   * Stable render identity: the source instance keeps `panel.id`; clones append
   * `:repeat:<encodeURIComponent(value)>`. Value-keyed (not index-keyed) so reordering the
   * variable's selection never reassigns a key to a different value.
   */
  key: string;
  /** The variable map this instance interpolates with (the repeat variable scoped to one value). */
  values: ReadonlyMap<string, string | string[]>;
  /** True only for clone instances (index > 0) of a repeat panel. */
  isRepeatClone: boolean;
  /** Always the id of the panel this instance was expanded from. */
  sourceId: string;
}

const GRID_WIDTH = 24;

const sameGridPos = (a: GridPos, b: GridPos): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Reuse the original panel object when the computed position is identical (stable render identity). */
const withGridPos = (panel: Panel, gridPos: GridPos): Panel => (sameGridPos(panel.gridPos, gridPos) ? panel : { ...panel, gridPos });

/**
 * Copy the shared map with the repeat variable pinned to one value. The value is array-wrapped
 * for a multi/include-all variable so the multi-value PromQL formatting (per-value RE2 escaping)
 * still applies to the single scoped value — matching Grafana's LocalValueVariable keeping
 * `isMulti`.
 */
const scopeValues = (values: ReadonlyMap<string, string | string[]>, name: string, value: string, wrap: boolean): ReadonlyMap<string, string | string[]> => {
  const scoped = new Map(values);
  scoped.set(name, wrap ? [value] : value);
  return scoped;
};

const cloneKey = (id: string, value: string): string => `${id}:repeat:${encodeURIComponent(value)}`;

/** The values a repeat panel expands over; empty means "render a single placeholder". */
const resolveRepeatList = (raw: string | string[] | undefined): readonly string[] => {
  if (raw === undefined) return [];
  if (Array.isArray(raw)) return raw;
  return raw === '' ? [] : [raw];
};

/**
 * Expand repeating panels into renderable instances (Grafana semantics). Pure and runtime-only:
 * the input panels are never mutated and clones are never persisted — callers re-run this over
 * the saved panels whenever the variable values change.
 *
 * - A panel without `repeat` passes through with the shared `values` map (one entry, key = id).
 * - A repeat panel becomes one instance per value of its variable. Instance 0 is the source
 *   (key = id, not a clone) and is scoped to its value exactly like every clone.
 * - No values (missing/empty/unknown variable) renders ONE placeholder scoped to `''` with the
 *   source's own gridPos — a repeat panel never disappears entirely.
 * - 'h' lays the block out on the full 24-wide band below the source y: rows are balanced
 *   (5 values at maxPerRow 4 → 2×3, not 4+1) and integer widths spread the remainder over the
 *   leading columns. 'v' stacks instances, keeping the source x/w.
 * - Panels later in reading order (sorted by y, ties by x) shift down by the height every
 *   expanded block gained, so nothing overlaps.
 */
export const expandRepeats = (panels: readonly Panel[], variables: readonly Variable[], values: ReadonlyMap<string, string | string[]>): RepeatedPanel[] => {
  const ordered = panels.toSorted((a, b) => a.gridPos.y - b.gridPos.y || a.gridPos.x - b.gridPos.x);
  const result: RepeatedPanel[] = [];
  let shift = 0;

  for (const panel of ordered) {
    const { gridPos, repeat } = panel;
    const baseY = gridPos.y + shift;

    if (repeat === undefined) {
      result.push({
        panel: withGridPos(panel, { ...gridPos, y: baseY }),
        key: panel.id,
        values,
        isRepeatClone: false,
        sourceId: panel.id,
      });
      continue;
    }

    const variable = variables.find(v => v.name === repeat);
    const wrap = variable !== undefined && (variable.multi || variable.includeAll);
    // An unknown variable name never expands, even if the map happens to hold a value for it.
    const list = resolveRepeatList(variable === undefined ? undefined : values.get(repeat));

    if (list.length === 0) {
      result.push({
        panel: withGridPos(panel, { ...gridPos, y: baseY }),
        key: panel.id,
        values: scopeValues(values, repeat, '', wrap),
        isRepeatClone: false,
        sourceId: panel.id,
      });
      continue;
    }

    const { h } = gridPos;

    if (panel.repeatDirection === 'v') {
      for (const [i, value] of list.entries()) {
        result.push({
          panel: withGridPos(panel, { ...gridPos, y: baseY + i * h }),
          key: i === 0 ? panel.id : cloneKey(panel.id, value),
          values: scopeValues(values, repeat, value, wrap),
          isRepeatClone: i > 0,
          sourceId: panel.id,
        });
      }
      shift += (list.length - 1) * h;
      continue;
    }

    // 'h': the block claims the full 24-wide band starting at the (shifted) source y, overriding
    // the source's own x/w. Balanced grid: rowCount from maxPerRow, columns rebalanced across
    // those rows; the integer division remainder widens the leading columns by one.
    const rowCount = Math.ceil(list.length / panel.maxPerRow);
    const columnCount = Math.ceil(list.length / rowCount);
    const baseWidth = Math.floor(GRID_WIDTH / columnCount);
    const remainder = GRID_WIDTH % columnCount;
    for (const [i, value] of list.entries()) {
      const column = i % columnCount;
      const row = Math.floor(i / columnCount);
      result.push({
        panel: withGridPos(panel, {
          x: column * baseWidth + Math.min(column, remainder),
          y: baseY + row * h,
          w: baseWidth + (column < remainder ? 1 : 0),
          h,
        }),
        key: i === 0 ? panel.id : cloneKey(panel.id, value),
        values: scopeValues(values, repeat, value, wrap),
        isRepeatClone: i > 0,
        sourceId: panel.id,
      });
    }
    shift += (rowCount - 1) * h;
  }

  return result;
};

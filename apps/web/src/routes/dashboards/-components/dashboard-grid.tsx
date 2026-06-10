import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { Variable } from '@graflare/shared/schemas/variable';
import type { RepeatedPanel } from '@graflare/shared/variables/repeat';
import type { Layout } from 'react-grid-layout';

import { useMemo } from 'react';
import RGL, { calcGridItemPosition, useContainerWidth, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';

import { PanelRenderer } from './panels/panel-renderer';

const GridLayout = RGL;

interface DashboardGridProps {
  /**
   * The renderable instances — repeat-expanded in view mode, identity-mapped source panels in
   * edit mode (one contract either way). Each item carries its own scoped variable map; items are
   * keyed by `item.key` so a clone's React/query identity is stable across re-expansion.
   */
  items: readonly RepeatedPanel[];
  timeRange: { from: string; to: string };
  refreshInterval: number | false;
  editMode: boolean;
  // `| undefined` so the caller can wire the handler conditionally (edit mode only) without
  // tripping exactOptionalPropertyTypes on an explicit `undefined` JSX value.
  onLayoutChange?: ((panels: Panel[]) => void) | undefined;
  adhocVariables: readonly Variable[];
  annotations: readonly Annotation[];
}

const ROW_HEIGHT = 30;
const COLS = 24;
const MARGIN: readonly [number, number] = [10, 10];
// The fork resolves a null containerPadding to the margin, so mirror that here for the
// panel-size math to match the grid's own layout exactly (no drift between the two).
const CONTAINER_PADDING: readonly [number, number] = MARGIN;
const GRID_CONFIG = { cols: COLS, rowHeight: ROW_HEIGHT, margin: MARGIN };

// `min-width: 0` lets each panel cell shrink below a wide child instead of forcing the grid
// wider than the viewport (the flexbox/grid won't-shrink trap). Hoisted so the JSX map doesn't
// allocate a fresh style object per panel per render.
const PANEL_CELL_STYLE = { minWidth: 0 } as const;

export const DashboardGrid = ({ items, timeRange, refreshInterval, editMode, onLayoutChange, adhocVariables, annotations }: DashboardGridProps) => {
  // The fork's WidthProvider replacement: a ResizeObserver on `containerRef` that yields the
  // live container width (initialWidth 1280 until measured). `mounted` is false until the
  // first measurement — we gate the grid on it so the 1280 fallback is never painted at a
  // narrow viewport (which is exactly the horizontal-overflow bug being fixed).
  const { width, containerRef, mounted } = useContainerWidth();

  const layout = useMemo(
    () =>
      items.map(({ key, panel }) => ({
        i: key,
        x: panel.gridPos.x,
        y: panel.gridPos.y,
        w: panel.gridPos.w,
        h: panel.gridPos.h,
      })),
    [items],
  );

  // Reserve the grid's vertical box from the row extent so the width-measurement commit
  // (mounted false → true) doesn't change page height — no layout shift on first paint.
  const wrapperStyle = useMemo(() => {
    let maxRow = 0;
    for (const { panel } of items) maxRow = Math.max(maxRow, panel.gridPos.y + panel.gridPos.h);
    const minHeight = maxRow * (ROW_HEIGHT + MARGIN[1]) + MARGIN[1];
    return { minWidth: 0, minHeight };
  }, [items]);

  // Pixel width of each panel's cell, derived from the measured container with the SAME grid
  // params the layout uses (cols/margin/padding) via the fork's own position math — so the
  // canvas width tracks the real column width at every resolution instead of a fixed guess.
  const panelPixelSize = useMemo(() => {
    const params = { margin: MARGIN, containerPadding: CONTAINER_PADDING, containerWidth: width, cols: COLS, rowHeight: ROW_HEIGHT, maxRows: Infinity };
    const sizes = new Map<string, { width: number; height: number }>();
    for (const { key, panel } of items) {
      const pos = calcGridItemPosition(params, panel.gridPos.x, panel.gridPos.y, panel.gridPos.w, panel.gridPos.h);
      sizes.set(key, { width: pos.width, height: pos.height });
    }
    return sizes;
  }, [items, width]);

  const handleLayoutChange = useMemo(
    () => (newLayout: Layout) => {
      if (onLayoutChange === undefined) return;
      // Map the layout positions back onto the SOURCE panels only. Repeat clones are runtime
      // render artifacts — they must never flow into the edit-mode panel state or a save. (In
      // edit mode the items ARE the source panels, so this is exactly the pre-repeat behavior.)
      const updated: Panel[] = [];
      for (const item of items) {
        if (item.isRepeatClone) continue;
        const layoutItem = newLayout.find(l => l.i === item.key);
        updated.push(
          layoutItem === undefined ? item.panel : { ...item.panel, gridPos: { x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h } },
        );
      }
      onLayoutChange(updated);
    },
    [items, onLayoutChange],
  );

  const dragConfig = useMemo(() => ({ enabled: editMode }), [editMode]);
  const resizeConfig = useMemo(() => ({ enabled: editMode }), [editMode]);

  return (
    // `min-width: 0` lets the wrapper shrink below any wide panel child instead of forcing the
    // grid wider than the viewport (the flexbox/grid won't-shrink trap that reintroduces overflow).
    <div ref={containerRef} style={wrapperStyle}>
      {mounted && (
        <GridLayout
          layout={layout}
          width={width}
          gridConfig={GRID_CONFIG}
          compactor={verticalCompactor}
          dragConfig={dragConfig}
          resizeConfig={resizeConfig}
          onLayoutChange={handleLayoutChange}
        >
          {items.map((item, index) => {
            const size = panelPixelSize.get(item.key);
            return (
              <div key={item.key} data-panel-index={index} style={PANEL_CELL_STYLE}>
                <PanelRenderer
                  panel={item.panel}
                  timeRange={timeRange}
                  refetchInterval={typeof refreshInterval === 'number' ? refreshInterval : false}
                  width={size?.width ?? item.panel.gridPos.w * (ROW_HEIGHT + MARGIN[0])}
                  height={size?.height ?? item.panel.gridPos.h * ROW_HEIGHT}
                  variables={item.values}
                  adhocVariables={adhocVariables}
                  annotations={annotations}
                />
              </div>
            );
          })}
        </GridLayout>
      )}
    </div>
  );
};

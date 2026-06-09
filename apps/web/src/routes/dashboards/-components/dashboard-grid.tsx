import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { Layout } from 'react-grid-layout';

import { useMemo } from 'react';
import RGL, { calcGridItemPosition, useContainerWidth, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';

import { PanelRenderer } from './panels/panel-renderer';

const GridLayout = RGL;

interface DashboardGridProps {
  panels: Panel[];
  timeRange: { from: string; to: string };
  refreshInterval: number | false;
  editMode: boolean;
  onLayoutChange?: (panels: Panel[]) => void;
  variables: ReadonlyMap<string, string | string[]>;
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

export const DashboardGrid = ({ panels, timeRange, refreshInterval, editMode, onLayoutChange, variables, annotations }: DashboardGridProps) => {
  // The fork's WidthProvider replacement: a ResizeObserver on `containerRef` that yields the
  // live container width (initialWidth 1280 until measured). `mounted` is false until the
  // first measurement — we gate the grid on it so the 1280 fallback is never painted at a
  // narrow viewport (which is exactly the horizontal-overflow bug being fixed).
  const { width, containerRef, mounted } = useContainerWidth();

  const layout = useMemo(
    () =>
      panels.map(p => ({
        i: p.id,
        x: p.gridPos.x,
        y: p.gridPos.y,
        w: p.gridPos.w,
        h: p.gridPos.h,
      })),
    [panels],
  );

  // Reserve the grid's vertical box from the row extent so the width-measurement commit
  // (mounted false → true) doesn't change page height — no layout shift on first paint.
  const wrapperStyle = useMemo(() => {
    let maxRow = 0;
    for (const p of panels) maxRow = Math.max(maxRow, p.gridPos.y + p.gridPos.h);
    const minHeight = maxRow * (ROW_HEIGHT + MARGIN[1]) + MARGIN[1];
    return { minWidth: 0, minHeight };
  }, [panels]);

  // Pixel width of each panel's cell, derived from the measured container with the SAME grid
  // params the layout uses (cols/margin/padding) via the fork's own position math — so the
  // canvas width tracks the real column width at every resolution instead of a fixed guess.
  const panelPixelSize = useMemo(() => {
    const params = { margin: MARGIN, containerPadding: CONTAINER_PADDING, containerWidth: width, cols: COLS, rowHeight: ROW_HEIGHT, maxRows: Infinity };
    const sizes = new Map<string, { width: number; height: number }>();
    for (const p of panels) {
      const pos = calcGridItemPosition(params, p.gridPos.x, p.gridPos.y, p.gridPos.w, p.gridPos.h);
      sizes.set(p.id, { width: pos.width, height: pos.height });
    }
    return sizes;
  }, [panels, width]);

  const handleLayoutChange = useMemo(
    () => (newLayout: Layout) => {
      if (onLayoutChange === undefined) return;
      const updated = panels.map(p => {
        const layoutItem = newLayout.find(l => l.i === p.id);
        if (layoutItem === undefined) return p;
        return {
          ...p,
          gridPos: { x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h },
        };
      });
      onLayoutChange(updated);
    },
    [panels, onLayoutChange],
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
          {panels.map((panel, index) => {
            const size = panelPixelSize.get(panel.id);
            return (
              <div key={panel.id} data-panel-index={index} style={PANEL_CELL_STYLE}>
                <PanelRenderer
                  panel={panel}
                  timeRange={timeRange}
                  refetchInterval={typeof refreshInterval === 'number' ? refreshInterval : false}
                  width={size?.width ?? panel.gridPos.w * (ROW_HEIGHT + MARGIN[0])}
                  height={size?.height ?? panel.gridPos.h * ROW_HEIGHT}
                  variables={variables}
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

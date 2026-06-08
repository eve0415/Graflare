import type { Panel } from '@graflare/shared/schemas/panel';
import type { Layout } from 'react-grid-layout';

import { useMemo } from 'react';
import RGL, { verticalCompactor } from 'react-grid-layout';
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
}

const ROW_HEIGHT = 30;
const COLS = 24;
const GRID_CONFIG = { cols: COLS, rowHeight: ROW_HEIGHT };

export const DashboardGrid = ({ panels, timeRange, refreshInterval, editMode, onLayoutChange, variables }: DashboardGridProps) => {
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
    <GridLayout
      layout={layout}
      width={1200}
      gridConfig={GRID_CONFIG}
      compactor={verticalCompactor}
      dragConfig={dragConfig}
      resizeConfig={resizeConfig}
      onLayoutChange={handleLayoutChange}
    >
      {panels.map((panel, index) => (
        <div key={panel.id} data-panel-index={index}>
          <PanelRenderer
            panel={panel}
            timeRange={timeRange}
            refetchInterval={typeof refreshInterval === 'number' ? refreshInterval : false}
            width={panel.gridPos.w * (ROW_HEIGHT + 10)}
            height={panel.gridPos.h * ROW_HEIGHT}
            variables={variables}
          />
        </div>
      ))}
    </GridLayout>
  );
};

import type { Panel } from '@graflare/shared/schemas/panel';

import { useMemo } from 'react';
import RGL from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';

import { PanelRenderer } from '../../../components/panels/panel-renderer';

const ResponsiveGridLayout = RGL;

interface DashboardGridProps {
  panels: Panel[];
  timeRange: { from: string; to: string };
  refreshInterval: number | false;
  editMode: boolean;
  onLayoutChange?: (panels: Panel[]) => void;
}

const ROW_HEIGHT = 30;
const COLS = 24;

export const DashboardGrid = ({ panels, timeRange, refreshInterval, editMode, onLayoutChange }: DashboardGridProps) => {
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

  const handleLayoutChange = useMemo(() => {
    if (onLayoutChange === undefined) return;
    return (newLayout: { i: string; x: number; y: number; w: number; h: number }[]) => {
      const updated = panels.map(p => {
        const layoutItem = newLayout.find(l => l.i === p.id);
        if (layoutItem === undefined) return p;
        return {
          ...p,
          gridPos: { x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h },
        };
      });
      onLayoutChange(updated);
    };
  }, [panels, onLayoutChange]);

  return (
    <ResponsiveGridLayout
      layout={layout}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      width={1200}
      isDraggable={editMode}
      isResizable={editMode}
      compactType='vertical'
      onLayoutChange={handleLayoutChange}
    >
      {panels.map((panel, index) => (
        <div key={panel.id} data-panel-index={index}>
          <PanelRenderer
            panel={panel}
            timeRange={timeRange}
            refetchInterval={typeof refreshInterval === 'number' ? refreshInterval + index * 100 : false}
            width={panel.gridPos.w * (ROW_HEIGHT + 10)}
            height={panel.gridPos.h * ROW_HEIGHT}
          />
        </div>
      ))}
    </ResponsiveGridLayout>
  );
};

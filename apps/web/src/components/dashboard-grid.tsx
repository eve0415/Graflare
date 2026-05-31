import type { Panel } from '@graflare/shared/schemas/panel';

import { useMemo } from 'react';
import ReactGridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';

const { Responsive, WidthProvider } = ReactGridLayout;

import { PanelRenderer } from './panels/panel-renderer';

const ResponsiveGridLayout = WidthProvider(Responsive);

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
    if (onLayoutChange === undefined) return undefined;
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
      layouts={{ lg: layout }}
      breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
      cols={{ lg: COLS, md: 18, sm: 12, xs: 6, xxs: 3 }}
      rowHeight={ROW_HEIGHT}
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

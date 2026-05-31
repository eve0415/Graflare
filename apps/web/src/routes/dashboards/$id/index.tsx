import type { Panel } from '@graflare/shared/schemas/panel';

import { panelSchema } from '@graflare/shared/schemas/panel';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';

import { DashboardGrid } from '../../../components/dashboard-grid';
import { DashboardToolbar } from '../../../components/dashboard-toolbar';
import { updateDashboard } from '../../../lib/api';
import { dashboardQueryOptions } from '../../../lib/query-options';

type RefreshInterval = '5s' | '10s' | '30s' | '1m' | '5m' | '15m' | '30m' | '1h' | 'off';

const intervalToMs: Record<RefreshInterval, number | false> = {
  off: false,
  '5s': 5000,
  '10s': 10000,
  '30s': 30000,
  '1m': 60000,
  '5m': 300000,
  '15m': 900000,
  '30m': 1800000,
  '1h': 3600000,
};

const parsePanels = (raw: unknown): Panel[] => {
  if (!Array.isArray(raw)) return [];
  const result: Panel[] = [];
  for (const item of raw) {
    const parsed = panelSchema.safeParse(item);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
};

const DashboardViewPage = () => {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: dashboard } = useSuspenseQuery(dashboardQueryOptions(id));

  const [timeRange, setTimeRange] = useState({ from: 'now-1h', to: 'now' });
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>('off');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panels, setPanels] = useState<Panel[]>([]);

  const dashboardPanels = useMemo(() => {
    if (dashboard === null) return [];
    if (panels.length > 0 && editMode) return panels;
    return parsePanels(dashboard.panels);
  }, [dashboard, panels, editMode]);

  const handleEditToggle = useCallback(() => {
    setEditMode(prev => {
      if (!prev && dashboard !== null) {
        setPanels(parsePanels(dashboard.panels));
      }
      return !prev;
    });
  }, [dashboard]);

  const handleLayoutChange = useCallback((updatedPanels: Panel[]) => {
    setPanels(updatedPanels);
  }, []);

  const handleSave = useCallback(() => {
    if (dashboard === null) return;
    const run = async () => {
      setSaving(true);
      try {
        await updateDashboard({ data: { id, data: { panels, message: 'Layout updated' } } });
        await queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
        setEditMode(false);
      } finally {
        setSaving(false);
      }
    };
    void run();
  }, [id, panels, dashboard, queryClient]);

  if (dashboard === null) {
    return <p className='text-muted-foreground'>Dashboard not found.</p>;
  }

  const refetchMs = intervalToMs[refreshInterval];

  return (
    <div className='-m-6 flex flex-col'>
      <DashboardToolbar
        title={dashboard.title}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        refreshInterval={refreshInterval}
        onRefreshIntervalChange={setRefreshInterval}
        editMode={editMode}
        onEditModeToggle={handleEditToggle}
        onSave={handleSave}
        saving={saving}
      />

      <div className='flex-1 p-4'>
        {dashboardPanels.length === 0 ? (
          <div className='text-muted-foreground flex flex-col items-center justify-center py-16'>
            <p className='text-lg'>No panels yet</p>
            <p className='text-sm'>Switch to edit mode to add panels.</p>
          </div>
        ) : (
          <DashboardGrid
            panels={dashboardPanels}
            timeRange={timeRange}
            refreshInterval={refetchMs}
            editMode={editMode}
            onLayoutChange={handleLayoutChange}
          />
        )}
      </div>
    </div>
  );
};

export const Route = createFileRoute('/dashboards/$id/')({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(dashboardQueryOptions(params.id)),
  component: DashboardViewPage,
});

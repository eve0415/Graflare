import type { Panel } from '@graflare/shared/schemas/panel';
import type { Variable } from '@graflare/shared/schemas/variable';

import { panelSchema } from '@graflare/shared/schemas/panel';
import { variableSchema } from '@graflare/shared/schemas/variable';
import { Button } from '@graflare/ui/components/button';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { updateDashboard } from '../-api';
import { DashboardGrid } from '../-components/dashboard-grid';
import { DashboardSettings } from '../-components/dashboard-settings';
import { DashboardToolbar } from '../-components/dashboard-toolbar';
import { DashboardViewSkeleton } from '../-components/dashboard-view-skeleton';
import { PanelEditor } from '../-components/panel-editor';
import { VariableBar } from '../-components/variable-bar';
import { dashboardQueryOptions } from '../-queries';

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

const parseVariables = (raw: unknown): Variable[] => {
  if (!Array.isArray(raw)) return [];
  const result: Variable[] = [];
  for (const item of raw) {
    const parsed = variableSchema.safeParse(item);
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
  const [editingPanel, setEditingPanel] = useState<Panel | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [variableValues, setVariableValues] = useState<Map<string, string>>(new Map());

  const dashboardPanels = useMemo(() => {
    if (dashboard === null) return [];
    if (panels.length > 0 && editMode) return panels;
    return parsePanels(dashboard.panels);
  }, [dashboard, panels, editMode]);

  const dashboardVariables = useMemo(() => {
    if (dashboard === null) return [];
    return parseVariables(dashboard.variables);
  }, [dashboard]);

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

  const handlePanelSave = useCallback((updated: Panel) => {
    setPanels(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    setEditingPanel(null);
  }, []);

  const handlePanelEditorClose = useCallback(() => {
    setEditingPanel(null);
  }, []);

  const handleAddPanel = useCallback(() => {
    const newPanel: Panel = {
      id: `panel-${String(Date.now())}`,
      type: 'timeseries',
      title: 'New Panel',
      description: '',
      queries: [{ refId: 'A', expr: '', legendFormat: '' }],
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      thresholds: [],
      displayOptions: {},
    };
    setPanels(prev => [...prev, newPanel]);
    setEditingPanel(newPanel);
  }, []);

  const handleSettingsOpen = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleSettingsClose = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const handleSettingsSave = useCallback(
    (data: { title: string; description: string; tags: string[] }) => {
      const run = async () => {
        await updateDashboard({ data: { id, data: { ...data, message: 'Settings updated' } } });
        await queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
      };
      void run();
    },
    [id, queryClient],
  );

  const handleRestore = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
  }, [id, queryClient]);

  const handleVariableChange = useCallback((name: string, value: string) => {
    setVariableValues(prev => {
      const next = new Map(prev);
      next.set(name, value);
      return next;
    });
  }, []);

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
        onSettings={handleSettingsOpen}
        saving={saving}
      />

      <VariableBar variables={dashboardVariables} values={variableValues} onChange={handleVariableChange} />

      <div className='flex-1 p-4'>
        {editMode && (
          <div className='mb-4'>
            <Button variant='outline' size='sm' onClick={handleAddPanel}>
              <Plus className='mr-1 h-3.5 w-3.5' />
              Add Panel
            </Button>
          </div>
        )}

        {dashboardPanels.length === 0 ? (
          <div className='text-muted-foreground flex flex-col items-center justify-center py-16'>
            <p className='text-lg'>No panels yet</p>
            <p className='text-sm'>Switch to edit mode to add panels.</p>
          </div>
        ) : (
          <DashboardGrid panels={dashboardPanels} timeRange={timeRange} refreshInterval={refetchMs} editMode={editMode} onLayoutChange={handleLayoutChange} />
        )}
      </div>

      {editingPanel !== null && <PanelEditor panel={editingPanel} open onClose={handlePanelEditorClose} onSave={handlePanelSave} />}

      <DashboardSettings
        open={settingsOpen}
        onClose={handleSettingsClose}
        dashboardId={id}
        title={dashboard.title}
        description={dashboard.description}
        tags={dashboard.tags}
        onSave={handleSettingsSave}
        onRestore={handleRestore}
      />
    </div>
  );
};

export const Route = createFileRoute('/dashboards/$id/')({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(dashboardQueryOptions(params.id)),
  pendingComponent: DashboardViewSkeleton,
  component: DashboardViewPage,
});

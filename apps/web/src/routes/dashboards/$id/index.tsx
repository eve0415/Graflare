import type { DatasourceRow } from '../../datasources/-api';
import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { Variable } from '@graflare/shared/schemas/variable';

import { panelSchema } from '@graflare/shared/schemas/panel';
import { variableSchema } from '@graflare/shared/schemas/variable';
import { resolveTime } from '@graflare/shared/time/resolve';
import { Button } from '@graflare/ui/components/button';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { updateDashboard } from '../-api';
import { AnnotationsDialog } from '../-components/annotations-dialog';
import { DashboardGrid } from '../-components/dashboard-grid';
import { DashboardSettings } from '../-components/dashboard-settings';
import { DashboardToolbar } from '../-components/dashboard-toolbar';
import { DashboardViewSkeleton } from '../-components/dashboard-view-skeleton';
import { PanelEditor } from '../-components/panel-editor';
import { PanelActionsProvider } from '../-components/panels/panel-actions-context';
import { VariableBar } from '../-components/variable-bar';
import { buildEffectiveValues } from '../-components/variable-defaults';
import { annotationsQueryOptions, dashboardQueryOptions } from '../-queries';
import { datasourcesQueryOptions } from '../../datasources/-queries';

const MS_PER_SECOND = 1000;

// Stable empty fallback so the `annotations` prop keeps a constant identity while
// the query is still loading (a fresh `[]` each render would churn the grid).
const EMPTY_ANNOTATIONS: readonly Annotation[] = [];

// Stable empty fallback for the datasource list passed to the settings dialog, so the prop keeps
// a constant identity while the datasource query is still loading.
const EMPTY_DATASOURCES: readonly DatasourceRow[] = [];

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
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [variableValues, setVariableValues] = useState<Map<string, string>>(new Map());

  const dashboardPanels = useMemo(() => {
    if (dashboard === null) return [];
    // In edit mode the working copy is `panels` (even when emptied by deletes), so
    // a delete-all doesn't snap back to the saved set.
    if (editMode) return panels;
    return parsePanels(dashboard.panels);
  }, [dashboard, panels, editMode]);

  const dashboardVariables = useMemo(() => {
    if (dashboard === null) return [];
    return parseVariables(dashboard.variables);
  }, [dashboard]);

  // The datasource list (already prefetched by the loader) is needed to seed a `datasource`
  // variable's default; fetched here rather than read from the cache so a direct load resolves it.
  const { data: datasources } = useQuery(datasourcesQueryOptions());

  // Merge each variable's computed default under any user selection so panels interpolate against
  // a real value on first render — `variableValues` starts empty, and the grid reads this map
  // directly (it doesn't fall back to `current` the way the bar's display does).
  const effectiveValues = useMemo(
    () => buildEffectiveValues(dashboardVariables, variableValues, datasources ?? []),
    [dashboardVariables, variableValues, datasources],
  );

  // Resolve the visible window to epoch MS once per range change (not every render,
  // or `now` would drift the query key and refetch constantly). One fetch per
  // dashboard view, threaded to the chart panels like `variables`.
  const annotationWindow = useMemo(
    () => ({ from: resolveTime(timeRange.from) * MS_PER_SECOND, to: resolveTime(timeRange.to) * MS_PER_SECOND }),
    [timeRange.from, timeRange.to],
  );
  const { data: annotations } = useQuery(annotationsQueryOptions(id, annotationWindow.from, annotationWindow.to));
  const dashboardAnnotations = annotations ?? EMPTY_ANNOTATIONS;

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
      queries: [{ refId: 'A', expr: '', legendFormat: '', format: 'time_series' }],
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      thresholds: [],
      displayOptions: {},
      fieldConfig: { defaults: { unit: '', mappings: [] }, overrides: [] },
    };
    setPanels(prev => [...prev, newPanel]);
    setEditingPanel(newPanel);
  }, []);

  const handleEditPanel = useCallback(
    (panelId: string) => {
      const panel = dashboardPanels.find(p => p.id === panelId);
      if (panel !== undefined) setEditingPanel(panel);
    },
    [dashboardPanels],
  );

  const handleDeletePanel = useCallback((panelId: string) => {
    setPanels(prev => prev.filter(p => p.id !== panelId));
  }, []);

  const panelActions = useMemo(
    () => (editMode ? { onEdit: handleEditPanel, onDelete: handleDeletePanel } : null),
    [editMode, handleEditPanel, handleDeletePanel],
  );

  const handleSettingsOpen = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handleSettingsClose = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const handleAnnotationsOpen = useCallback(() => {
    setAnnotationsOpen(true);
  }, []);

  const handleAnnotationsClose = useCallback(() => {
    setAnnotationsOpen(false);
  }, []);

  const handleSettingsSave = useCallback(
    (data: { title: string; description: string; tags: string[]; variables: Variable[] }) => {
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
        onAddAnnotation={handleAnnotationsOpen}
        saving={saving}
      />

      <VariableBar variables={dashboardVariables} values={effectiveValues} onChange={handleVariableChange} />

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
          <PanelActionsProvider value={panelActions}>
            <DashboardGrid
              panels={dashboardPanels}
              timeRange={timeRange}
              refreshInterval={refetchMs}
              editMode={editMode}
              onLayoutChange={handleLayoutChange}
              variables={effectiveValues}
              annotations={dashboardAnnotations}
            />
          </PanelActionsProvider>
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
        variables={dashboardVariables}
        datasources={datasources ?? EMPTY_DATASOURCES}
        onSave={handleSettingsSave}
        onRestore={handleRestore}
      />

      <AnnotationsDialog open={annotationsOpen} onClose={handleAnnotationsClose} dashboardId={id} annotations={dashboardAnnotations} />
    </div>
  );
};

export const Route = createFileRoute('/dashboards/$id/')({
  // Prefetch both the dashboard and the datasource list so panels can resolve their
  // datasource on first paint instead of waiting for the client-side fetch.
  loader: ({ params, context }) =>
    Promise.all([context.queryClient.ensureQueryData(dashboardQueryOptions(params.id)), context.queryClient.ensureQueryData(datasourcesQueryOptions())]),
  pendingComponent: DashboardViewSkeleton,
  component: DashboardViewPage,
});

import type { DatasourceRow } from '../../datasources/-api';
import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { AdhocFilter, Variable } from '@graflare/shared/schemas/variable';
import type { RepeatedPanel } from '@graflare/shared/variables/repeat';

import { panelSchema } from '@graflare/shared/schemas/panel';
import { variableSchema } from '@graflare/shared/schemas/variable';
import { resolveRange } from '@graflare/shared/time/resolve';
import { expandRepeats } from '@graflare/shared/variables/repeat';
import { Button } from '@graflare/ui/components/button';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { updateDashboard } from '../-api';
import { AnnotationsDialog } from '../-components/annotations-dialog';
import { DashboardGrid } from '../-components/dashboard-grid';
import { DashboardSettings } from '../-components/dashboard-settings';
import { DashboardToolbar } from '../-components/dashboard-toolbar';
import { DashboardViewSkeleton } from '../-components/dashboard-view-skeleton';
import { initialRefresh, initialTimeRange, intervalToMs } from '../-components/dashboard-view-state';
import { PanelEditor } from '../-components/panel-editor';
import { PanelActionsProvider } from '../-components/panels/panel-actions-context';
import { VariableBar } from '../-components/variable-bar';
import { buildDisplayValues, buildEffectiveValues, resolveAdhocVariables } from '../-components/variable-defaults';
import { annotationsQueryOptions, dashboardQueryOptions } from '../-queries';
import { useRecentDashboards } from '../../-root/use-recent-dashboards';
import { datasourcesQueryOptions } from '../../datasources/-queries';

const MS_PER_SECOND = 1000;

// Stable empty fallback so the `annotations` prop keeps a constant identity while
// the query is still loading (a fresh `[]` each render would churn the grid).
const EMPTY_ANNOTATIONS: readonly Annotation[] = [];

// Stable empty fallback for the datasource list passed to the settings dialog, so the prop keeps
// a constant identity while the datasource query is still loading.
const EMPTY_DATASOURCES: readonly DatasourceRow[] = [];

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
  const { record: recordRecent } = useRecentDashboards();

  // Seed the view from the dashboard's SAVED time range / refresh (falling back to
  // now-1h / off when absent), so opening a dashboard restores the window it was saved
  // with instead of always snapping to the last hour. Lazy initializers: `dashboard` is
  // present here (useSuspenseQuery), and a later user change must not be reset on rerender.
  const [timeRange, setTimeRange] = useState(() => initialTimeRange(dashboard?.timeRange));
  const [refreshInterval, setRefreshInterval] = useState(() => initialRefresh(dashboard?.timeRange));
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [editingPanel, setEditingPanel] = useState<Panel | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  // The user's live selections, keyed by variable name. A multi-select holds an array; the All
  // choice is stored as the `$__all` sentinel (resolved by buildEffectiveValues before any query).
  const [variableValues, setVariableValues] = useState<Map<string, string | string[]>>(new Map());
  // Live adhoc-filter edits, keyed by variable name. Runtime-only: seeded from each adhoc
  // variable's saved `filters` (when absent here) and never written back through updateDashboard —
  // the bar owns the live filters; the editor only sets the variable's type + datasource.
  const [adhocFilterValues, setAdhocFilterValues] = useState<Map<string, AdhocFilter[]>>(new Map());

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
  // directly (it doesn't fall back to `current` the way the bar's display does). Two views of the
  // same merge: the bar shows the raw selection (`$__all` kept so All displays as selected), the
  // panels get the resolved one (All expanded to the options array / a custom allValue).
  const displayValues = useMemo(
    () => buildDisplayValues(dashboardVariables, variableValues, datasources ?? []),
    [dashboardVariables, variableValues, datasources],
  );
  const effectiveValues = useMemo(
    () => buildEffectiveValues(dashboardVariables, variableValues, datasources ?? []),
    [dashboardVariables, variableValues, datasources],
  );

  // Adhoc variables with their live filters folded in (saved filters under any bar edit). The grid
  // scopes these per-panel by datasource and injects them; the bar renders/edits them.
  const dashboardAdhocVariables = useMemo(() => resolveAdhocVariables(dashboardVariables, adhocFilterValues), [dashboardVariables, adhocFilterValues]);

  // The grid's render items. VIEW mode expands repeat panels into one instance per variable value
  // (runtime-only clones, each scoped to its value). EDIT mode renders the source panels only —
  // identity-mapped into the same item shape so the grid has ONE contract — because drag/resize/
  // save must operate on exactly what's persisted; the unscoped values give a repeat panel a
  // combined (regex-union) preview.
  const gridItems = useMemo((): RepeatedPanel[] => {
    if (editMode) {
      return dashboardPanels.map(panel => ({ panel, key: panel.id, values: effectiveValues, isRepeatClone: false, sourceId: panel.id }));
    }
    return expandRepeats(dashboardPanels, dashboardVariables, effectiveValues);
  }, [editMode, dashboardPanels, dashboardVariables, effectiveValues]);

  // Resolve the visible window to epoch MS once per range change (not every render,
  // or `now` would drift the query key and refetch constantly). One fetch per
  // dashboard view, threaded to the chart panels like `variables`.
  const annotationWindow = useMemo(() => {
    const { from, to } = resolveRange(timeRange.from, timeRange.to);
    return { from: from * MS_PER_SECOND, to: to * MS_PER_SECOND };
  }, [timeRange.from, timeRange.to]);
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
      transformations: [],
      repeatDirection: 'h',
      maxPerRow: 4,
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

  const handleVariableChange = useCallback((name: string, value: string | string[]) => {
    setVariableValues(prev => {
      const next = new Map(prev);
      next.set(name, value);
      return next;
    });
  }, []);

  const handleAdhocFiltersChange = useCallback((name: string, filters: AdhocFilter[]) => {
    setAdhocFilterValues(prev => {
      const next = new Map(prev);
      next.set(name, filters);
      return next;
    });
  }, []);

  // Record this dashboard as recently-viewed once it (and its title) have loaded. Writing
  // through the external recents store — not React state — so this is a side effect, not a
  // set-state-in-effect. `dashboard` keeps a stable react-query identity until a refetch, so
  // this fires once per loaded id rather than every render.
  useEffect(() => {
    if (dashboard === null) return;
    recordRecent({ id, title: dashboard.title });
  }, [id, dashboard, recordRecent]);

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

      <VariableBar
        variables={dashboardVariables}
        values={displayValues}
        onChange={handleVariableChange}
        adhocVariables={dashboardAdhocVariables}
        onAdhocFiltersChange={handleAdhocFiltersChange}
      />

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
              items={gridItems}
              timeRange={timeRange}
              refreshInterval={refetchMs}
              editMode={editMode}
              onLayoutChange={editMode ? handleLayoutChange : undefined}
              adhocVariables={dashboardAdhocVariables}
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

import type { QueryEditorMode } from '../../-root/query-editor-shell';
import type { MergeInput, MergeSeries, MergedChartData } from './explore-series-merge';
import type { QueryHistoryEntry } from './query-history-store';
import type { DatasourceDialect } from '@graflare/shared/schemas/datasource';
import type { PrometheusData } from '@graflare/shared/schemas/prometheus';
import type { SqlResponse } from '@graflare/shared/schemas/sql';
import type { Options as UPlotOptions } from 'uplot';

import { sqlRowsToSeries } from '@graflare/shared/sql/adapters';
import { computeStep, resolveRange } from '@graflare/shared/time/resolve';
import { Button } from '@graflare/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { BarChart3, History, Play, Plus, Table2 } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { useContainerWidth } from 'react-grid-layout';

import { chartThemeColors, themedAxis } from '../../-root/chart-theme';
import { databaseSchemaQueryOptions } from '../../-root/introspection-queries';
import { QueryResultTable, formatPrometheusToTable } from '../../-root/query-result-table';
import { useTheme } from '../../-root/theme-provider';
import { UPlotChart } from '../../-root/uplot-chart';
import { proxyQuery } from '../../../lib/proxy';
import { sqlQuery } from '../../../lib/sql-proxy';
import { datasourcesQueryOptions } from '../../datasources/-queries';

import { ExploreQueryRow } from './explore-query-row';
import { mergeSeries } from './explore-series-merge';
import { QueryHistoryDrawer } from './query-history-drawer';
import { useQueryHistory } from './use-query-history';

interface TimeRange {
  from: string;
  to: string;
}

type SqlFormat = 'time_series' | 'table';

const SQL_FORMAT_OPTIONS = [
  { value: 'time_series', label: 'Time series' },
  { value: 'table', label: 'Table' },
] as const;

interface ExplorePaneProps {
  timeRange: TimeRange;
  label: string;
}

type ResultView = 'graph' | 'table';

const VALID_DIALECTS = new Set<string>(['postgres', 'sqlite']);

const isValidDialect = (value: string | null | undefined): value is DatasourceDialect => typeof value === 'string' && VALID_DIALECTS.has(value);

interface QueryRowEntry {
  /** Stable identity, also the React key + the row's `onChange` id. */
  id: string;
  /** The latest effective query reported up by this row. */
  query: string;
  /** Seed consumed once on (re)mount; a history re-run mints a new id with a seed. */
  seedDraft?: string;
  seedMode?: QueryEditorMode;
}

/** One row's run outcome, discriminated so the post-run partition narrows without casts. */
type RunOutcome =
  | { kind: 'series'; refId: string; series: MergeSeries[] }
  | { kind: 'table'; refId: string; result: SqlResponse }
  | { kind: 'error'; refId: string; error: string };

/** A successful SQL `table`-format result tagged with its row's ref id (stacked when >1). */
interface TableResult {
  refId: string;
  result: SqlResponse;
}

/** Positional label for a row: A, B, C, … by index. */
const refIdFor = (index: number): string => String.fromCodePoint(65 + index);

/** Chart canvas height in px (fixed; only width is responsive). */
const CHART_HEIGHT = 300;
/** Floor for the measured chart width so the canvas never collapses to nothing mid-resize. */
const MIN_CHART_WIDTH = 100;

/**
 * uPlot needs a real pixel width — a CSS `w-full` alone won't size its canvas, which is why a
 * fixed width used to be baked in and overflowed narrow viewports. Derive the canvas width from
 * the measured container instead, mirroring the dashboard panels' measure-then-size path so the
 * chart tracks the real column width at every resolution. Exported for a focused unit test.
 */
export const explorePaneChartWidth = (measuredWidth: number): number => Math.max(MIN_CHART_WIDTH, Math.floor(measuredWidth));

const newRow = (seed?: { draft: string; mode: QueryEditorMode }): QueryRowEntry =>
  seed === undefined ? { id: crypto.randomUUID(), query: '' } : { id: crypto.randomUUID(), query: seed.draft, seedDraft: seed.draft, seedMode: seed.mode };

/**
 * One SQL `table`-format result rendered as a table, optionally headed by its ref-id label
 * (shown only when more than one query ran). A leaf so the table-data object is built here from
 * the `result` prop rather than created inline in the parent's render map (react-perf).
 */
const StackedSqlTable = ({ refId, result, showLabel }: { refId: string; result: SqlResponse; showLabel: boolean }) => {
  const data = useMemo(
    () => ({
      columns: result.columns.map(c => c.name),
      rows: result.rows.map(row => row.map(v => (v === null ? '' : String(v)))),
    }),
    [result],
  );
  return (
    <div className='space-y-1'>
      {showLabel && <span className='text-muted-foreground text-xs font-medium'>Query {refId}</span>}
      <QueryResultTable data={data} scrollRegionLabel={`Query ${refId} results`} />
    </div>
  );
};

/** Pull the typed metric+sample series out of a Prometheus query-range/SQL-adapted response. */
const parsePrometheusSeries = (data: PrometheusData | undefined): MergeSeries[] => {
  if (data === undefined || !('resultType' in data) || !Array.isArray(data.result)) return [];
  const parsed: MergeSeries[] = [];
  for (const item of data.result) {
    // `result` may be a bare scalar sample tuple ([number, string]); skip those — only metric
    // series have a `metric`. matrix items carry `values`; vector items carry `value`.
    if (typeof item !== 'object' || !('metric' in item)) continue;
    if ('values' in item) {
      parsed.push({ metric: item.metric, values: item.values });
    } else {
      parsed.push({ metric: item.metric, value: item.value });
    }
  }
  return parsed;
};

export const ExplorePane = ({ timeRange, label }: ExplorePaneProps) => {
  const { data: datasources } = useSuspenseQuery(datasourcesQueryOptions());
  const { resolved } = useTheme();
  const dsItems = useMemo(() => datasources.map(ds => ({ value: ds.id, label: ds.name })), [datasources]);

  // The fork's WidthProvider replacement: a ResizeObserver yielding the live width of the chart
  // container. `mounted` gates the chart on a real measurement so the (large) initialWidth fallback
  // is never painted at a narrow viewport — the exact horizontal-overflow bug being fixed here.
  const { width: chartContainerWidth, containerRef: chartContainerRef, mounted: chartMeasured } = useContainerWidth();

  const [datasourceId, setDatasourceId] = useState<string>(datasources[0]?.id ?? '');
  const [rows, setRows] = useState<QueryRowEntry[]>(() => [newRow()]);

  const [resultView, setResultView] = useState<ResultView>('graph');
  const [sqlFormat, setSqlFormat] = useState<SqlFormat>('time_series');
  // Successful series grouped by ref id, one entry per run row (graph + the prometheus-style table
  // both derive from this). Stored already-grouped so neither path re-groups — `mergeSeries` takes
  // `MergeInput[]` directly, and the table reads each group's ref id.
  const [seriesResult, setSeriesResult] = useState<MergeInput[] | null>(null);
  // SQL `table`-format results, one per run row (stacked in the table view).
  const [tableResults, setTableResults] = useState<TableResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Reference clock for the drawer's relative timestamps, re-seeded when the drawer opens (in the
  // open handler — an event, so no render-phase clock read or setState-in-effect).
  const [historyNow, setHistoryNow] = useState(() => Date.now());

  const { entries: historyEntries, record, toggleStar, setComment, remove } = useQueryHistory();

  const selectedDs = datasources.find(d => d.id === datasourceId);
  const isSql = selectedDs?.type === 'sql';

  const dbSchemaQuery = useQuery(databaseSchemaQueryOptions(isSql ? datasourceId : ''));
  const codeEditorSchema = useMemo(() => {
    if (!isSql || dbSchemaQuery.data === undefined) return;
    return dbSchemaQuery.data.tables;
  }, [isSql, dbSchemaQuery.data]);

  const selectedDialect = useMemo((): DatasourceDialect | undefined => {
    const d = selectedDs?.dialect;
    return isValidDialect(d) ? d : undefined;
  }, [selectedDs?.dialect]);

  // A row reports its effective query here; we store it on the matching row by id. Functional
  // update keeps this callback dependency-free so it never churns (react-perf) and one shared
  // instance is passed to every row (no per-row closures in the render map).
  const handleRowChange = useCallback((id: string, query: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, query } : r)));
  }, []);

  const handleRemoveRow = useCallback((id: string) => {
    // Min one row; the remove affordance is hidden on the last row, but guard anyway.
    setRows(prev => (prev.length <= 1 ? prev : prev.filter(r => r.id !== id)));
  }, []);

  const handleAddRow = useCallback(() => {
    setRows(prev => [...prev, newRow()]);
  }, []);

  /** Run one row's query, returning a tagged outcome (never throws; errors are tagged). */
  const runOne = useCallback(
    async (refId: string, dsId: string, query: string, runIsSql: boolean, runSqlFormat: SqlFormat): Promise<RunOutcome> => {
      // from snaps to the start of its unit, to to the end — so a `now/d` range spans the day.
      const { from, to } = resolveRange(timeRange.from, timeRange.to);
      try {
        if (runIsSql) {
          const result = await sqlQuery({
            data: {
              datasourceId: dsId,
              rawSql: query,
              format: runSqlFormat,
              timeRange: { from: String(from), to: String(to) },
            },
          });
          if (result.error !== undefined) return { kind: 'error', refId, error: result.error };
          if (runSqlFormat === 'table') return { kind: 'table', refId, result };

          const adapted = sqlRowsToSeries(result);
          if (adapted.status === 'error') return { kind: 'error', refId, error: adapted.error ?? 'Failed to convert to series' };
          return { kind: 'series', refId, series: parsePrometheusSeries(adapted.data) };
        }

        const step = computeStep(timeRange.from, timeRange.to);
        const result = await proxyQuery({
          data: {
            datasourceId: dsId,
            endpoint: '/api/v1/query_range',
            params: { query, start: String(from), end: String(to), step },
          },
        });
        if (result.status === 'error') return { kind: 'error', refId, error: result.error ?? 'Query failed' };
        return { kind: 'series', refId, series: parsePrometheusSeries(result.data) };
      } catch (error) {
        return { kind: 'error', refId, error: error instanceof Error ? error.message : 'Query failed' };
      }
    },
    [timeRange],
  );

  // The single run path for both the Run button and a history re-run, so the two can never
  // drift. Queries are run CONCURRENTLY; each is tagged with its ref id. After all settle we do
  // ONE commit: merged successes + a combined error listing any failed ref ids, so a partial
  // failure still shows the rows that succeeded. History is recorded per successful query.
  const runQueries = useCallback(
    (args: { datasourceId: string; isSql: boolean; sqlFormat: SqlFormat; queries: { refId: string; query: string }[] }) => {
      const { datasourceId: dsId, isSql: runIsSql, sqlFormat: runSqlFormat, queries } = args;
      const runnable = queries.filter(q => q.query.trim() !== '');
      if (dsId === '' || runnable.length === 0) return;

      const run = async () => {
        setLoading(true);
        setQueryError(null);
        setSeriesResult(null);
        setTableResults(null);

        try {
          const outcomes = await Promise.all(runnable.map(q => runOne(q.refId, dsId, q.query, runIsSql, runSqlFormat)));

          const combinedSeries: MergeInput[] = [];
          const tables: TableResult[] = [];
          const failures: { refId: string; error: string }[] = [];
          let successCount = 0;

          for (const outcome of outcomes) {
            switch (outcome.kind) {
              case 'series':
                // Keep the row's series grouped under its ref id — the merge groups/labels per
                // query and the table reads the ref id directly (no reserved metric key needed).
                combinedSeries.push({ refId: outcome.refId, series: outcome.series });
                successCount++;
                break;
              case 'table':
                tables.push({ refId: outcome.refId, result: outcome.result });
                successCount++;
                break;
              case 'error':
                failures.push({ refId: outcome.refId, error: outcome.error });
                break;
            }
          }

          // Record each non-empty query that ran without erroring (table or series both count).
          const failedSet = new Set(failures.map(f => f.refId));
          for (const q of runnable) {
            if (!failedSet.has(q.refId)) {
              record({ datasourceId: dsId, datasourceType: runIsSql ? 'sql' : 'prometheus', query: q.query });
            }
          }

          // Only render the result chrome when something succeeded, so an all-failed run shows the
          // error alone (not an empty "0 series" header). Successes + a combined error coexist.
          if (successCount > 0) {
            if (runIsSql && runSqlFormat === 'table') {
              setTableResults(tables);
            } else {
              setSeriesResult(combinedSeries);
            }
          }
          if (failures.length > 0) {
            // Keep each failure's real message (parse errors etc.) and prefix it with its ref id.
            const sorted = [...failures].sort((a, b) => a.refId.localeCompare(b.refId));
            setQueryError(sorted.map(f => `${f.refId}: ${f.error}`).join('; '));
          }
        } catch (error) {
          setQueryError(error instanceof Error ? error.message : 'Query failed');
        } finally {
          setLoading(false);
        }
      };
      void run();
    },
    [runOne, record],
  );

  const handleRun = useCallback(() => {
    runQueries({
      datasourceId,
      isSql,
      sqlFormat,
      queries: rows.map((r, i) => ({ refId: refIdFor(i), query: r.query })),
    });
  }, [runQueries, datasourceId, isSql, sqlFormat, rows]);

  const handleHistoryRun = useCallback(
    (entry: QueryHistoryEntry) => {
      const entryIsSql = entry.datasourceType === 'sql';
      // Restore the editor UI for display only; the run uses the entry's own values directly.
      // A history re-run collapses to a single row remounted (fresh id) with the entry seeded
      // into code mode — the simplest correct behavior (it replaces, rather than appends to, the
      // current rows). The run uses the entry's datasource/type explicitly to avoid reading the
      // datasource state we just set (setState is async).
      if (datasources.some(d => d.id === entry.datasourceId)) {
        setDatasourceId(entry.datasourceId);
      }
      setRows([newRow({ draft: entry.query, mode: 'code' })]);
      setHistoryOpen(false);
      runQueries({ datasourceId: entry.datasourceId, isSql: entryIsSql, sqlFormat, queries: [{ refId: refIdFor(0), query: entry.query }] });
    },
    [runQueries, datasources, sqlFormat],
  );

  const openHistory = useCallback(() => {
    setHistoryNow(Date.now());
    setHistoryOpen(true);
  }, []);

  const handleDatasourceChange = useCallback((id: string | null) => {
    if (id === null) return;
    setDatasourceId(id);
    // New data source means a new query language; reset to a single fresh row.
    setRows([newRow()]);
  }, []);

  const handleSqlFormatChange = useCallback((v: string | null) => {
    if (v === 'time_series' || v === 'table') {
      setSqlFormat(v);
    }
  }, []);

  const toggleView = useCallback(() => {
    setResultView(v => (v === 'graph' ? 'table' : 'graph'));
  }, []);

  // Graph data + labels come from ONE merge pass so the stroke-series count can't drift from the
  // value-array count. `seriesResult` is already grouped by ref id, so it feeds the merge directly.
  // SQL-table results never reach here (they render as stacked tables).
  const merged = useMemo(() => mergeSeries(seriesResult ?? []), [seriesResult]);

  // A plain field read off the already-memoized `merged` — stable without its own memo (and a
  // member access, so react-perf's no-new-array-as-prop rule doesn't fire at the chart call site).
  const chartData: MergedChartData = merged.data;

  const chartFallback = useMemo(() => <Skeleton className='h-72 w-full' />, []);

  const chartOptions = useMemo((): UPlotOptions => {
    const colors = chartThemeColors(resolved);
    // Pin the x domain to the selected query window so the axis tracks the chosen range
    // rather than uPlot's data-driven auto-range (which balloons on a stray out-of-window
    // sample). `from`/`to` already snap with Grafana's start/end rounding convention.
    const { from: fromSec, to: toSec } = resolveRange(timeRange.from, timeRange.to);
    const xRange = (): [number, number] => [fromSec, toSec];
    return {
      width: explorePaneChartWidth(chartContainerWidth),
      height: CHART_HEIGHT,
      scales: { x: { time: true, range: xRange } },
      axes: [{ ...themedAxis(colors) }, { ...themedAxis(colors) }],
      series: [{}, ...merged.labels.map((labelText, i) => ({ label: labelText, stroke: `hsl(${String(i * 60)}, 70%, 50%)` }))],
    };
  }, [merged, resolved, timeRange.from, timeRange.to, chartContainerWidth]);

  // The table view. SQL-table results stack one table per ref id; otherwise the combined series
  // feed the existing prometheus formatter. The ref-id `Query` column appears only when more than
  // one query contributed, so a single query's table is byte-identical to the old behavior.
  const seriesTableData = useMemo(() => {
    if (seriesResult === null) return { columns: [], rows: [] };
    // Only count groups that actually produced series, so a `Query` column appears exactly when
    // more than one query contributed rows — a single contributing query's table is unchanged.
    const multi = seriesResult.filter(g => g.series.length > 0).length > 1;
    const forTable: MergeSeries[] = [];
    for (const group of seriesResult) {
      for (const s of group.series) {
        // A real metric label would win the (practically impossible) clash with the `Query` column.
        const metric: Record<string, string> = multi ? { Query: group.refId, ...s.metric } : { ...s.metric };
        const out: MergeSeries = { metric };
        if (s.values !== undefined) out.values = s.values;
        if (s.value !== undefined) out.value = s.value;
        forTable.push(out);
      }
    }
    return formatPrometheusToTable(forTable);
  }, [seriesResult]);

  const hasResults = seriesResult !== null || tableResults !== null;
  const resultCount = useMemo(() => {
    if (tableResults !== null) {
      let total = 0;
      for (const t of tableResults) total += t.result.rows.length;
      return total;
    }
    if (seriesResult === null) return 0;
    let total = 0;
    for (const g of seriesResult) total += g.series.length;
    return total;
  }, [seriesResult, tableResults]);

  const canRemove = rows.length > 1;

  return (
    // `containerRef` lives on this ALWAYS-mounted pane root (not the chart wrapper, which only
    // mounts once results exist) so the ResizeObserver attaches at mount and keeps reporting the
    // live pane width — the chart canvas is then sized from it. Every block descendant down to the
    // chart is this same content width, so measuring here gives the chart its exact width.
    <div ref={chartContainerRef} className='space-y-3' aria-label={label}>
      <div className='flex items-center gap-2'>
        <Select value={datasourceId} onValueChange={handleDatasourceChange} items={dsItems}>
          <SelectTrigger className='w-48' aria-label='Select data source'>
            <SelectValue placeholder='Data source' />
          </SelectTrigger>
          <SelectContent>
            {dsItems.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isSql && (
          <Select value={sqlFormat} onValueChange={handleSqlFormatChange} items={SQL_FORMAT_OPTIONS}>
            <SelectTrigger className='w-32' aria-label='SQL format mode'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SQL_FORMAT_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button onClick={handleRun} disabled={loading || datasourceId === ''} size='sm'>
          <Play className='mr-1 h-3.5 w-3.5' />
          Run
        </Button>

        <Button variant='ghost' size='icon-sm' onClick={openHistory} aria-label='Query history'>
          <History className='h-4 w-4' />
        </Button>
      </div>

      <div className='space-y-2'>
        {rows.map((row, i) => (
          <ExploreQueryRow
            key={row.id}
            id={row.id}
            refId={refIdFor(i)}
            datasourceId={datasourceId}
            isSql={isSql}
            dialect={selectedDialect}
            schema={codeEditorSchema}
            initialDraft={row.seedDraft}
            initialMode={row.seedMode}
            onChange={handleRowChange}
            onRun={handleRun}
            onRemove={canRemove ? handleRemoveRow : undefined}
          />
        ))}

        <Button
          variant='ghost'
          size='sm'
          className='border-border/60 text-muted-foreground hover:text-foreground w-full justify-center border border-dashed'
          onClick={handleAddRow}
          disabled={datasourceId === ''}
          aria-label='Add query'
        >
          <Plus data-icon='inline-start' />
          Add query
        </Button>
      </div>

      <QueryHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        entries={historyEntries}
        datasources={datasources}
        now={historyNow}
        onRun={handleHistoryRun}
        onToggleStar={toggleStar}
        onSetComment={setComment}
        onRemove={remove}
      />

      {queryError !== null && (
        <div className='bg-destructive/10 text-destructive rounded-md p-3 text-sm' role='alert'>
          {queryError}
        </div>
      )}

      {loading && <Skeleton className='h-64 w-full' />}

      {hasResults && !loading && (
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Button variant='ghost' size='xs' onClick={toggleView} aria-label={`Switch to ${resultView === 'graph' ? 'table' : 'graph'} view`}>
              {resultView === 'graph' ? <Table2 className='h-4 w-4' /> : <BarChart3 className='h-4 w-4' />}
            </Button>
            <span className='text-muted-foreground text-xs'>
              {tableResults === null ? `${String(resultCount)} series` : `${String(resultCount)} rows`}, {resultView} view
            </span>
          </div>

          {resultView === 'graph' &&
            tableResults === null &&
            chartData[0] !== undefined &&
            chartData[0].length > 0 && (
              // `overflow-hidden` + `min-w-0` keep the fixed-pixel uPlot canvas from forcing the page
              // wider than the viewport during the brief construct window before a resize settles.
              // Render the chart only after the first measurement (`chartMeasured`) so the initialWidth
              // fallback — far wider than a phone — is never painted.
              <div className='min-w-0 overflow-hidden'>
                {chartMeasured ? (
                  <Suspense fallback={chartFallback}>
                    <UPlotChart options={chartOptions} data={chartData} className='w-full' />
                  </Suspense>
                ) : (
                  chartFallback
                )}
              </div>
            )}

          {resultView === 'graph' && tableResults !== null && (
            <p className='text-muted-foreground text-sm'>Table format has no graph view. Switch the result view to see the rows.</p>
          )}

          {resultView === 'table' && tableResults === null && <QueryResultTable data={seriesTableData} scrollRegionLabel='Query results' />}

          {resultView === 'table' &&
            tableResults !== null &&
            tableResults.map(t => <StackedSqlTable key={t.refId} refId={t.refId} result={t.result} showLabel={tableResults.length > 1} />)}
        </div>
      )}
    </div>
  );
};

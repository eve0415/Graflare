import type { SqlResponse } from '@graflare/shared/schemas/sql';
import type { Options as UPlotOptions } from 'uplot';

import type { DatasourceDialect } from '@graflare/shared/schemas/datasource';
import { generatePromQL } from '@graflare/shared/promql/generate';
import { buildSql } from '@graflare/shared/sql/builder';
import type { SqlBuilderState } from '@graflare/shared/sql/builder';
import { sqlRowsToSeries } from '@graflare/shared/sql/adapters';
import { computeStep, resolveTime } from '@graflare/shared/time/resolve';
import { Button } from '@graflare/ui/components/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@graflare/ui/components/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { BarChart3, Play, Table2 } from 'lucide-react';
import { Suspense, useCallback, useMemo, useReducer, useState } from 'react';

import { QueryResultTable, formatPrometheusToTable } from '../../-root/query-result-table';
import type { QueryEditorMode } from '../../-root/query-editor-shell';
import { QueryEditorShell } from '../../-root/query-editor-shell';
import { UPlotChart } from '../../-root/uplot-chart';
import { databaseSchemaQueryOptions } from '../../-root/introspection-queries';
import { proxyQuery } from '../../../lib/proxy';
import { sqlQuery } from '../../../lib/sql-proxy';
import { datasourcesQueryOptions } from '../../datasources/-queries';

import { PromqlBuilder, initialPromqlBuilderState, promqlBuilderReducer } from './promql-builder';
import { QueryCodeEditor } from './query-code-editor';
import { SqlBuilder } from './sql-builder';

interface TimeRange {
	from: string;
	to: string;
}

const SQL_FORMAT_OPTIONS = [
	{ value: 'time_series', label: 'Time series' },
	{ value: 'table', label: 'Table' },
] as const;

const EMPTY_SQL_STATE: SqlBuilderState = {
	table: '',
	columns: [],
	where: [],
	groupBy: [],
	orderBy: [],
	limit: undefined,
	timeColumn: '',
	timeGroupInterval: '',
};

interface ExplorePaneProps {
	timeRange: TimeRange;
	label: string;
}

type ResultView = 'graph' | 'table';

const VALID_DIALECTS = new Set<string>(['postgres', 'sqlite']);

const isValidDialect = (value: string | null | undefined): value is DatasourceDialect =>
	typeof value === 'string' && VALID_DIALECTS.has(value);


export const ExplorePane = ({ timeRange, label }: ExplorePaneProps) => {
	const { data: datasources } = useSuspenseQuery(datasourcesQueryOptions());
	const dsItems = useMemo(() => datasources.map((ds) => ({ value: ds.id, label: ds.name })), [datasources]);

	const [datasourceId, setDatasourceId] = useState<string>(datasources[0]?.id ?? '');
	const [mode, setMode] = useState<QueryEditorMode>('builder');
	const [codeDraft, setCodeDraft] = useState('');
	const [sqlBuilderState, setSqlBuilderState] = useState<SqlBuilderState>(EMPTY_SQL_STATE);
	const [promqlBuilderState, promqlDispatch] = useReducer(promqlBuilderReducer, initialPromqlBuilderState);
	const [confirmReset, setConfirmReset] = useState(false);

	const [resultView, setResultView] = useState<ResultView>('graph');
	const [sqlFormat, setSqlFormat] = useState<'time_series' | 'table'>('time_series');
	const [queryResult, setQueryResult] = useState<{
		resultType: string;
		result: { metric: Record<string, string>; values?: [number, string][]; value?: [number, string] }[];
	} | null>(null);
	const [sqlTableResult, setSqlTableResult] = useState<SqlResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [queryError, setQueryError] = useState<string | null>(null);

	const selectedDs = datasources.find((d) => d.id === datasourceId);
	const isSql = selectedDs?.type === 'sql';

	const generatedQuery = useMemo(
		() => (isSql ? buildSql(sqlBuilderState) : generatePromQL(promqlBuilderState)),
		[isSql, sqlBuilderState, promqlBuilderState],
	);

	const effectiveQuery = mode === 'builder' ? generatedQuery : codeDraft;

	const dbSchemaQuery = useQuery(databaseSchemaQueryOptions(isSql ? datasourceId : ''));
	const codeEditorSchema = useMemo(() => {
		if (!isSql || dbSchemaQuery.data === undefined) return;
		return dbSchemaQuery.data.tables;
	}, [isSql, dbSchemaQuery.data]);

	const selectedDialect = useMemo(
		(): DatasourceDialect | undefined => {
			const d = selectedDs?.dialect;
			return isValidDialect(d) ? d : undefined;
		},
		[selectedDs?.dialect],
	);

	const handleModeChange = useCallback(
		(newMode: QueryEditorMode) => {
			if (newMode === 'code' && mode === 'builder') {
				setCodeDraft(generatedQuery);
				setMode('code');
			} else if (newMode === 'builder' && mode === 'code') {
				if (codeDraft !== generatedQuery && codeDraft !== '') {
					setConfirmReset(true);
				} else {
					setMode('builder');
				}
			}
		},
		[mode, codeDraft, generatedQuery],
	);

	const confirmModeReset = useCallback(() => {
		setConfirmReset(false);
		setMode('builder');
	}, []);

	const handleRun = useCallback(() => {
		if (datasourceId === '' || effectiveQuery.trim() === '') return;

		const run = async () => {
			setLoading(true);
			setQueryError(null);
			setQueryResult(null);
			setSqlTableResult(null);

			try {
				if (isSql) {
					const result = await sqlQuery({
						data: {
							datasourceId,
							rawSql: effectiveQuery,
							format: sqlFormat,
							timeRange: {
								from: String(resolveTime(timeRange.from)),
								to: String(resolveTime(timeRange.to)),
							},
						},
					});

					if (result.error !== undefined) {
						setQueryError(result.error);
					} else if (sqlFormat === 'table') {
						setSqlTableResult(result);
					} else {
						const adapted = sqlRowsToSeries(result);
						if (adapted.status === 'error') {
							setQueryError(adapted.error ?? 'Failed to convert to series');
						} else if (adapted.data !== undefined && 'result' in adapted.data && Array.isArray(adapted.data.result)) {
							const parsed: { metric: Record<string, string>; values?: [number, string][]; value?: [number, string] }[] = [];
							for (const item of adapted.data.result) {
								if (typeof item === 'object' && item !== null && 'metric' in item) {
									parsed.push(item);
								}
							}
							setQueryResult({ resultType: adapted.data.resultType, result: parsed });
						}
					}
				} else {
					const step = computeStep(timeRange.from, timeRange.to);
					const result = await proxyQuery({
						data: {
							datasourceId,
							endpoint: '/api/v1/query_range',
							params: {
								query: effectiveQuery,
								start: String(resolveTime(timeRange.from)),
								end: String(resolveTime(timeRange.to)),
								step,
							},
						},
					});

					if (result.status === 'error') {
						setQueryError(result.error ?? 'Query failed');
					} else if (result.data !== undefined && 'resultType' in result.data && Array.isArray(result.data.result)) {
						const parsed: { metric: Record<string, string>; values?: [number, string][]; value?: [number, string] }[] = [];
						for (const item of result.data.result) {
							if (typeof item === 'object' && item !== null && 'metric' in item) {
								parsed.push(item);
							}
						}
						setQueryResult({ resultType: result.data.resultType, result: parsed });
					}
				}
			} catch (error) {
				setQueryError(error instanceof Error ? error.message : 'Query failed');
			} finally {
				setLoading(false);
			}
		};
		void run();
	}, [datasourceId, effectiveQuery, timeRange, isSql, sqlFormat]);

	const handleDatasourceChange = useCallback(
		(id: string | null) => {
			if (id === null) return;
			setDatasourceId(id);
			setSqlBuilderState(EMPTY_SQL_STATE);
			promqlDispatch({ type: 'RESET' });
			setCodeDraft('');
		},
		[],
	);

	const handleSqlFormatChange = useCallback(
		(v: string | null) => {
			if (v === 'time_series' || v === 'table') {
				setSqlFormat(v);
			}
		},
		[],
	);

	const toggleView = useCallback(() => {
		setResultView((v) => (v === 'graph' ? 'table' : 'graph'));
	}, []);

	const tableData = useMemo(() => {
		if (sqlTableResult !== null) {
			return {
				columns: sqlTableResult.columns.map((c) => c.name),
				rows: sqlTableResult.rows.map((row) => row.map((v) => (v === null ? '' : String(v)))),
			};
		}
		if (queryResult === null) return { columns: [], rows: [] };
		return formatPrometheusToTable(queryResult.result);
	}, [queryResult, sqlTableResult]);

	const chartData = useMemo((): [number[], ...number[][]] => {
		if (queryResult === null || queryResult.result.length === 0) return [[]];

		const [firstSeries] = queryResult.result;
		if (firstSeries?.values === undefined) return [[]];

		const timestamps = firstSeries.values.map((v) => v[0]);
		const series = queryResult.result.map((r) => (r.values ?? []).map((v) => Number(v[1])));

		return [timestamps, ...series];
	}, [queryResult]);

	const chartFallback = useMemo(() => <Skeleton className='h-72 w-full' />, []);

	const chartOptions = useMemo(
		(): UPlotOptions => ({
			width: 800,
			height: 300,
			series: [
				{},
				...(queryResult?.result ?? []).map((r, i) => ({
					label: r.metric.__name__ ?? `Series ${String(i + 1)}`,
					stroke: `hsl(${String(i * 60)}, 70%, 50%)`,
				})),
			],
		}),
		[queryResult],
	);

	const builderPreview = mode === 'builder' ? generatedQuery : '';

	return (
		<div className='space-y-3' aria-label={label}>
			<div className='flex items-center gap-2'>
				<Select value={datasourceId} onValueChange={handleDatasourceChange} items={dsItems}>
					<SelectTrigger className='w-48' aria-label='Select data source'>
						<SelectValue placeholder='Data source' />
					</SelectTrigger>
					<SelectContent>
						{dsItems.map((o) => (
							<SelectItem key={o.value} value={o.value}>
								{o.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{isSql && (
					<Select
						value={sqlFormat}
						onValueChange={handleSqlFormatChange}
						items={SQL_FORMAT_OPTIONS}
					>
						<SelectTrigger className='w-32' aria-label='SQL format mode'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{SQL_FORMAT_OPTIONS.map((o) => (
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
			</div>

			<QueryEditorShell mode={mode} onModeChange={handleModeChange} preview={builderPreview === '' ? undefined : builderPreview}>
				{mode === 'builder' ? (
					isSql ? (
						<SqlBuilder datasourceId={datasourceId} state={sqlBuilderState} onStateChange={setSqlBuilderState} />
					) : (
						<PromqlBuilder datasourceId={datasourceId} state={promqlBuilderState} dispatch={promqlDispatch} />
					)
				) : (
					<QueryCodeEditor
						datasourceType={isSql ? 'sql' : 'prometheus'}
						{...(selectedDialect === undefined ? {} : { dialect: selectedDialect })}
						{...(codeEditorSchema === undefined ? {} : { schema: codeEditorSchema })}
						value={codeDraft}
						onChange={setCodeDraft}
						onRun={handleRun}
						placeholder={isSql ? 'Enter a SQL query...' : 'Enter a PromQL query...'}
					/>
				)}
			</QueryEditorShell>

			<Dialog open={confirmReset} onOpenChange={setConfirmReset}>
				<DialogContent>
					<DialogTitle>Switch to Builder?</DialogTitle>
					<DialogDescription>
						Your Code mode edits will be lost. The builder will reset to its current state.
					</DialogDescription>
					<DialogFooter>
						<DialogClose>Cancel</DialogClose>
						<Button onClick={confirmModeReset}>Switch to Builder</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{queryError !== null && (
				<div className='bg-destructive/10 text-destructive rounded-md p-3 text-sm' role='alert'>
					{queryError}
				</div>
			)}

			{loading && <Skeleton className='h-64 w-full' />}

			{(queryResult !== null || sqlTableResult !== null) && !loading && (
				<div className='space-y-2'>
					<div className='flex items-center gap-2'>
						<Button
							variant='ghost'
							size='xs'
							onClick={toggleView}
							aria-label={`Switch to ${resultView === 'graph' ? 'table' : 'graph'} view`}
						>
							{resultView === 'graph' ? <Table2 className='h-4 w-4' /> : <BarChart3 className='h-4 w-4' />}
						</Button>
						<span className='text-muted-foreground text-xs'>
							{sqlTableResult === null
								? `${String(queryResult?.result.length ?? 0)} series`
								: `${String(sqlTableResult.rows.length)} rows`}
							, {resultView} view
						</span>
					</div>

					{resultView === 'graph' && chartData[0] !== undefined && chartData[0].length > 0 && (
						<Suspense fallback={chartFallback}>
							<UPlotChart options={chartOptions} data={chartData} className='w-full' />
						</Suspense>
					)}

					{resultView === 'table' && <QueryResultTable data={tableData} />}
				</div>
			)}
		</div>
	);
};

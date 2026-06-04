import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangleIcon, PlusIcon, XIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import type { OrderByClause, OrderDirection, SqlBuilderState, WhereClause } from '@graflare/shared/sql/builder';

import { columnsQueryOptions, tablesQueryOptions } from '../../-root/introspection-queries';

import { SqlBuilderWhereRow } from './sql-builder-where-row';

const ORDER_DIRECTIONS = new Set<string>(['ASC', 'DESC']);

const isOrderDirection = (value: string): value is OrderDirection => ORDER_DIRECTIONS.has(value);

interface SqlBuilderProps {
	datasourceId: string;
	state: SqlBuilderState;
	onStateChange: (state: SqlBuilderState) => void;
}

interface ColumnToggleProps {
	col: string;
	isSelected: boolean;
	columns: string[];
	onUpdate: (columns: string[]) => void;
}

const ColumnToggle = ({ col, isSelected, columns, onUpdate }: ColumnToggleProps) => {
	const handleClick = useCallback(() => {
		const next = isSelected
			? columns.filter((c) => c !== col)
			: [...columns, col];
		onUpdate(next);
	}, [col, isSelected, columns, onUpdate]);

	return (
		<Button
			variant={isSelected ? 'secondary' : 'ghost'}
			size='xs'
			onClick={handleClick}
		>
			{col}
		</Button>
	);
};

interface GroupByToggleProps {
	col: string;
	isSelected: boolean;
	groupBy: string[];
	onUpdate: (groupBy: string[]) => void;
}

const GroupByToggle = ({ col, isSelected, groupBy, onUpdate }: GroupByToggleProps) => {
	const handleClick = useCallback(() => {
		const next = isSelected
			? groupBy.filter((c) => c !== col)
			: [...groupBy, col];
		onUpdate(next);
	}, [col, isSelected, groupBy, onUpdate]);

	return (
		<Button
			variant={isSelected ? 'secondary' : 'ghost'}
			size='xs'
			onClick={handleClick}
		>
			{col}
		</Button>
	);
};

interface WhereRowWrapperProps {
	index: number;
	columns: string[];
	clause: WhereClause;
	onUpdate: (index: number, clause: WhereClause) => void;
	onRemove: (index: number) => void;
}

const WhereRowWrapper = ({ index, columns, clause, onUpdate, onRemove }: WhereRowWrapperProps) => {
	const handleChange = useCallback(
		(c: WhereClause) => {
			onUpdate(index, c);
		},
		[index, onUpdate],
	);

	const handleRemove = useCallback(() => {
		onRemove(index);
	}, [index, onRemove]);

	return (
		<SqlBuilderWhereRow
			columns={columns}
			clause={clause}
			onChange={handleChange}
			onRemove={handleRemove}
		/>
	);
};

interface OrderByRowProps {
	index: number;
	clause: OrderByClause;
	columnNames: string[];
	onUpdate: (index: number, clause: OrderByClause) => void;
	onRemove: (index: number) => void;
}

const OrderByRow = ({ index, clause, columnNames, onUpdate, onRemove }: OrderByRowProps) => {
	const handleColumnChange = useCallback(
		(col: string | null) => {
			if (col !== null) {
				onUpdate(index, { ...clause, column: col });
			}
		},
		[index, clause, onUpdate],
	);

	const handleDirectionChange = useCallback(
		(dir: string | null) => {
			if (dir !== null && isOrderDirection(dir)) {
				onUpdate(index, { ...clause, direction: dir });
			}
		},
		[index, clause, onUpdate],
	);

	const handleRemove = useCallback(() => {
		onRemove(index);
	}, [index, onRemove]);

	return (
		<div className='flex items-center gap-1.5'>
			<Select
				value={clause.column}
				onValueChange={handleColumnChange}
			>
				<SelectTrigger aria-label='ORDER BY column' className='w-36'>
					<SelectValue placeholder='Column' />
				</SelectTrigger>
				<SelectContent>
					{columnNames.map((c) => (
						<SelectItem key={c} value={c}>
							{c}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				value={clause.direction}
				onValueChange={handleDirectionChange}
			>
				<SelectTrigger aria-label='Sort direction' className='w-20'>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value='ASC'>ASC</SelectItem>
					<SelectItem value='DESC'>DESC</SelectItem>
				</SelectContent>
			</Select>
			<Button variant='ghost' size='icon-xs' onClick={handleRemove} aria-label='Remove order'>
				<XIcon />
			</Button>
		</div>
	);
};

export const SqlBuilder = ({ datasourceId, state, onStateChange }: SqlBuilderProps) => {
	const tablesQuery = useQuery(tablesQueryOptions(datasourceId));
	const columnsQuery = useQuery(columnsQueryOptions(datasourceId, state.table));

	const tables = tablesQuery.data?.tables ?? [];
	const columnNames = useMemo(() => (columnsQuery.data?.columns ?? []).map((c) => c.name), [columnsQuery.data?.columns]);
	const hasError = tablesQuery.data?.error !== undefined || columnsQuery.data?.error !== undefined;

	const updateField = useCallback(
		<K extends keyof SqlBuilderState>(key: K, value: SqlBuilderState[K]) => {
			onStateChange({ ...state, [key]: value });
		},
		[state, onStateChange],
	);

	const handleTableChange = useCallback(
		(table: string | null) => {
			if (table === null) return;
			onStateChange({
				...state,
				table,
				columns: [],
				where: [],
				groupBy: [],
				orderBy: [],
			});
		},
		[state, onStateChange],
	);

	const addWhere = useCallback(() => {
		updateField('where', [...state.where, { column: '', operator: '=', value: '' }]);
	}, [state.where, updateField]);

	const updateWhere = useCallback(
		(index: number, clause: WhereClause) => {
			const next = [...state.where];
			next[index] = clause;
			updateField('where', next);
		},
		[state.where, updateField],
	);

	const removeWhere = useCallback(
		(index: number) => {
			updateField('where', state.where.filter((_, i) => i !== index));
		},
		[state.where, updateField],
	);

	const addOrderBy = useCallback(() => {
		updateField('orderBy', [...state.orderBy, { column: '', direction: 'ASC' }]);
	}, [state.orderBy, updateField]);

	const updateOrderBy = useCallback(
		(index: number, clause: OrderByClause) => {
			const next = [...state.orderBy];
			next[index] = clause;
			updateField('orderBy', next);
		},
		[state.orderBy, updateField],
	);

	const removeOrderBy = useCallback(
		(index: number) => {
			updateField('orderBy', state.orderBy.filter((_, i) => i !== index));
		},
		[state.orderBy, updateField],
	);

	const clearColumns = useCallback(() => {
		updateField('columns', []);
	}, [updateField]);

	const updateColumns = useCallback(
		(cols: string[]) => {
			updateField('columns', cols);
		},
		[updateField],
	);

	const handleTimeColumnChange = useCallback(
		(v: string | null) => {
			if (v !== null) {
				updateField('timeColumn', v);
			}
		},
		[updateField],
	);

	const handleTimeIntervalChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			updateField('timeGroupInterval', e.target.value);
		},
		[updateField],
	);

	const updateGroupBy = useCallback(
		(groupBy: string[]) => {
			updateField('groupBy', groupBy);
		},
		[updateField],
	);

	const handleLimitChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const v = e.target.value;
			updateField('limit', v === '' ? undefined : Number(v));
		},
		[updateField],
	);

	return (
		<div className='flex flex-col gap-3'>
			{hasError && (
				<div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
					<AlertTriangleIcon className='size-3.5' />
					Could not load schema. You can still type column names manually.
				</div>
			)}

			{/* Table */}
			<div className='flex items-center gap-2'>
				<Label className='w-24 shrink-0 text-xs font-medium'>Table</Label>
				<Select value={state.table} onValueChange={handleTableChange}>
					<SelectTrigger aria-label='Table' className='w-56'>
						<SelectValue placeholder='Select table' />
					</SelectTrigger>
					<SelectContent>
						{tables.map((t) => (
							<SelectItem key={t.name} value={t.name}>
								{t.schema === undefined ? t.name : `${t.schema}.${t.name}`}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Columns */}
			<div className='flex items-start gap-2'>
				<Label className='mt-1.5 w-24 shrink-0 text-xs font-medium'>Columns</Label>
				<div className='flex flex-wrap gap-1'>
					<Button
						variant={state.columns.length === 0 ? 'secondary' : 'ghost'}
						size='xs'
						onClick={clearColumns}
					>
						All (*)
					</Button>
					{columnNames.map((col) => (
						<ColumnToggle
							key={col}
							col={col}
							isSelected={state.columns.includes(col)}
							columns={state.columns}
							onUpdate={updateColumns}
						/>
					))}
				</div>
			</div>

			{/* WHERE */}
			<div className='flex items-start gap-2'>
				<Label className='mt-1.5 w-24 shrink-0 text-xs font-medium'>Where</Label>
				<div className='flex flex-col gap-1.5'>
					{state.where.map((clause, i) => (
						<WhereRowWrapper
							key={i}
							index={i}
							columns={columnNames}
							clause={clause}
							onUpdate={updateWhere}
							onRemove={removeWhere}
						/>
					))}
					<Button variant='ghost' size='xs' onClick={addWhere}>
						<PlusIcon data-icon='inline-start' />
						Add condition
					</Button>
				</div>
			</div>

			{/* Time column */}
			<div className='flex items-center gap-2'>
				<Label className='w-24 shrink-0 text-xs font-medium'>Time column</Label>
				<Select
					value={state.timeColumn}
					onValueChange={handleTimeColumnChange}
				>
					<SelectTrigger aria-label='Time column' className='w-40'>
						<SelectValue placeholder='None' />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value=''>None</SelectItem>
						{columnNames.map((col) => (
							<SelectItem key={col} value={col}>
								{col}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{state.timeColumn !== '' && (
					<Input
						value={state.timeGroupInterval}
						onChange={handleTimeIntervalChange}
						placeholder='Interval (e.g. 5m)'
						className='h-7 w-32'
						aria-label='Time group interval'
					/>
				)}
			</div>

			{/* GROUP BY */}
			<div className='flex items-start gap-2'>
				<Label className='mt-1.5 w-24 shrink-0 text-xs font-medium'>Group by</Label>
				<div className='flex flex-wrap gap-1'>
					{columnNames.map((col) => (
						<GroupByToggle
							key={col}
							col={col}
							isSelected={state.groupBy.includes(col)}
							groupBy={state.groupBy}
							onUpdate={updateGroupBy}
						/>
					))}
				</div>
			</div>

			{/* ORDER BY */}
			<div className='flex items-start gap-2'>
				<Label className='mt-1.5 w-24 shrink-0 text-xs font-medium'>Order by</Label>
				<div className='flex flex-col gap-1.5'>
					{state.orderBy.map((clause, i) => (
						<OrderByRow
							key={i}
							index={i}
							clause={clause}
							columnNames={columnNames}
							onUpdate={updateOrderBy}
							onRemove={removeOrderBy}
						/>
					))}
					<Button variant='ghost' size='xs' onClick={addOrderBy}>
						<PlusIcon data-icon='inline-start' />
						Add ordering
					</Button>
				</div>
			</div>

			{/* LIMIT */}
			<div className='flex items-center gap-2'>
				<Label className='w-24 shrink-0 text-xs font-medium'>Limit</Label>
				<Input
					type='number'
					value={state.limit ?? ''}
					onChange={handleLimitChange}
					placeholder='No limit'
					className='h-7 w-24'
					aria-label='Row limit'
					min={0}
				/>
			</div>
		</div>
	);
};

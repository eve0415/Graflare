import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { FUNCTION_CATALOG, catalogByName } from '@graflare/shared/promql/catalog';
import type { FunctionApplication, FunctionParam } from '@graflare/shared/promql/types';

type GroupingMode = 'by' | 'without';

const GROUPING_MODES = new Set<string>(['by', 'without']);

const isGroupingMode = (value: string): value is GroupingMode => GROUPING_MODES.has(value);

interface PromqlFunctionComposerProps {
	functions: FunctionApplication[];
	onAdd: (name: string) => void;
	onRemove: (index: number) => void;
	onReorder: (fromIndex: number, toIndex: number) => void;
	onParamChange: (fnIndex: number, paramIndex: number, param: FunctionParam) => void;
}

const ParamEditor = ({
	param,
	onChange,
}: {
	param: FunctionParam;
	onChange: (param: FunctionParam) => void;
}) => {
	const handleRangeChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (param.kind === 'range') {
				onChange({ ...param, value: e.target.value });
			}
		},
		[param, onChange],
	);

	const handleScalarChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (param.kind === 'scalar') {
				onChange({ ...param, value: e.target.value });
			}
		},
		[param, onChange],
	);

	const handleModeChange = useCallback(
		(mode: string | null) => {
			if (mode !== null && param.kind === 'grouping' && isGroupingMode(mode)) {
				onChange({ ...param, mode });
			}
		},
		[param, onChange],
	);

	const handleLabelsChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (param.kind === 'grouping') {
				onChange({
					...param,
					labels: e.target.value
						.split(',')
						.map((l) => l.trim())
						.filter(Boolean),
				});
			}
		},
		[param, onChange],
	);

	if (param.kind === 'range') {
		return (
			<Input
				value={param.value}
				onChange={handleRangeChange}
				placeholder='5m'
				className='h-6 w-16 text-xs'
				aria-label='Range duration'
			/>
		);
	}

	if (param.kind === 'scalar') {
		return (
			<Input
				value={param.value}
				onChange={handleScalarChange}
				placeholder='0'
				className='h-6 w-16 text-xs'
				aria-label='Scalar value'
			/>
		);
	}

	return (
		<div className='flex items-center gap-1'>
			<Select
				value={param.mode}
				onValueChange={handleModeChange}
			>
				<SelectTrigger aria-label='Grouping mode' className='h-6 w-20 text-xs'>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value='by'>by</SelectItem>
					<SelectItem value='without'>without</SelectItem>
				</SelectContent>
			</Select>
			<Input
				value={param.labels.join(', ')}
				onChange={handleLabelsChange}
				placeholder='label1, label2'
				className='h-6 w-32 text-xs'
				aria-label='Grouping labels'
			/>
		</div>
	);
};

interface IndexedParamEditorProps {
	paramIndex: number;
	param: FunctionParam;
	onParamChange: (paramIndex: number, param: FunctionParam) => void;
}

const IndexedParamEditor = ({ paramIndex, param, onParamChange }: IndexedParamEditorProps) => {
	const handleChange = useCallback(
		(p: FunctionParam) => {
			onParamChange(paramIndex, p);
		},
		[paramIndex, onParamChange],
	);

	return <ParamEditor param={param} onChange={handleChange} />;
};

interface FunctionPickerButtonProps {
	name: string;
	onPick: (name: string) => void;
}

const FunctionPickerButton = ({ name, onPick }: FunctionPickerButtonProps) => {
	const handleClick = useCallback(() => {
		onPick(name);
	}, [name, onPick]);

	return (
		<Button variant='ghost' size='xs' onClick={handleClick}>
			{name}
		</Button>
	);
};

interface FunctionRowProps {
	fn: FunctionApplication;
	index: number;
	isFirst: boolean;
	isLast: boolean;
	onRemove: (index: number) => void;
	onReorder: (fromIndex: number, toIndex: number) => void;
	onParamChange: (fnIndex: number, paramIndex: number, param: FunctionParam) => void;
}

const FunctionRow = ({ fn, index, isFirst, isLast, onRemove, onReorder, onParamChange }: FunctionRowProps) => {
	const entry = catalogByName.get(fn.name);

	const handleMoveUp = useCallback(() => {
		onReorder(index, index - 1);
	}, [index, onReorder]);

	const handleMoveDown = useCallback(() => {
		onReorder(index, index + 1);
	}, [index, onReorder]);

	const handleRemove = useCallback(() => {
		onRemove(index);
	}, [index, onRemove]);

	const handleParamChange = useCallback(
		(pi: number, p: FunctionParam) => {
			onParamChange(index, pi, p);
		},
		[index, onParamChange],
	);

	return (
		<div className='bg-muted/50 flex items-center gap-1.5 rounded-md px-2 py-1'>
			<span className='text-xs font-medium'>{fn.name}</span>
			{fn.params.map((param, pi) => (
				<IndexedParamEditor
					key={pi}
					paramIndex={pi}
					param={param}
					onParamChange={handleParamChange}
				/>
			))}
			{entry !== undefined && (
				<span className='text-muted-foreground ml-auto text-[10px]'>{entry.description}</span>
			)}
			<div className='flex items-center gap-0.5'>
				<Button
					variant='ghost'
					size='icon-xs'
					onClick={handleMoveUp}
					disabled={isFirst}
					aria-label='Move up'
				>
					<ArrowUpIcon />
				</Button>
				<Button
					variant='ghost'
					size='icon-xs'
					onClick={handleMoveDown}
					disabled={isLast}
					aria-label='Move down'
				>
					<ArrowDownIcon />
				</Button>
				<Button variant='ghost' size='icon-xs' onClick={handleRemove} aria-label='Remove function'>
					<XIcon />
				</Button>
			</div>
		</div>
	);
};

export const PromqlFunctionComposer = ({
	functions: fns,
	onAdd,
	onRemove,
	onReorder,
	onParamChange,
}: PromqlFunctionComposerProps) => {
	const [showPicker, setShowPicker] = useState(false);

	const handlePickFunction = useCallback(
		(name: string) => {
			onAdd(name);
			setShowPicker(false);
		},
		[onAdd],
	);

	const hidePicker = useCallback(() => {
		setShowPicker(false);
	}, []);

	const openPicker = useCallback(() => {
		setShowPicker(true);
	}, []);

	return (
		<div className='flex flex-col gap-1.5'>
			{fns.map((fn, i) => (
				<FunctionRow
					key={fn.id}
					fn={fn}
					index={i}
					isFirst={i === 0}
					isLast={i === fns.length - 1}
					onRemove={onRemove}
					onReorder={onReorder}
					onParamChange={onParamChange}
				/>
			))}

			{showPicker ? (
				<div className='flex flex-wrap gap-1'>
					{FUNCTION_CATALOG.map((entry) => (
						<FunctionPickerButton key={entry.name} name={entry.name} onPick={handlePickFunction} />
					))}
					<Button variant='ghost' size='xs' onClick={hidePicker}>
						Cancel
					</Button>
				</div>
			) : (
				<Button variant='ghost' size='xs' onClick={openPicker}>
					<PlusIcon data-icon='inline-start' />
					Add function
				</Button>
			)}
		</div>
	);
};

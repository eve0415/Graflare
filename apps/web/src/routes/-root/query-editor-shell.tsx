import { Button } from '@graflare/ui/components/button';
import { CodeIcon, LayoutListIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback } from 'react';

export type QueryEditorMode = 'builder' | 'code';

interface QueryEditorShellProps {
	mode: QueryEditorMode;
	onModeChange: (mode: QueryEditorMode) => void;
	preview?: string | undefined;
	children: ReactNode;
}

export const QueryEditorShell = ({ mode, onModeChange, preview, children }: QueryEditorShellProps) => {
	const selectBuilder = useCallback(() => {
		onModeChange('builder');
	}, [onModeChange]);

	const selectCode = useCallback(() => {
		onModeChange('code');
	}, [onModeChange]);

	return (
		<div className='flex flex-col gap-2'>
			<div className='flex items-center gap-1' role='radiogroup' aria-label='Query editor mode'>
				<Button
					variant={mode === 'builder' ? 'secondary' : 'ghost'}
					size='sm'
					aria-pressed={mode === 'builder'}
					onClick={selectBuilder}
				>
					<LayoutListIcon data-icon='inline-start' />
					Builder
				</Button>
				<Button
					variant={mode === 'code' ? 'secondary' : 'ghost'}
					size='sm'
					aria-pressed={mode === 'code'}
					onClick={selectCode}
				>
					<CodeIcon data-icon='inline-start' />
					Code
				</Button>
			</div>
			{children}
			{mode === 'builder' && preview !== undefined && preview !== '' && (
				<pre className='bg-muted text-muted-foreground overflow-x-auto rounded-md p-3 font-mono text-xs leading-relaxed'>
					{preview}
				</pre>
			)}
		</div>
	);
};

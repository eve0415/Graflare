import type { ReactNode } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@graflare/ui/components/toggle-group';
import { CodeIcon, LayoutListIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

export type QueryEditorMode = 'builder' | 'code';

const isQueryEditorMode = (value: string | undefined): value is QueryEditorMode => value === 'builder' || value === 'code';

interface QueryEditorShellProps {
  mode: QueryEditorMode;
  onModeChange: (mode: QueryEditorMode) => void;
  preview?: string | undefined;
  children: ReactNode;
}

export const QueryEditorShell = ({ mode, onModeChange, preview, children }: QueryEditorShellProps) => {
  const value = useMemo(() => [mode], [mode]);

  const handleModeChange = useCallback(
    (values: string[]) => {
      // Single-select, but Base UI hands back an array and lets the active item deselect to an
      // empty array. The mode is required, so ignore an empty/invalid result and keep the
      // current mode (the controlled `value` below holds it steady).
      const [next] = values;
      if (isQueryEditorMode(next)) onModeChange(next);
    },
    [onModeChange],
  );

  return (
    <div className='flex flex-col gap-2'>
      <ToggleGroup size='sm' value={value} onValueChange={handleModeChange} aria-label='Query editor mode'>
        <ToggleGroupItem value='builder'>
          <LayoutListIcon data-icon='inline-start' />
          Builder
        </ToggleGroupItem>
        <ToggleGroupItem value='code'>
          <CodeIcon data-icon='inline-start' />
          Code
        </ToggleGroupItem>
      </ToggleGroup>
      {children}
      {mode === 'builder' && preview !== undefined && preview !== '' && (
        <pre className='bg-muted text-muted-foreground overflow-x-auto rounded-md p-3 font-mono text-xs leading-relaxed'>{preview}</pre>
      )}
    </div>
  );
};

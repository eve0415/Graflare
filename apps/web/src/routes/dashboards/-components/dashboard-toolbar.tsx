import { Button } from '@graflare/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Separator } from '@graflare/ui/components/separator';
import { Pencil, RefreshCw, Save, Settings } from 'lucide-react';
import { useCallback } from 'react';

import { TimeRangePicker } from '../../-root/time-range-picker';

interface TimeRange {
  from: string;
  to: string;
}

type RefreshInterval = '5s' | '10s' | '30s' | '1m' | '5m' | '15m' | '30m' | '1h' | 'off';

const validIntervals = new Set<string>(['off', '5s', '10s', '30s', '1m', '5m', '15m', '30m', '1h']);

const isRefreshInterval = (val: string): val is RefreshInterval => validIntervals.has(val);

interface DashboardToolbarProps {
  title: string;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  refreshInterval: RefreshInterval;
  onRefreshIntervalChange: (interval: RefreshInterval) => void;
  editMode: boolean;
  onEditModeToggle: () => void;
  onSave?: () => void;
  onSettings?: () => void;
  saving?: boolean;
}

const refreshOptions = [
  { value: 'off', label: 'Off' },
  { value: '5s', label: '5s' },
  { value: '10s', label: '10s' },
  { value: '30s', label: '30s' },
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
] as const;

export const DashboardToolbar = ({
  title,
  timeRange,
  onTimeRangeChange,
  refreshInterval,
  onRefreshIntervalChange,
  editMode,
  onEditModeToggle,
  onSave,
  onSettings,
  saving,
}: DashboardToolbarProps) => {
  const handleRefreshChange = useCallback(
    (val: string | null) => {
      if (val !== null && isRefreshInterval(val)) onRefreshIntervalChange(val);
    },
    [onRefreshIntervalChange],
  );

  return (
    <div className='flex items-center justify-between border-b px-4 py-2'>
      <h1 className='text-lg font-semibold'>{title}</h1>

      <div className='flex items-center gap-2'>
        <TimeRangePicker value={timeRange} onChange={onTimeRangeChange} />

        <Select value={refreshInterval} onValueChange={handleRefreshChange} items={refreshOptions}>
          <SelectTrigger className='w-20' aria-label='Auto-refresh interval'>
            <RefreshCw className='mr-1 h-3 w-3' />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {refreshOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation='vertical' className='!h-6' />

        <Button variant={editMode ? 'secondary' : 'ghost'} size='sm' onClick={onEditModeToggle}>
          <Pencil className='mr-1 h-3.5 w-3.5' />
          {editMode ? 'Editing' : 'Edit'}
        </Button>

        {editMode && onSave !== undefined && (
          <Button size='sm' onClick={onSave} disabled={saving}>
            <Save className='mr-1 h-3.5 w-3.5' />
            {saving === true ? 'Saving...' : 'Save'}
          </Button>
        )}

        {onSettings !== undefined && (
          <Button variant='ghost' size='icon' onClick={onSettings} aria-label='Dashboard settings'>
            <Settings className='h-4 w-4' />
          </Button>
        )}
      </div>
    </div>
  );
};

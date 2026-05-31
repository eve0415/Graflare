import { Button } from '@graflare/ui/components/button';
import { Popover, PopoverContent, PopoverTrigger } from '@graflare/ui/components/popover';
import { Separator } from '@graflare/ui/components/separator';
import { Clock } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

interface TimeRange {
  from: string;
  to: string;
}

interface TimeRangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const presets = [
  { label: 'Last 5m', from: 'now-5m', to: 'now' },
  { label: 'Last 15m', from: 'now-15m', to: 'now' },
  { label: 'Last 30m', from: 'now-30m', to: 'now' },
  { label: 'Last 1h', from: 'now-1h', to: 'now' },
  { label: 'Last 3h', from: 'now-3h', to: 'now' },
  { label: 'Last 6h', from: 'now-6h', to: 'now' },
  { label: 'Last 12h', from: 'now-12h', to: 'now' },
  { label: 'Last 24h', from: 'now-24h', to: 'now' },
  { label: 'Last 2d', from: 'now-2d', to: 'now' },
  { label: 'Last 7d', from: 'now-7d', to: 'now' },
  { label: 'Last 30d', from: 'now-30d', to: 'now' },
] as const;

const displayRange = (range: TimeRange) => {
  const preset = presets.find(p => p.from === range.from && p.to === range.to);
  if (preset !== undefined) return preset.label;
  return `${range.from} to ${range.to}`;
};

export const TimeRangePicker = ({ value, onChange }: TimeRangePickerProps) => {
  const [open, setOpen] = useState(false);

  const handlePreset = useCallback((from: string, to: string) => {
    onChange({ from, to });
    setOpen(false);
  }, [onChange]);

  const display = useMemo(() => displayRange(value), [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant='outline' size='sm' aria-label='Select time range' />}>
        <Clock className='mr-2 h-3.5 w-3.5' />
        {display}
      </PopoverTrigger>
      <PopoverContent className='w-56 p-2' align='end'>
        <div className='text-muted-foreground mb-2 px-2 text-xs font-medium'>Quick ranges</div>
        <div className='grid gap-0.5'>
          {presets.map(p => (
            <PresetButton
              key={p.label}
              label={p.label}
              from={p.from}
              to={p.to}
              active={p.from === value.from && p.to === value.to}
              onSelect={handlePreset}
            />
          ))}
        </div>
        <Separator className='my-2' />
        <div className='text-muted-foreground px-2 text-xs'>Custom ranges coming soon</div>
      </PopoverContent>
    </Popover>
  );
};

const PresetButton = ({ label, from, to, active, onSelect }: { label: string; from: string; to: string; active: boolean; onSelect: (from: string, to: string) => void }) => {
  const handleClick = useCallback(() => { onSelect(from, to); }, [from, to, onSelect]);

  return (
    <button
      type='button'
      className={`hover:bg-accent rounded-sm px-2 py-1 text-left text-sm ${active ? 'bg-accent font-medium' : ''}`}
      onClick={handleClick}
    >
      {label}
    </button>
  );
};

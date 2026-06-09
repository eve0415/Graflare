import { parseTimeExpr } from '@graflare/shared/time/resolve';
import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
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

// Calendar ranges use `/unit` snapping. resolveRange rounds `from` to the start of the unit and
// `to` to the end, so "Today" (now/d–now/d) spans the whole day rather than collapsing to midnight.
const calendarPresets = [
  { label: 'Today', from: 'now/d', to: 'now/d' },
  { label: 'Yesterday', from: 'now-1d/d', to: 'now-1d/d' },
  { label: 'This week', from: 'now/w', to: 'now/w' },
  { label: 'This month', from: 'now/M', to: 'now/M' },
  { label: 'This year', from: 'now/y', to: 'now/y' },
] as const;

// One flat list for trigger-label + active-state lookup across both quick-range groups.
const allPresets: readonly { label: string; from: string; to: string }[] = [...presets, ...calendarPresets];

// A stored absolute time is a bare epoch-second string (String(Math.floor(...))).
// Relative expressions ("now-2h") and "now" never match, so this is the exact
// discriminator for "was this picked as an absolute time?".
const EPOCH_PATTERN = /^\d+$/;
const isEpoch = (s: string): boolean => EPOCH_PATTERN.test(s);

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// epoch seconds -> readable local date-time for the trigger label.
const formatEpoch = (epoch: string): string => dateTimeFormat.format(new Date(Number(epoch) * 1000));

// epoch seconds -> a `<input type="datetime-local">` value (local wall clock,
// "YYYY-MM-DDTHH:mm"). Offsetting by the TZ then slicing the ISO string yields
// the local time, matching the pattern used by the silence form.
const epochToLocalInput = (epoch: string): string => {
  const d = new Date(Number(epoch) * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// `<input type="datetime-local">` value -> epoch-second string, or null if the
// value is empty or unparseable. Local-parsed and floored to seconds.
const localInputToEpoch = (value: string): string | null => {
  if (value === '') return null;
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return String(Math.floor(ms / 1000));
};

const displayRange = (range: TimeRange): string => {
  const preset = allPresets.find(p => p.from === range.from && p.to === range.to);
  if (preset !== undefined) return preset.label;
  if (isEpoch(range.from) && isEpoch(range.to)) return `${formatEpoch(range.from)} — ${formatEpoch(range.to)}`;
  return `${range.from} to ${range.to}`;
};

export const TimeRangePicker = ({ value, onChange }: TimeRangePickerProps) => {
  const [open, setOpen] = useState(false);
  const [absFrom, setAbsFrom] = useState('');
  const [absTo, setAbsTo] = useState('');
  const [relFrom, setRelFrom] = useState('now-1h');
  const [relTo, setRelTo] = useState('now');

  // Prefill both sections from the current value at the moment the popover opens
  // (in the open handler, not an effect, to avoid cascading renders). Per-field
  // by type: epochs seed the absolute inputs; relative expressions seed the
  // relative text fields.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        if (isEpoch(value.from)) setAbsFrom(epochToLocalInput(value.from));
        else setRelFrom(value.from);
        if (isEpoch(value.to)) setAbsTo(epochToLocalInput(value.to));
        else setRelTo(value.to);
      }
      setOpen(next);
    },
    [value.from, value.to],
  );

  const handlePreset = useCallback(
    (from: string, to: string) => {
      onChange({ from, to });
      setOpen(false);
    },
    [onChange],
  );

  const handleAbsFromChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAbsFrom(e.target.value);
  }, []);

  const handleAbsToChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAbsTo(e.target.value);
  }, []);

  const handleRelFromChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRelFrom(e.target.value);
  }, []);

  const handleRelToChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRelTo(e.target.value);
  }, []);

  const absFromEpoch = useMemo(() => localInputToEpoch(absFrom), [absFrom]);
  const absToEpoch = useMemo(() => localInputToEpoch(absTo), [absTo]);
  const absValid = absFromEpoch !== null && absToEpoch !== null;

  const handleApplyAbsolute = useCallback(() => {
    if (absFromEpoch === null || absToEpoch === null) return;
    onChange({ from: absFromEpoch, to: absToEpoch });
    setOpen(false);
  }, [absFromEpoch, absToEpoch, onChange]);

  const relFromValid = useMemo(() => parseTimeExpr(relFrom) !== null, [relFrom]);
  const relToValid = useMemo(() => parseTimeExpr(relTo) !== null, [relTo]);
  const relValid = relFromValid && relToValid;

  const handleApplyRelative = useCallback(() => {
    if (parseTimeExpr(relFrom) === null || parseTimeExpr(relTo) === null) return;
    // Store the raw expressions so they re-resolve live on each refresh.
    onChange({ from: relFrom, to: relTo });
    setOpen(false);
  }, [relFrom, relTo, onChange]);

  const display = useMemo(() => displayRange(value), [value]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={<Button variant='outline' size='sm' aria-label='Select time range' />}>
        <Clock className='mr-2 h-3.5 w-3.5' />
        {display}
      </PopoverTrigger>
      <PopoverContent className='w-72 p-2' align='end'>
        <div className='text-muted-foreground mb-2 px-2 text-xs font-medium'>Quick ranges</div>
        <div className='grid gap-0.5'>
          {presets.map(p => (
            <PresetButton key={p.label} label={p.label} from={p.from} to={p.to} active={p.from === value.from && p.to === value.to} onSelect={handlePreset} />
          ))}
        </div>

        <div className='text-muted-foreground mt-2 mb-2 px-2 text-xs font-medium'>Calendar</div>
        <div className='grid gap-0.5'>
          {calendarPresets.map(p => (
            <PresetButton key={p.label} label={p.label} from={p.from} to={p.to} active={p.from === value.from && p.to === value.to} onSelect={handlePreset} />
          ))}
        </div>

        <Separator className='my-2' />

        <div className='text-muted-foreground mb-2 px-2 text-xs font-medium'>Absolute range</div>
        <div className='grid gap-2 px-2'>
          <div className='grid gap-1'>
            <Label htmlFor='time-abs-from' className='text-xs'>
              From
            </Label>
            <Input id='time-abs-from' type='datetime-local' aria-label='Absolute from' value={absFrom} onChange={handleAbsFromChange} />
          </div>
          <div className='grid gap-1'>
            <Label htmlFor='time-abs-to' className='text-xs'>
              To
            </Label>
            <Input id='time-abs-to' type='datetime-local' aria-label='Absolute to' value={absTo} onChange={handleAbsToChange} />
          </div>
          <Button variant='secondary' size='sm' aria-label='Apply absolute range' disabled={!absValid} onClick={handleApplyAbsolute}>
            Apply
          </Button>
        </div>

        <Separator className='my-2' />

        <div className='text-muted-foreground mb-2 px-2 text-xs font-medium'>Relative range</div>
        <div className='grid gap-2 px-2'>
          <div className='grid gap-1'>
            <Label htmlFor='time-rel-from' className='text-xs'>
              From
            </Label>
            <Input
              id='time-rel-from'
              type='text'
              placeholder='now-1h'
              aria-label='Relative from'
              aria-invalid={!relFromValid}
              value={relFrom}
              onChange={handleRelFromChange}
            />
          </div>
          <div className='grid gap-1'>
            <Label htmlFor='time-rel-to' className='text-xs'>
              To
            </Label>
            <Input
              id='time-rel-to'
              type='text'
              placeholder='now'
              aria-label='Relative to'
              aria-invalid={!relToValid}
              value={relTo}
              onChange={handleRelToChange}
            />
          </div>
          {!relValid && <div className='text-destructive px-0.5 text-xs'>Use an expression like now-2h, now/d, or now+30m.</div>}
          <Button variant='secondary' size='sm' aria-label='Apply relative range' disabled={!relValid} onClick={handleApplyRelative}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const PresetButton = ({
  label,
  from,
  to,
  active,
  onSelect,
}: {
  label: string;
  from: string;
  to: string;
  active: boolean;
  onSelect: (from: string, to: string) => void;
}) => {
  const handleClick = useCallback(() => {
    onSelect(from, to);
  }, [from, to, onSelect]);

  return (
    <button type='button' className={`hover:bg-accent rounded-sm px-2 py-1 text-left text-sm ${active ? 'bg-accent font-medium' : ''}`} onClick={handleClick}>
      {label}
    </button>
  );
};

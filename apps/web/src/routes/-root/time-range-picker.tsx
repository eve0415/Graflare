import type { DateRange } from '@graflare/ui/components/calendar';

import { parseTimeExpr } from '@graflare/shared/time/resolve';
import { Button } from '@graflare/ui/components/button';
import { Calendar } from '@graflare/ui/components/calendar';
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

const pad2 = (n: number): string => String(n).padStart(2, '0');

// epoch seconds -> local "HH:mm" for an `<input type="time">`.
const epochToTimeInput = (epoch: string): string => {
  const d = new Date(Number(epoch) * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// A calendar day (local midnight) + an "HH:mm" time string -> epoch-second string. Interpreted in
// the browser's local timezone (matching how the picker has always handled absolute times); empty
// or malformed time parts fall back to 0, so the bound still resolves.
const combineDateTime = (date: Date, time: string): string => {
  const [hStr, mStr] = time.split(':');
  const hours = Number(hStr);
  const minutes = Number(mStr);
  const d = new Date(date);
  d.setHours(Number.isNaN(hours) ? 0 : hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);
  return String(Math.floor(d.getTime() / 1000));
};

const displayRange = (range: TimeRange): string => {
  const preset = allPresets.find(p => p.from === range.from && p.to === range.to);
  if (preset !== undefined) return preset.label;
  if (isEpoch(range.from) && isEpoch(range.to)) return `${formatEpoch(range.from)} — ${formatEpoch(range.to)}`;
  return `${range.from} to ${range.to}`;
};

export const TimeRangePicker = ({ value, onChange }: TimeRangePickerProps) => {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const [fromTime, setFromTime] = useState('00:00');
  const [toTime, setToTime] = useState('23:59');
  const [relFrom, setRelFrom] = useState('now-1h');
  const [relTo, setRelTo] = useState('now');

  // Prefill both sections from the current value at the moment the popover opens
  // (in the open handler, not an effect, to avoid cascading renders). Per-field
  // by type: an epoch pair seeds the calendar range + time inputs; relative
  // expressions seed the relative text fields.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        if (isEpoch(value.from) && isEpoch(value.to)) {
          setRange({ from: new Date(Number(value.from) * 1000), to: new Date(Number(value.to) * 1000) });
          setFromTime(epochToTimeInput(value.from));
          setToTime(epochToTimeInput(value.to));
        } else {
          setRelFrom(value.from);
          setRelTo(value.to);
        }
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

  const handleFromTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFromTime(e.target.value);
  }, []);

  const handleToTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setToTime(e.target.value);
  }, []);

  const handleRelFromChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRelFrom(e.target.value);
  }, []);

  const handleRelToChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRelTo(e.target.value);
  }, []);

  const absFrom = range?.from;
  const absTo = range?.to;
  const absValid = absFrom !== undefined && absTo !== undefined;

  // Open the calendar on the prefilled range's month; omit the prop entirely (rather than passing
  // `undefined`) when there's no range, to satisfy exactOptionalPropertyTypes.
  const calendarMonthProps = useMemo(() => (absFrom === undefined ? {} : { defaultMonth: absFrom }), [absFrom]);

  const handleApplyAbsolute = useCallback(() => {
    if (absFrom === undefined || absTo === undefined) return;
    onChange({ from: combineDateTime(absFrom, fromTime), to: combineDateTime(absTo, toTime) });
    setOpen(false);
  }, [absFrom, absTo, fromTime, toTime, onChange]);

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
      <PopoverContent className='w-80 p-2' align='end'>
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
          <Calendar mode='range' selected={range} onSelect={setRange} className='mx-auto' {...calendarMonthProps} />
          <div className='grid grid-cols-2 gap-2'>
            <div className='grid gap-1'>
              <Label htmlFor='time-abs-from' className='text-xs'>
                From time
              </Label>
              <Input id='time-abs-from' type='time' aria-label='Absolute from time' value={fromTime} onChange={handleFromTimeChange} />
            </div>
            <div className='grid gap-1'>
              <Label htmlFor='time-abs-to' className='text-xs'>
                To time
              </Label>
              <Input id='time-abs-to' type='time' aria-label='Absolute to time' value={toTime} onChange={handleToTimeChange} />
            </div>
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

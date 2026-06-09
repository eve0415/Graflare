import { Button } from '@graflare/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { ToggleGroup, ToggleGroupItem } from '@graflare/ui/components/toggle-group';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { createMuteTiming } from '../-api';

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const;

const MONTHS = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
] as const;

interface IntervalRow {
  weekdays: number[];
  startTime: string;
  endTime: string;
  months: number[];
}

const IntervalEditor = ({
  index,
  interval,
  canRemove,
  onRemove,
  onStartTimeChange,
  onEndTimeChange,
  onWeekdaysChange,
  onMonthsChange,
}: {
  index: number;
  interval: IntervalRow;
  canRemove: boolean;
  onRemove: (index: number) => void;
  onStartTimeChange: (index: number, value: string) => void;
  onEndTimeChange: (index: number, value: string) => void;
  onWeekdaysChange: (index: number, weekdays: number[]) => void;
  onMonthsChange: (index: number, months: number[]) => void;
}) => {
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);
  const handleStart = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onStartTimeChange(index, e.target.value);
    },
    [index, onStartTimeChange],
  );
  const handleEnd = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onEndTimeChange(index, e.target.value);
    },
    [index, onEndTimeChange],
  );

  return (
    <div className='space-y-3 rounded-md border p-3'>
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>Interval {index + 1}</span>
        {canRemove && (
          <Button type='button' variant='ghost' size='xs' onClick={handleRemove}>
            <Trash2 className='h-3 w-3' />
          </Button>
        )}
      </div>

      <div className='space-y-2'>
        <Label className='text-xs'>Weekdays</Label>
        <WeekdayPicker weekdays={interval.weekdays} intervalIndex={index} onChange={onWeekdaysChange} />
      </div>

      <div className='grid grid-cols-2 gap-3'>
        <div className='space-y-1'>
          <Label htmlFor={`start-${index}`} className='text-xs'>
            Start Time
          </Label>
          <Input id={`start-${index}`} value={interval.startTime} onChange={handleStart} placeholder='00:00' />
        </div>
        <div className='space-y-1'>
          <Label htmlFor={`end-${index}`} className='text-xs'>
            End Time
          </Label>
          <Input id={`end-${index}`} value={interval.endTime} onChange={handleEnd} placeholder='24:00' />
        </div>
      </div>

      <div className='space-y-2'>
        <Label className='text-xs'>Months</Label>
        <MonthPicker months={interval.months} intervalIndex={index} onChange={onMonthsChange} />
      </div>
    </div>
  );
};

// Base UI's ToggleGroup speaks string values; the form stores numeric weekday/month ids. Parse
// the click-ordered string array back to numbers and re-sort ascending so the submitted payload
// keeps its canonical order regardless of the order items were toggled.
const toSortedNumbers = (values: string[]): number[] => values.map(Number).sort((a, b) => a - b);

const WeekdayPicker = ({
  weekdays,
  intervalIndex,
  onChange,
}: {
  weekdays: number[];
  intervalIndex: number;
  onChange: (index: number, weekdays: number[]) => void;
}) => {
  const handleChange = useCallback(
    (values: string[]) => {
      onChange(intervalIndex, toSortedNumbers(values));
    },
    [intervalIndex, onChange],
  );
  const value = useMemo(() => weekdays.map(String), [weekdays]);

  return (
    <ToggleGroup multiple size='sm' value={value} onValueChange={handleChange} className='flex-wrap' aria-label='Weekdays'>
      {WEEKDAYS.map(day => (
        <ToggleGroupItem key={day.value} value={String(day.value)} variant='outline'>
          {day.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};

const MonthPicker = ({ months, intervalIndex, onChange }: { months: number[]; intervalIndex: number; onChange: (index: number, months: number[]) => void }) => {
  const handleChange = useCallback(
    (values: string[]) => {
      onChange(intervalIndex, toSortedNumbers(values));
    },
    [intervalIndex, onChange],
  );
  const value = useMemo(() => months.map(String), [months]);

  return (
    <ToggleGroup multiple size='sm' value={value} onValueChange={handleChange} className='flex-wrap' aria-label='Months'>
      {MONTHS.map(month => (
        <ToggleGroupItem key={month.value} value={String(month.value)} variant='outline'>
          {month.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};

interface FormState {
  name: string;
  intervals: IntervalRow[];
}

const emptyInterval: IntervalRow = { weekdays: [], startTime: '00:00', endTime: '24:00', months: [] };

const NewMuteTimingPage = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: '',
    intervals: [{ ...emptyInterval }],
  });

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      const run = async () => {
        setSubmitting(true);
        try {
          await createMuteTiming({
            data: {
              name: form.name,
              intervals: form.intervals.map(i => ({
                weekdays: i.weekdays,
                startTime: i.startTime,
                endTime: i.endTime,
                months: i.months,
              })),
            },
          });
          await navigate({ to: '/alerting/mute-timings' });
        } finally {
          setSubmitting(false);
        }
      };
      void run();
    },
    [form, navigate],
  );

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, name: value }));
  }, []);

  const handleAddInterval = useCallback(() => {
    setForm(prev => ({ ...prev, intervals: [...prev.intervals, { ...emptyInterval }] }));
  }, []);

  const handleRemoveInterval = useCallback((index: number) => {
    setForm(prev => ({ ...prev, intervals: prev.intervals.filter((_, i) => i !== index) }));
  }, []);

  const handleStartTimeChange = useCallback((index: number, value: string) => {
    setForm(prev => ({
      ...prev,
      intervals: prev.intervals.map((interval, i) => (i === index ? { ...interval, startTime: value } : interval)),
    }));
  }, []);

  const handleEndTimeChange = useCallback((index: number, value: string) => {
    setForm(prev => ({
      ...prev,
      intervals: prev.intervals.map((interval, i) => (i === index ? { ...interval, endTime: value } : interval)),
    }));
  }, []);

  const handleWeekdaysChange = useCallback((intervalIndex: number, weekdays: number[]) => {
    setForm(prev => ({
      ...prev,
      intervals: prev.intervals.map((interval, i) => (i === intervalIndex ? { ...interval, weekdays } : interval)),
    }));
  }, []);

  const handleMonthsChange = useCallback((intervalIndex: number, months: number[]) => {
    setForm(prev => ({
      ...prev,
      intervals: prev.intervals.map((interval, i) => (i === intervalIndex ? { ...interval, months } : interval)),
    }));
  }, []);

  const handleCancel = useCallback(() => {
    void navigate({ to: '/alerting/mute-timings' });
  }, [navigate]);

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>New Mute Timing</CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='space-y-2'>
            <Label htmlFor='name'>Name</Label>
            <Input id='name' value={form.name} onChange={handleNameChange} placeholder='Weekend maintenance' required />
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>Time Intervals</Label>
              <Button type='button' variant='outline' size='sm' onClick={handleAddInterval}>
                <Plus className='mr-1 h-3 w-3' />
                Add Interval
              </Button>
            </div>

            {form.intervals.map((interval, idx) => (
              <IntervalEditor
                key={idx}
                index={idx}
                interval={interval}
                canRemove={form.intervals.length > 1}
                onRemove={handleRemoveInterval}
                onStartTimeChange={handleStartTimeChange}
                onEndTimeChange={handleEndTimeChange}
                onWeekdaysChange={handleWeekdaysChange}
                onMonthsChange={handleMonthsChange}
              />
            ))}
          </div>
        </CardContent>
        <CardFooter className='flex gap-2'>
          <Button type='submit' disabled={submitting || form.name.trim() === ''}>
            {submitting ? 'Creating...' : 'Create Mute Timing'}
          </Button>
          <Button type='button' variant='outline' onClick={handleCancel}>
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};

export const Route = createFileRoute('/alerting/mute-timings/new')({
  component: NewMuteTimingPage,
});

import { Button } from '@graflare/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
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
  onWeekdayToggle,
  onMonthToggle,
}: {
  index: number;
  interval: IntervalRow;
  canRemove: boolean;
  onRemove: (index: number) => void;
  onStartTimeChange: (index: number, value: string) => void;
  onEndTimeChange: (index: number, value: string) => void;
  onWeekdayToggle: (index: number, day: number) => void;
  onMonthToggle: (index: number, month: number) => void;
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
        <WeekdayPicker weekdays={interval.weekdays} intervalIndex={index} onToggle={onWeekdayToggle} />
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
        <MonthPicker months={interval.months} intervalIndex={index} onToggle={onMonthToggle} />
      </div>
    </div>
  );
};

const WeekdayPicker = ({
  weekdays,
  intervalIndex,
  onToggle,
}: {
  weekdays: number[];
  intervalIndex: number;
  onToggle: (index: number, day: number) => void;
}) => {
  const handlers = useMemo(
    () =>
      WEEKDAYS.map(day => () => {
        onToggle(intervalIndex, day.value);
      }),
    [intervalIndex, onToggle],
  );

  return (
    <div className='flex flex-wrap gap-1'>
      {WEEKDAYS.map((day, i) => (
        <Button key={day.value} type='button' variant={weekdays.includes(day.value) ? 'default' : 'outline'} size='xs' onClick={handlers[i]}>
          {day.label}
        </Button>
      ))}
    </div>
  );
};

const MonthPicker = ({ months, intervalIndex, onToggle }: { months: number[]; intervalIndex: number; onToggle: (index: number, month: number) => void }) => {
  const handlers = useMemo(
    () =>
      MONTHS.map(month => () => {
        onToggle(intervalIndex, month.value);
      }),
    [intervalIndex, onToggle],
  );

  return (
    <div className='flex flex-wrap gap-1'>
      {MONTHS.map((month, i) => (
        <Button key={month.value} type='button' variant={months.includes(month.value) ? 'default' : 'outline'} size='xs' onClick={handlers[i]}>
          {month.label}
        </Button>
      ))}
    </div>
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

  const handleWeekdayToggle = useCallback((intervalIndex: number, day: number) => {
    setForm(prev => ({
      ...prev,
      intervals: prev.intervals.map((interval, i) => {
        if (i !== intervalIndex) return interval;
        const has = interval.weekdays.includes(day);
        return { ...interval, weekdays: has ? interval.weekdays.filter(d => d !== day) : [...interval.weekdays, day].sort((a, b) => a - b) };
      }),
    }));
  }, []);

  const handleMonthToggle = useCallback((intervalIndex: number, month: number) => {
    setForm(prev => ({
      ...prev,
      intervals: prev.intervals.map((interval, i) => {
        if (i !== intervalIndex) return interval;
        const has = interval.months.includes(month);
        return { ...interval, months: has ? interval.months.filter(m => m !== month) : [...interval.months, month].sort((a, b) => a - b) };
      }),
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
                onWeekdayToggle={handleWeekdayToggle}
                onMonthToggle={handleMonthToggle}
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

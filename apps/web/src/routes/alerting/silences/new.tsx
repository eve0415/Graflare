import { Button } from '@graflare/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { createSilence } from '../-api';

import { toEpoch } from './-datetime';

type MatchOperator = '=' | '!=' | '=~' | '!~';

interface Matcher {
  name: string;
  operator: MatchOperator;
  value: string;
}

const isMatchOperator = (v: string): v is MatchOperator => v === '=' || v === '!=' || v === '=~' || v === '!~';

const MATCH_OPERATOR_OPTIONS = [
  { value: '=', label: '=' },
  { value: '!=', label: '!=' },
  { value: '=~', label: '=~' },
  { value: '!~', label: '!~' },
] as const;

const MatcherRow = ({
  index,
  matcher,
  canRemove,
  onNameChange,
  onOperatorChange,
  onValueChange,
  onRemove,
}: {
  index: number;
  matcher: Matcher;
  canRemove: boolean;
  onNameChange: (index: number, value: string) => void;
  onOperatorChange: (index: number, value: string) => void;
  onValueChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) => {
  const handleName = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onNameChange(index, e.target.value);
    },
    [index, onNameChange],
  );
  const handleOp = useCallback(
    (v: string | null) => {
      onOperatorChange(index, v ?? '=');
    },
    [index, onOperatorChange],
  );
  const handleValue = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(index, e.target.value);
    },
    [index, onValueChange],
  );
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return (
    <div className='flex items-center gap-2'>
      <Input value={matcher.name} onChange={handleName} placeholder='Label name' className='flex-1' />
      <Select value={matcher.operator} onValueChange={handleOp} items={MATCH_OPERATOR_OPTIONS}>
        <SelectTrigger className='w-24'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MATCH_OPERATOR_OPTIONS.map(o => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input value={matcher.value} onChange={handleValue} placeholder='Value' className='flex-1' />
      {canRemove && (
        <Button type='button' variant='ghost' size='xs' onClick={handleRemove}>
          <Trash2 className='h-3 w-3' />
        </Button>
      )}
    </div>
  );
};

interface FormState {
  matchers: Matcher[];
  startsAt: string;
  endsAt: string;
  comment: string;
}

const nowIso = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const inTwoHoursIso = () => {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const NewSilencePage = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    matchers: [{ name: '', operator: '=', value: '' }],
    startsAt: nowIso(),
    endsAt: inTwoHoursIso(),
    comment: '',
  });

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      const run = async () => {
        setSubmitting(true);
        try {
          await createSilence({
            data: {
              matchers: form.matchers.filter(m => m.name.trim() !== '').map(m => ({ name: m.name, operator: m.operator, value: m.value })),
              startsAt: toEpoch(form.startsAt),
              endsAt: toEpoch(form.endsAt),
              comment: form.comment,
            },
          });
          await navigate({ to: '/alerting/silences' });
        } finally {
          setSubmitting(false);
        }
      };
      void run();
    },
    [form, navigate],
  );

  const handleAddMatcher = useCallback(() => {
    setForm(prev => ({ ...prev, matchers: [...prev.matchers, { name: '', operator: '=' as const, value: '' }] }));
  }, []);

  const handleRemoveMatcher = useCallback((index: number) => {
    setForm(prev => ({ ...prev, matchers: prev.matchers.filter((_, i) => i !== index) }));
  }, []);

  const handleMatcherNameChange = useCallback((index: number, value: string) => {
    setForm(prev => ({ ...prev, matchers: prev.matchers.map((m, i) => (i === index ? { ...m, name: value } : m)) }));
  }, []);

  const handleMatcherOperatorChange = useCallback((index: number, value: string) => {
    if (isMatchOperator(value)) {
      setForm(prev => ({ ...prev, matchers: prev.matchers.map((m, i) => (i === index ? { ...m, operator: value } : m)) }));
    }
  }, []);

  const handleMatcherValueChange = useCallback((index: number, value: string) => {
    setForm(prev => ({ ...prev, matchers: prev.matchers.map((m, i) => (i === index ? { ...m, value } : m)) }));
  }, []);

  const handleStartChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, startsAt: value }));
  }, []);

  const handleEndChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, endsAt: value }));
  }, []);

  const handleCommentChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, comment: value }));
  }, []);

  const handleCancel = useCallback(() => {
    void navigate({ to: '/alerting/silences' });
  }, [navigate]);

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>New Silence</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>Matchers</Label>
              <Button type='button' variant='outline' size='sm' onClick={handleAddMatcher}>
                <Plus className='mr-1 h-3 w-3' />
                Add Matcher
              </Button>
            </div>
            {form.matchers.map((m, i) => (
              <MatcherRow
                key={i}
                index={i}
                matcher={m}
                canRemove={form.matchers.length > 1}
                onNameChange={handleMatcherNameChange}
                onOperatorChange={handleMatcherOperatorChange}
                onValueChange={handleMatcherValueChange}
                onRemove={handleRemoveMatcher}
              />
            ))}
          </div>

          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='startsAt'>Start</Label>
              <Input id='startsAt' type='datetime-local' value={form.startsAt} onChange={handleStartChange} required />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='endsAt'>End</Label>
              <Input id='endsAt' type='datetime-local' value={form.endsAt} onChange={handleEndChange} required />
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='comment'>Comment</Label>
            <Input id='comment' value={form.comment} onChange={handleCommentChange} placeholder='Maintenance window' />
          </div>
        </CardContent>
        <CardFooter className='flex gap-2'>
          <Button type='submit' disabled={submitting || form.matchers.every(m => m.name.trim() === '')}>
            {submitting ? 'Creating...' : 'Create Silence'}
          </Button>
          <Button type='button' variant='outline' onClick={handleCancel}>
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};

export const Route = createFileRoute('/alerting/silences/new')({
  component: NewSilencePage,
});

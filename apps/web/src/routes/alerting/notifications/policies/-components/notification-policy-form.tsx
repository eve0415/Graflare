import type { LabelMatchOperator } from '@graflare/shared/schemas/alerting';
import type { CreateNotificationPolicy, NotificationPolicy } from '@graflare/shared/schemas/notification-policy';

import { Button, buttonVariants } from '@graflare/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Checkbox } from '@graflare/ui/components/checkbox';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Link } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

interface Matcher {
  name: string;
  operator: LabelMatchOperator;
  value: string;
}

export interface FormState {
  parentId: string;
  contactPointId: string;
  matchers: Matcher[];
  groupBy: string[];
  muteTimingIds: string[];
  groupWaitS: string;
  groupIntervalS: string;
  repeatIntervalS: string;
  continueMatching: boolean;
}

const isMatchOperator = (v: string): v is LabelMatchOperator => v === '=' || v === '!=' || v === '=~' || v === '!~';

const MATCH_OPERATOR_OPTIONS = [
  { value: '=', label: '=' },
  { value: '!=', label: '!=' },
  { value: '=~', label: '=~' },
  { value: '!~', label: '!~' },
] as const;

const ROOT_PARENT_OPTION = { value: '', label: 'Root (default policy)' } as const;
const NO_CONTACT_POINT_OPTION = { value: '', label: 'None' } as const;

export const defaultNotificationPolicyForm: FormState = {
  parentId: '',
  contactPointId: '',
  matchers: [],
  groupBy: ['alertname'],
  muteTimingIds: [],
  groupWaitS: '30',
  groupIntervalS: '300',
  repeatIntervalS: '14400',
  continueMatching: false,
};

type PolicySource = Pick<
  NotificationPolicy,
  'parentId' | 'contactPointId' | 'matchers' | 'groupBy' | 'muteTimingIds' | 'groupWaitS' | 'groupIntervalS' | 'repeatIntervalS' | 'continueMatching'
>;

export const policyToForm = (policy: PolicySource): FormState => ({
  parentId: policy.parentId ?? '',
  contactPointId: policy.contactPointId ?? '',
  matchers: policy.matchers.map(m => ({ name: m.name, operator: m.operator, value: m.value })),
  groupBy: [...policy.groupBy],
  muteTimingIds: [...policy.muteTimingIds],
  groupWaitS: String(policy.groupWaitS),
  groupIntervalS: String(policy.groupIntervalS),
  repeatIntervalS: String(policy.repeatIntervalS),
  continueMatching: policy.continueMatching,
});

const MatcherRow = ({
  index,
  matcher,
  onNameChange,
  onOperatorChange,
  onValueChange,
  onRemove,
}: {
  index: number;
  matcher: Matcher;
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
      <Button type='button' variant='ghost' size='xs' onClick={handleRemove}>
        <Trash2 className='h-3 w-3' />
      </Button>
    </div>
  );
};

const GroupByRow = ({
  index,
  value,
  onChange,
  onRemove,
}: {
  index: number;
  value: string;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, e.target.value);
    },
    [index, onChange],
  );
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return (
    <div className='flex items-center gap-2'>
      <Input value={value} onChange={handleChange} placeholder='alertname' className='flex-1' />
      <Button type='button' variant='ghost' size='xs' onClick={handleRemove}>
        <Trash2 className='h-3 w-3' />
      </Button>
    </div>
  );
};

const MuteTimingCheckbox = ({
  muteTiming,
  checked,
  onToggle,
}: {
  muteTiming: { id: string; name: string };
  checked: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) => {
  const handleChange = useCallback(
    (next: boolean) => {
      onToggle(muteTiming.id, next);
    },
    [muteTiming.id, onToggle],
  );

  const inputId = `mute-${muteTiming.id}`;

  return (
    <div className='flex items-center gap-2'>
      <Checkbox id={inputId} checked={checked} onCheckedChange={handleChange} aria-label={muteTiming.name} />
      <Label htmlFor={inputId} className='font-normal'>
        {muteTiming.name}
      </Label>
    </div>
  );
};

interface Props {
  initialForm: FormState;
  submitLabel: string;
  contactPoints: { id: string; name: string }[];
  muteTimings: { id: string; name: string }[];
  parentOptions: { value: string; label: string }[];
  onSubmit: (data: CreateNotificationPolicy) => Promise<void>;
}

export const NotificationPolicyForm = ({ initialForm, submitLabel, contactPoints, muteTimings, parentOptions, onSubmit }: Props) => {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);

  const title = submitLabel === 'Save Changes' ? 'Edit Notification Policy' : 'New Notification Policy';

  const parentItems = useMemo(() => [ROOT_PARENT_OPTION, ...parentOptions], [parentOptions]);
  const contactPointItems = useMemo(() => [NO_CONTACT_POINT_OPTION, ...contactPoints.map(cp => ({ value: cp.id, label: cp.name }))], [contactPoints]);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      const run = async () => {
        setSubmitting(true);
        try {
          await onSubmit({
            parentId: form.parentId === '' ? null : form.parentId,
            contactPointId: form.contactPointId === '' ? null : form.contactPointId,
            matchers: form.matchers.filter(m => m.name.trim() !== '').map(m => ({ name: m.name, operator: m.operator, value: m.value })),
            groupBy: form.groupBy.map(g => g.trim()).filter(g => g !== ''),
            muteTimingIds: form.muteTimingIds,
            groupWaitS: Number(form.groupWaitS),
            groupIntervalS: Number(form.groupIntervalS),
            repeatIntervalS: Number(form.repeatIntervalS),
            continueMatching: form.continueMatching,
          });
        } finally {
          setSubmitting(false);
        }
      };
      void run();
    },
    [form, onSubmit],
  );

  const handleParentChange = useCallback((value: string | null) => {
    if (value !== null) setForm(prev => ({ ...prev, parentId: value }));
  }, []);

  const handleContactPointChange = useCallback((value: string | null) => {
    if (value !== null) setForm(prev => ({ ...prev, contactPointId: value }));
  }, []);

  const handleAddMatcher = useCallback(() => {
    setForm(prev => ({ ...prev, matchers: [...prev.matchers, { name: '', operator: '=', value: '' }] }));
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

  const handleAddGroupBy = useCallback(() => {
    setForm(prev => ({ ...prev, groupBy: [...prev.groupBy, ''] }));
  }, []);

  const handleRemoveGroupBy = useCallback((index: number) => {
    setForm(prev => ({ ...prev, groupBy: prev.groupBy.filter((_, i) => i !== index) }));
  }, []);

  const handleGroupByChange = useCallback((index: number, value: string) => {
    setForm(prev => ({ ...prev, groupBy: prev.groupBy.map((g, i) => (i === index ? value : g)) }));
  }, []);

  const handleMuteTimingToggle = useCallback((id: string, checked: boolean) => {
    setForm(prev => ({
      ...prev,
      muteTimingIds: checked ? [...prev.muteTimingIds, id] : prev.muteTimingIds.filter(existing => existing !== id),
    }));
  }, []);

  const handleGroupWaitChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, groupWaitS: value }));
  }, []);

  const handleGroupIntervalChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, groupIntervalS: value }));
  }, []);

  const handleRepeatIntervalChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, repeatIntervalS: value }));
  }, []);

  const handleContinueMatchingChange = useCallback((checked: boolean) => {
    setForm(prev => ({ ...prev, continueMatching: checked }));
  }, []);

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='parent'>Parent policy</Label>
              <Select value={form.parentId} onValueChange={handleParentChange} items={parentItems}>
                <SelectTrigger id='parent'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {parentItems.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='contactPoint'>Contact point</Label>
              <Select value={form.contactPointId} onValueChange={handleContactPointChange} items={contactPointItems}>
                <SelectTrigger id='contactPoint'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contactPointItems.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>Matchers</Label>
              <Button type='button' variant='outline' size='sm' onClick={handleAddMatcher}>
                <Plus className='mr-1 h-3 w-3' />
                Add Matcher
              </Button>
            </div>
            {form.matchers.length === 0 ? (
              <p className='text-muted-foreground text-xs'>No matchers — this policy matches all alerts.</p>
            ) : (
              form.matchers.map((m, i) => (
                <MatcherRow
                  key={i}
                  index={i}
                  matcher={m}
                  onNameChange={handleMatcherNameChange}
                  onOperatorChange={handleMatcherOperatorChange}
                  onValueChange={handleMatcherValueChange}
                  onRemove={handleRemoveMatcher}
                />
              ))
            )}
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>Group by</Label>
              <Button type='button' variant='outline' size='sm' onClick={handleAddGroupBy}>
                <Plus className='mr-1 h-3 w-3' />
                Add Label
              </Button>
            </div>
            {form.groupBy.length === 0 ? (
              <p className='text-muted-foreground text-xs'>No grouping — alerts are grouped into a single notification.</p>
            ) : (
              form.groupBy.map((g, i) => <GroupByRow key={i} index={i} value={g} onChange={handleGroupByChange} onRemove={handleRemoveGroupBy} />)
            )}
          </div>

          <div className='space-y-3'>
            <Label>Mute timings</Label>
            {muteTimings.length === 0 ? (
              <p className='text-muted-foreground text-xs'>No mute timings available.</p>
            ) : (
              <div className='space-y-2'>
                {muteTimings.map(mt => (
                  <MuteTimingCheckbox key={mt.id} muteTiming={mt} checked={form.muteTimingIds.includes(mt.id)} onToggle={handleMuteTimingToggle} />
                ))}
              </div>
            )}
          </div>

          <div className='grid grid-cols-3 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='groupWait'>Group wait (seconds)</Label>
              <Input id='groupWait' type='number' min={0} max={86400} value={form.groupWaitS} onChange={handleGroupWaitChange} />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='groupInterval'>Group interval (seconds)</Label>
              <Input id='groupInterval' type='number' min={0} max={86400} value={form.groupIntervalS} onChange={handleGroupIntervalChange} />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='repeatInterval'>Repeat interval (seconds)</Label>
              <Input id='repeatInterval' type='number' min={0} max={604800} value={form.repeatIntervalS} onChange={handleRepeatIntervalChange} />
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <Checkbox
              id='continueMatching'
              checked={form.continueMatching}
              onCheckedChange={handleContinueMatchingChange}
              aria-label='Continue matching subsequent sibling policies'
            />
            <Label htmlFor='continueMatching' className='font-normal'>
              Continue matching subsequent sibling policies
            </Label>
          </div>
        </CardContent>
        <CardFooter className='flex gap-2'>
          <Button type='submit' disabled={submitting}>
            {submitting ? 'Saving...' : submitLabel}
          </Button>
          <Link to='/alerting/notifications/policies' className={buttonVariants({ variant: 'outline' })}>
            Cancel
          </Link>
        </CardFooter>
      </Card>
    </form>
  );
};

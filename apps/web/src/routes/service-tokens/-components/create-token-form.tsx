import type { CreateServiceToken } from '@graflare/shared/schemas/service-token';

import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useCallback, useId, useState } from 'react';

interface CreateTokenFormProps {
  onSubmit: (payload: CreateServiceToken) => void;
  submitting: boolean;
  /** Inline error from a failed create — keeps the user on the form to retry. */
  error?: string | null;
}

// Cloudflare stores token validity as a Go-duration string; its largest unit is hours, so
// every preset is expressed in hours (matches the backend's duration regex). The "default"
// option omits the field entirely, which lets Cloudflare apply its own default (one year /
// 8760h). Values above one year aren't offered because Cloudflare's accepted maximum isn't
// documented and an over-long value would be rejected.
const DEFAULT_DURATION = 'default';
const DURATION_OPTIONS = [
  { value: DEFAULT_DURATION, label: '1 year (default)' },
  { value: '720h', label: '30 days' },
  { value: '2160h', label: '90 days' },
  { value: '4320h', label: '180 days' },
] as const satisfies readonly { value: string; label: string }[];

export const CreateTokenForm = ({ onSubmit, submitting, error }: CreateTokenFormProps) => {
  const nameId = useId();
  const durationId = useId();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<string>(DEFAULT_DURATION);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setName(value);
  }, []);

  const handleDurationChange = useCallback((value: string | null) => {
    if (value !== null) setDuration(value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (trimmed.length === 0) return;
      const payload: CreateServiceToken = duration === DEFAULT_DURATION ? { name: trimmed } : { name: trimmed, duration };
      onSubmit(payload);
    },
    [name, duration, onSubmit],
  );

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor={nameId}>Name</Label>
        <Input id={nameId} value={name} onChange={handleNameChange} placeholder='ci-deploy-bot' maxLength={255} autoComplete='off' required />
        <p className='text-muted-foreground text-xs'>A label to recognise this token. The caller authenticates with the generated client ID and secret.</p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor={durationId}>Expiration</Label>
        <Select value={duration} onValueChange={handleDurationChange} items={DURATION_OPTIONS}>
          <SelectTrigger id={durationId} className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATION_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error !== null && error !== undefined && error !== '' && (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      )}

      <div className='flex justify-end gap-2'>
        <Button type='submit' disabled={!canSubmit}>
          {submitting ? 'Creating…' : 'Create token'}
        </Button>
      </div>
    </form>
  );
};

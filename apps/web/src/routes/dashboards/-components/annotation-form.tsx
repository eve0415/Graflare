import type { CreateAnnotation } from '@graflare/shared/schemas/annotation';

import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Textarea } from '@graflare/ui/components/textarea';
import { Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

// A `<input type="datetime-local">` value has no timezone, so the runtime reads it
// as local time. The DB stores `time` in a `timestamp_ms` column and the API builds
// the stored value with `new Date(input.time)`, so this MUST yield epoch MILLISECONDS.
// Returns `null` on an empty/invalid value so callers BLOCK submit rather than
// silently writing an annotation at epoch 0.
export const toEpochMs = (dt: string): number | null => {
  const ms = new Date(dt).getTime();
  return Number.isNaN(ms) ? null : ms;
};

// Split a comma-separated tag string into trimmed, non-empty tags.
export const parseTags = (raw: string): string[] =>
  raw
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

// Seed the datetime-local input with the current LOCAL time at minute precision.
// `toISOString()` is UTC (`Z`-suffixed) and won't populate the field — offset by the
// local zone first so the displayed value matches the user's wall clock.
export const nowDatetimeLocal = (): string => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

interface AnnotationFormProps {
  dashboardId: string;
  onSubmit: (payload: CreateAnnotation) => void;
  submitting: boolean;
}

export const AnnotationForm = ({ dashboardId, onSubmit, submitting }: AnnotationFormProps) => {
  const [time, setTime] = useState(nowDatetimeLocal);
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');

  const epochMs = toEpochMs(time);
  const canSubmit = !submitting && text.trim().length > 0 && epochMs !== null;

  const handleTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTime(e.target.value);
  }, []);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  }, []);

  const handleTagsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTags(e.target.value);
  }, []);

  const payload = useMemo<CreateAnnotation | null>(() => {
    if (epochMs === null || text.trim().length === 0) return null;
    return { dashboardId, time: epochMs, text: text.trim(), tags: parseTags(tags) };
  }, [dashboardId, epochMs, text, tags]);

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      if (payload === null || submitting) return;
      onSubmit(payload);
      // Reset the description + tags for the next entry; keep the time so back-to-back
      // annotations at the same instant don't require re-picking it.
      setText('');
      setTags('');
    },
    [payload, submitting, onSubmit],
  );

  return (
    <form onSubmit={handleSubmit} className='space-y-3'>
      <div className='space-y-2'>
        <Label htmlFor='annotation-time'>Time</Label>
        <Input id='annotation-time' type='datetime-local' value={time} onChange={handleTimeChange} required />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='annotation-text'>Description</Label>
        <Textarea id='annotation-text' aria-label='Description' rows={2} value={text} onChange={handleTextChange} placeholder='What happened?' />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='annotation-tags'>Tags (comma-separated)</Label>
        <Input id='annotation-tags' value={tags} onChange={handleTagsChange} placeholder='deploy, release' />
      </div>

      <div className='flex justify-end'>
        <Button type='submit' size='sm' disabled={!canSubmit}>
          <Plus className='mr-1 h-3.5 w-3.5' />
          {submitting ? 'Adding...' : 'Add annotation'}
        </Button>
      </div>
    </form>
  );
};

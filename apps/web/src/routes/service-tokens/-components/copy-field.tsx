import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

interface CopyFieldProps {
  label: string;
  value: string;
  /** Accessible name for the copy button, e.g. "Copy Client ID". */
  copyLabel: string;
  /** Render the value in a monospace font (ids/secrets). */
  mono?: boolean;
}

const COPIED_RESET_MS = 2000;

/**
 * A read-only field with a copy-to-clipboard affordance. The "Copied" confirmation is
 * announced to assistive tech via an `aria-live="polite"` region. Clipboard failures
 * (locked-down / insecure contexts where `navigator.clipboard` is unavailable) surface a
 * visible, announced fallback instead of throwing.
 */
export const CopyField = ({ label, value, copyLabel, mono = false }: CopyFieldProps) => {
  const inputId = useId();
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleReset = useCallback(() => {
    if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setStatus('idle');
    }, COPIED_RESET_MS);
  }, []);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.select();
  }, []);

  const handleCopy = useCallback(() => {
    const run = async () => {
      const { clipboard } = navigator;
      if (clipboard === undefined) {
        setStatus('error');
        scheduleReset();
        return;
      }
      try {
        await clipboard.writeText(value);
        setStatus('copied');
      } catch {
        setStatus('error');
      }
      scheduleReset();
    };
    void run();
  }, [value, scheduleReset]);

  const liveMessage =
    status === 'copied' ? `${label} copied to clipboard` : status === 'error' ? `Could not copy ${label}. Select the text and copy it manually.` : '';

  return (
    <div className='space-y-1.5'>
      <Label htmlFor={inputId}>{label}</Label>
      <div className='flex items-center gap-2'>
        <Input id={inputId} readOnly value={value} className={mono ? 'font-mono text-xs' : undefined} onFocus={handleFocus} />
        <Button type='button' variant='outline' size='icon-sm' onClick={handleCopy} aria-label={copyLabel}>
          {status === 'copied' ? <Check className='text-emerald-600 dark:text-emerald-400' /> : <Copy />}
        </Button>
      </div>
      {status === 'error' && <p className='text-destructive text-xs'>Copy isn’t available here — select the value above and copy it manually.</p>}
      <span aria-live='polite' className='sr-only'>
        {liveMessage}
      </span>
    </div>
  );
};

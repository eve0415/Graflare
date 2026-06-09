import { Button } from '@graflare/ui/components/button';
import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface InlineCopyButtonProps {
  value: string;
  /** Accessible name, e.g. "Copy client ID for ci-deploy-bot". */
  label: string;
}

const COPIED_RESET_MS = 2000;

/**
 * A compact icon-only copy button for inline use in table cells (e.g. the public client ID).
 * Announces success/failure to assistive tech via a polite live region and degrades gracefully
 * when the clipboard API is unavailable.
 */
export const InlineCopyButton = ({ value, label }: InlineCopyButtonProps) => {
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

  const liveMessage = status === 'copied' ? 'Copied to clipboard' : status === 'error' ? 'Copy failed' : '';

  return (
    <>
      <Button type='button' variant='ghost' size='icon-xs' onClick={handleCopy} aria-label={label}>
        {status === 'copied' ? <Check className='text-emerald-600 dark:text-emerald-400' /> : <Copy />}
      </Button>
      <span aria-live='polite' className='sr-only'>
        {liveMessage}
      </span>
    </>
  );
};

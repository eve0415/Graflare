import type { ServiceTokenCreateResult } from '@graflare/shared/schemas/service-token';

import { Alert, AlertDescription, AlertTitle } from '@graflare/ui/components/alert';
import { Button } from '@graflare/ui/components/button';
import { TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { CopyField } from './copy-field';

interface RevealSecretPanelProps {
  /**
   * The one-time create result. The `clientSecret` lives ONLY in the caller's local state
   * and is passed in here for this single render — it is never cached, stored, or logged.
   */
  result: ServiceTokenCreateResult;
  /** Called when the user confirms they have saved the credentials. The caller must then
   * drop the secret from state so it leaves the DOM and the accessibility tree. */
  onDone: () => void;
}

/**
 * The reveal-once secret moment: the only time the `client_secret` is ever shown. The user
 * must tick the acknowledgement checkbox (a fail-safe gate that works even when the clipboard
 * API is blocked) before "Done" is enabled. On mount, focus moves to the warning so screen
 * readers land on the "you won't see this again" message; the `Alert` has `role="alert"` so it
 * is also announced. The parent unmounts this panel on dismissal, removing the secret entirely.
 */
export const RevealSecretPanel = ({ result, onDone }: RevealSecretPanelProps) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const warningRef = useRef<HTMLDivElement>(null);
  const checkboxId = useId();

  useEffect(() => {
    warningRef.current?.focus();
  }, []);

  const handleAckChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAcknowledged(e.currentTarget.checked);
  }, []);

  return (
    <div className='space-y-4'>
      {/* Focus lands here on mount so screen readers start at the warning; the Alert's
          role="alert" additionally announces it. tabIndex=-1 makes the wrapper focusable
          without adding it to the tab order. */}
      <div ref={warningRef} tabIndex={-1} className='outline-none'>
        <Alert className='border-amber-500/40 bg-amber-50 dark:bg-amber-950/30'>
          <TriangleAlert className='text-amber-600 dark:text-amber-400' />
          <AlertTitle className='text-amber-900 dark:text-amber-200'>Copy your secret now — you won’t see it again</AlertTitle>
          <AlertDescription className='text-amber-800/90 dark:text-amber-200/80'>
            For security, Cloudflare shows the client secret only once. If you lose it, you’ll need to revoke this token and create a new one.
          </AlertDescription>
        </Alert>
      </div>

      <div className='space-y-3'>
        <CopyField label='Client ID' value={result.clientId} copyLabel='Copy Client ID' mono />
        <CopyField label='Client Secret' value={result.clientSecret} copyLabel='Copy Client Secret' mono />
      </div>

      <label htmlFor={checkboxId} className='flex cursor-pointer items-start gap-2.5 text-sm'>
        <input
          id={checkboxId}
          type='checkbox'
          checked={acknowledged}
          onChange={handleAckChange}
          aria-label='I’ve saved the client secret somewhere safe'
          className='border-input text-primary focus-visible:ring-ring/30 mt-0.5 size-4 rounded-sm border focus-visible:ring-3 focus-visible:outline-none'
        />
        <span className='text-muted-foreground'>I’ve saved the client secret somewhere safe.</span>
      </label>

      <Button type='button' className='w-full' disabled={!acknowledged} onClick={onDone}>
        Done
      </Button>
    </div>
  );
};

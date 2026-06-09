import type { CreateServiceToken, ServiceTokenCreateResult } from '@graflare/shared/schemas/service-token';
import type { ComponentProps } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@graflare/ui/components/dialog';
import { useCallback, useState } from 'react';

import { createServiceToken } from '../-api';

import { CreateTokenForm } from './create-token-form';
import { RevealSecretPanel } from './reveal-secret-panel';

// The dialog's close-event details, derived from the `@graflare/ui` Dialog wrapper so we don't
// reach across into `@base-ui/react` (not a direct dependency of this app). `reason` tells us
// HOW the dialog is being closed; `cancel()` vetoes that close.
type DialogChangeDetails = Parameters<NonNullable<ComponentProps<typeof Dialog>['onOpenChange']>>[1];
type DialogCloseReason = DialogChangeDetails['reason'];

interface CreateTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Refresh the token list after a successful create. */
  onCreated: () => Promise<void> | void;
}

type View = 'form' | 'secret';

// Close reasons that would dismiss the dialog WITHOUT the user explicitly confirming. While
// the secret is on screen these are cancelled, because dismissing loses the secret forever.
const ACCIDENTAL_DISMISS_REASONS: ReadonlySet<DialogCloseReason> = new Set(['escape-key', 'outside-press', 'focus-out']);

/**
 * Drives the create flow as a two-step state machine inside one dialog: `form` → `secret`.
 *
 * Security model:
 * - The create result (with the one-time `clientSecret`) lives ONLY in this component's local
 *   state, never in the query cache, a store, the URL, or logs.
 * - In the `secret` view the dialog cannot be dismissed by Escape / outside-click / focus-out;
 *   the only exit is the explicit "Done" button after the user acknowledges saving the secret.
 * - On close, both `secret` and `view` are reset, and Base UI unmounts the popup — so the
 *   secret leaves the DOM and the accessibility tree entirely.
 */
export const CreateTokenDialog = ({ open, onOpenChange, onCreated }: CreateTokenDialogProps) => {
  const [view, setView] = useState<View>('form');
  const [result, setResult] = useState<ServiceTokenCreateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setView('form');
    setResult(null);
    setSubmitting(false);
    setError(null);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean, details: DialogChangeDetails) => {
      // Block accidental dismissal only while the secret is visible — losing it is irreversible.
      if (!nextOpen && view === 'secret' && ACCIDENTAL_DISMISS_REASONS.has(details.reason)) {
        details.cancel();
        return;
      }
      if (!nextOpen) reset();
      onOpenChange(nextOpen);
    },
    [view, reset, onOpenChange],
  );

  const handleSubmit = useCallback(
    (payload: CreateServiceToken) => {
      const run = async () => {
        setSubmitting(true);
        setError(null);
        try {
          const created = await createServiceToken({ data: payload });
          setResult(created);
          setView('secret');
          // List metadata carries no secret, so refreshing it is safe and expected.
          await onCreated();
        } catch {
          setError('Could not create the token. Check the name and try again.');
        } finally {
          setSubmitting(false);
        }
      };
      void run();
    },
    [onCreated],
  );

  // "Done": close programmatically (bypasses onOpenChange's dismissal guard) and reset state.
  const handleDone = useCallback(() => {
    reset();
    onOpenChange(false);
  }, [reset, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={view === 'form'} className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{view === 'form' ? 'New service token' : 'Service token created'}</DialogTitle>
          <DialogDescription>
            {view === 'form'
              ? 'Create a machine-to-machine credential. Cloudflare issues a client ID and secret for automated callers.'
              : 'Copy the client secret now — it is shown only once and cannot be retrieved later.'}
          </DialogDescription>
        </DialogHeader>

        {view === 'form' || result === null ? (
          <CreateTokenForm onSubmit={handleSubmit} submitting={submitting} error={error} />
        ) : (
          <RevealSecretPanel result={result} onDone={handleDone} />
        )}
      </DialogContent>
    </Dialog>
  );
};

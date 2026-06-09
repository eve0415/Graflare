import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@graflare/ui/components/alert-dialog';
import { useCallback } from 'react';

export interface RevokeTarget {
  id: string;
  name: string;
}

interface RevokeTokenDialogProps {
  /** The token to revoke, or `null` when the dialog is closed. */
  target: RevokeTarget | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: string) => void;
  revoking: boolean;
}

/**
 * Confirm dialog for revoking a service token. Revoking deletes the credential at Cloudflare,
 * so any caller using it stops authenticating immediately. As an alert dialog it forces an
 * explicit Cancel/Revoke choice — an outside click won't dismiss it (Esc still cancels), so a
 * stray click can't silently trigger or skip a destructive action.
 */
export const RevokeTokenDialog = ({ target, onOpenChange, onConfirm, revoking }: RevokeTokenDialogProps) => {
  const handleConfirm = useCallback(() => {
    if (target !== null) onConfirm(target.id);
  }, [target, onConfirm]);

  return (
    <AlertDialog open={target !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent className='sm:max-w-md'>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke service token</AlertDialogTitle>
          <AlertDialogDescription>
            {target === null
              ? null
              : `Revoke “${target.name}”? Any automated caller using this token will immediately stop working. This cannot be undone — you’d need to create a new token.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant='destructive' onClick={handleConfirm} disabled={revoking}>
            {revoking ? 'Revoking…' : 'Revoke token'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

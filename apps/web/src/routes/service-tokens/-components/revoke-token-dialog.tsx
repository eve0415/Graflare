import { Button } from '@graflare/ui/components/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@graflare/ui/components/dialog';
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
 * so any caller using it stops authenticating immediately. Unlike the reveal panel this dialog
 * is freely dismissable — cancelling is the safe default for a destructive action.
 */
export const RevokeTokenDialog = ({ target, onOpenChange, onConfirm, revoking }: RevokeTokenDialogProps) => {
  const handleConfirm = useCallback(() => {
    if (target !== null) onConfirm(target.id);
  }, [target, onConfirm]);

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Revoke service token</DialogTitle>
          <DialogDescription>
            {target === null
              ? null
              : `Revoke “${target.name}”? Any automated caller using this token will immediately stop working. This cannot be undone — you’d need to create a new token.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant='outline' />}>Cancel</DialogClose>
          <Button variant='destructive' onClick={handleConfirm} disabled={revoking}>
            {revoking ? 'Revoking…' : 'Revoke token'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

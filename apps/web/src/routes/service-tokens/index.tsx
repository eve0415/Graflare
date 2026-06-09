import type { RevokeTarget } from './-components/revoke-token-dialog';

import { Button } from '@graflare/ui/components/button';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { KeyRound, Plus } from 'lucide-react';
import { useCallback, useState } from 'react';

import { revokeServiceToken } from './-api';
import { CreateTokenDialog } from './-components/create-token-dialog';
import { RevokeTokenDialog } from './-components/revoke-token-dialog';
import { ServiceTokenList } from './-components/service-token-list';
import { ServiceTokenListSkeleton } from './-components/service-token-list-skeleton';
import { serviceTokensQueryOptions } from './-queries';

const ServiceTokensPage = () => {
  const { data: tokens } = useSuspenseQuery(serviceTokensQueryOptions());
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const invalidate = useCallback(() => router.invalidate(), [router]);

  const handleOpenCreate = useCallback(() => {
    setCreateOpen(true);
  }, []);

  const handleRevokeOpenChange = useCallback((open: boolean) => {
    if (!open) setRevokeTarget(null);
  }, []);

  const handleConfirmRevoke = useCallback(
    (id: string) => {
      const run = async () => {
        setRevokingId(id);
        try {
          await revokeServiceToken({ data: { id } });
          await invalidate();
          setRevokeTarget(null);
        } finally {
          setRevokingId(null);
        }
      };
      void run();
    },
    [invalidate],
  );

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div className='space-y-1'>
          <h1 className='text-xl font-semibold'>Service Tokens</h1>
          <p className='text-muted-foreground text-sm'>Machine-to-machine credentials for automated callers, issued through Cloudflare Access.</p>
        </div>
        <Button size='sm' onClick={handleOpenCreate}>
          <Plus />
          New token
        </Button>
      </div>

      {tokens.length === 0 ? (
        <div className='flex flex-col items-center gap-3 rounded-2xl border border-dashed py-12 text-center'>
          <KeyRound className='text-muted-foreground size-6' />
          <div className='space-y-1'>
            <p className='text-sm font-medium'>No service tokens yet</p>
            <p className='text-muted-foreground text-sm'>Create one to let an automated service authenticate to Graflare.</p>
          </div>
          <Button size='sm' variant='outline' onClick={handleOpenCreate}>
            <Plus />
            New token
          </Button>
        </div>
      ) : (
        <ServiceTokenList tokens={tokens} revokingId={revokingId} onRevoke={setRevokeTarget} />
      )}

      <CreateTokenDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={invalidate} />
      <RevokeTokenDialog target={revokeTarget} onOpenChange={handleRevokeOpenChange} onConfirm={handleConfirmRevoke} revoking={revokingId !== null} />
    </div>
  );
};

export const Route = createFileRoute('/service-tokens/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceTokensQueryOptions()),
  pendingComponent: ServiceTokenListSkeleton,
  component: ServiceTokensPage,
});

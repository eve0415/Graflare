import type { RevokeTarget } from './revoke-token-dialog';
import type { ServiceTokenMetadata } from '@graflare/shared/schemas/service-token';

import { Badge } from '@graflare/ui/components/badge';
import { Button } from '@graflare/ui/components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@graflare/ui/components/table';
import { Trash2 } from 'lucide-react';
import { useCallback } from 'react';

import { InlineCopyButton } from './inline-copy-button';

interface ServiceTokenListProps {
  tokens: readonly ServiceTokenMetadata[];
  revokingId: string | null;
  onRevoke: (target: RevokeTarget) => void;
}

// The client ID is public; show a readable prefix in the table (the full value is copyable).
const CLIENT_ID_PREFIX_LEN = 16;
const clientIdPrefix = (clientId: string): string => (clientId.length > CLIENT_ID_PREFIX_LEN ? `${clientId.slice(0, CLIENT_ID_PREFIX_LEN)}…` : clientId);

const formatDate = (epochMs: number): string => new Date(epochMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const TokenRow = ({ token, revoking, onRevoke }: { token: ServiceTokenMetadata; revoking: boolean; onRevoke: (target: RevokeTarget) => void }) => {
  const handleRevoke = useCallback(() => {
    onRevoke({ id: token.id, name: token.name });
  }, [onRevoke, token.id, token.name]);

  return (
    <TableRow>
      <TableCell className='font-medium'>{token.name}</TableCell>
      <TableCell>
        <span className='flex items-center gap-1'>
          <code className='text-muted-foreground font-mono text-xs'>{clientIdPrefix(token.clientId)}</code>
          <InlineCopyButton value={token.clientId} label={`Copy client ID for ${token.name}`} />
        </span>
      </TableCell>
      <TableCell className='text-muted-foreground text-xs'>{formatDate(token.createdAt)}</TableCell>
      <TableCell className='text-xs'>
        {token.expiresAt === null ? <Badge variant='secondary'>Never</Badge> : <span className='text-muted-foreground'>{formatDate(token.expiresAt)}</span>}
      </TableCell>
      <TableCell>
        <Button variant='ghost' size='xs' onClick={handleRevoke} disabled={revoking} aria-label={`Revoke ${token.name}`}>
          <Trash2 className='size-3' />
          Revoke
        </Button>
      </TableCell>
    </TableRow>
  );
};

export const ServiceTokenList = ({ tokens, revokingId, onRevoke }: ServiceTokenListProps) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Client ID</TableHead>
        <TableHead>Created</TableHead>
        <TableHead>Expires</TableHead>
        <TableHead className='w-[120px]'>Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {tokens.map(token => (
        <TokenRow key={token.id} token={token} revoking={revokingId === token.id} onRevoke={onRevoke} />
      ))}
    </TableBody>
  </Table>
);

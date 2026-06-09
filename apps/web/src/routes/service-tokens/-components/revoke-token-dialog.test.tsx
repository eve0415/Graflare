import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RevokeTokenDialog } from './revoke-token-dialog';

afterEach(cleanup);

const TARGET = { id: 'id-1', name: 'ci-deploy-bot' };
const noopOpenChange = (): void => {};

describe('revoke-token-dialog', () => {
  it('names the token being revoked', () => {
    render(<RevokeTokenDialog target={TARGET} onOpenChange={noopOpenChange} onConfirm={vi.fn<(id: string) => void>()} revoking={false} />);
    expect(screen.getByText(/ci-deploy-bot/)).toBeDefined();
  });

  it('calls onConfirm with the token id when the destructive action is taken', () => {
    const onConfirm = vi.fn<(id: string) => void>();
    render(<RevokeTokenDialog target={TARGET} onOpenChange={noopOpenChange} onConfirm={onConfirm} revoking={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke token' }));
    expect(onConfirm).toHaveBeenCalledWith('id-1');
  });

  it('disables the confirm button while a revoke is in flight', () => {
    render(<RevokeTokenDialog target={TARGET} onOpenChange={noopOpenChange} onConfirm={vi.fn<(id: string) => void>()} revoking />);
    expect(screen.getByRole('button', { name: 'Revoking…' })).toHaveProperty('disabled', true);
  });

  it('renders nothing actionable when there is no target', () => {
    render(<RevokeTokenDialog target={null} onOpenChange={noopOpenChange} onConfirm={vi.fn<(id: string) => void>()} revoking={false} />);
    expect(screen.queryByRole('button', { name: 'Revoke token' })).toBeNull();
  });
});

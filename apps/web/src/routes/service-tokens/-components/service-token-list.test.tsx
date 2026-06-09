import type { RevokeTarget } from './revoke-token-dialog';
import type { ServiceTokenMetadata } from '@graflare/shared/schemas/service-token';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceTokenList } from './service-token-list';

afterEach(cleanup);

const TOKENS: ServiceTokenMetadata[] = [
  { id: 'id-1', clientId: 'aaaaaaaaaaaaaaaa1111.access', name: 'ci-deploy-bot', createdAt: Date.UTC(2024, 0, 2), expiresAt: Date.UTC(2025, 0, 2) },
  { id: 'id-2', clientId: 'bbbbbbbbbbbbbbbb2222.access', name: 'never-expires', createdAt: Date.UTC(2024, 5, 1), expiresAt: null },
];

const noopRevoke = (): void => {};

describe('service-token-list', () => {
  it('renders a row per token with its name', () => {
    render(<ServiceTokenList tokens={TOKENS} revokingId={null} onRevoke={noopRevoke} />);
    expect(screen.getByText('ci-deploy-bot')).toBeDefined();
    expect(screen.getByText('never-expires')).toBeDefined();
  });

  it('shows "Never" for a token without an expiry', () => {
    render(<ServiceTokenList tokens={TOKENS} revokingId={null} onRevoke={noopRevoke} />);
    expect(screen.getByText('Never')).toBeDefined();
  });

  it('exposes the public client ID via an accessible copy button', () => {
    render(<ServiceTokenList tokens={TOKENS} revokingId={null} onRevoke={noopRevoke} />);
    expect(screen.getByRole('button', { name: 'Copy client ID for ci-deploy-bot' })).toBeDefined();
  });

  it('calls onRevoke with the token id and name when Revoke is clicked', () => {
    const onRevoke = vi.fn<(target: RevokeTarget) => void>();
    render(<ServiceTokenList tokens={TOKENS} revokingId={null} onRevoke={onRevoke} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke ci-deploy-bot' }));
    expect(onRevoke).toHaveBeenCalledWith({ id: 'id-1', name: 'ci-deploy-bot' });
  });

  it('disables the revoke button for the token currently being revoked', () => {
    render(<ServiceTokenList tokens={TOKENS} revokingId='id-1' onRevoke={noopRevoke} />);
    expect(screen.getByRole('button', { name: 'Revoke ci-deploy-bot' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Revoke never-expires' })).toHaveProperty('disabled', false);
  });
});

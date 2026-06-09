import type { ServiceTokenCreateResult } from '@graflare/shared/schemas/service-token';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RevealSecretPanel } from './reveal-secret-panel';

afterEach(cleanup);

const RESULT: ServiceTokenCreateResult = {
  id: '11111111-2222-4333-8444-555555555555',
  clientId: 'client-id-abc.access',
  name: 'ci-deploy-bot',
  createdAt: 0,
  expiresAt: null,
  clientSecret: 'super-secret-value-xyz',
};

const noopDone = (): void => {};

describe('reveal-secret-panel', () => {
  it('shows the one-time client secret while mounted', () => {
    render(<RevealSecretPanel result={RESULT} onDone={noopDone} />);
    expect(screen.getByDisplayValue('super-secret-value-xyz')).toBeDefined();
    expect(screen.getByDisplayValue('client-id-abc.access')).toBeDefined();
  });

  it('warns, via an alert, that the secret will not be shown again', () => {
    render(<RevealSecretPanel result={RESULT} onDone={noopDone} />);
    expect(screen.getByRole('alert').textContent).toContain('won’t see it again');
  });

  it('keeps "Done" disabled until the user acknowledges saving the secret', () => {
    const onDone = vi.fn<() => void>();
    render(<RevealSecretPanel result={RESULT} onDone={onDone} />);
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('checkbox'));
    expect(done).toHaveProperty('disabled', false);

    fireEvent.click(done);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the warning on mount so screen readers start there', async () => {
    render(<RevealSecretPanel result={RESULT} onDone={noopDone} />);
    await waitFor(() => {
      expect(document.activeElement?.textContent).toContain('won’t see it again');
    });
  });

  it('copies the secret to the clipboard via its labelled copy button', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      render(<RevealSecretPanel result={RESULT} onDone={noopDone} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy Client Secret' }));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('super-secret-value-xyz');
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

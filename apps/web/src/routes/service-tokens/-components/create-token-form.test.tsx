import type { CreateServiceToken } from '@graflare/shared/schemas/service-token';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreateTokenForm } from './create-token-form';

afterEach(cleanup);

const submitWith = async (edit: () => void): Promise<CreateServiceToken> => {
  const onSubmit = vi.fn<(payload: CreateServiceToken) => void>();
  render(<CreateTokenForm onSubmit={onSubmit} submitting={false} />);
  edit();
  fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  const [arg] = onSubmit.mock.calls[0] ?? [];
  if (arg === undefined) throw new Error('onSubmit not called');
  return arg;
};

const noopSubmit = (): void => {};

describe('create-token-form', () => {
  it('emits a trimmed name and omits duration when the default expiry is kept', async () => {
    const payload = await submitWith(() => {
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ci-deploy-bot  ' } });
    });
    expect(payload).toEqual({ name: 'ci-deploy-bot' });
    expect('duration' in payload).toBe(false);
  });

  it('disables submit while the name is empty', () => {
    render(<CreateTokenForm onSubmit={noopSubmit} submitting={false} />);
    expect(screen.getByRole('button', { name: 'Create token' })).toHaveProperty('disabled', true);
  });

  it('does not submit a blank (whitespace-only) name', () => {
    const onSubmit = vi.fn<(payload: CreateServiceToken) => void>();
    render(<CreateTokenForm onSubmit={onSubmit} submitting={false} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('relabels and disables the button while a create is in flight', () => {
    render(<CreateTokenForm onSubmit={noopSubmit} submitting />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Creating…' })).toHaveProperty('disabled', true);
  });

  it('surfaces a create failure as an inline alert', () => {
    render(<CreateTokenForm onSubmit={noopSubmit} submitting={false} error='Could not create the token. Check the name and try again.' />);
    expect(screen.getByRole('alert').textContent).toContain('Could not create the token');
  });
});

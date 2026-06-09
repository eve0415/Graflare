import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreateTokenDialog } from './create-token-dialog';

// `createServiceToken` is mocked wholesale in tests/setup.ts and resolves with a fixed result
// whose secret is `test-client-secret`.
const SECRET = 'test-client-secret';

const noopCreated = (): Promise<void> => Promise.resolve();
const noopOpenChange = (): void => {};

afterEach(cleanup);

const fillNameAndCreate = () => {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'ci-deploy-bot' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
};

// Mirrors the real page: the dialog is controlled, and the parent closes it on "Done", which
// unmounts the popup so the secret leaves the DOM.
const Harness = () => {
  const [open, setOpen] = useState(true);
  return <CreateTokenDialog open={open} onOpenChange={setOpen} onCreated={noopCreated} />;
};

describe('create-token-dialog', () => {
  it('surfaces the one-time secret after a successful create', async () => {
    const onCreated = vi.fn<() => Promise<void>>(noopCreated);
    render(<CreateTokenDialog open onOpenChange={noopOpenChange} onCreated={onCreated} />);

    fillNameAndCreate();

    await waitFor(() => {
      expect(screen.getByDisplayValue(SECRET)).toBeDefined();
    });
    // The list is refreshed (list metadata carries no secret, so this is safe).
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('removes the secret from the DOM entirely once the user confirms "Done"', async () => {
    render(<Harness />);
    fillNameAndCreate();
    await waitFor(() => {
      expect(screen.getByDisplayValue(SECRET)).toBeDefined();
    });

    // Acknowledge and finish — this drives the dialog closed and unmounts it.
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      // The real proof: the secret-bearing input is gone (its value is not a text node,
      // so a textContent check alone would pass even if it survived).
      expect(screen.queryByDisplayValue(SECRET)).toBeNull();
    });
    // Belt-and-suspenders: also catch the secret leaking into any plain text node.
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it('does not dismiss on Escape while the secret is visible (losing it is irreversible)', async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(<CreateTokenDialog open onOpenChange={onOpenChange} onCreated={noopCreated} />);
    fillNameAndCreate();
    await waitFor(() => {
      expect(screen.getByDisplayValue(SECRET)).toBeDefined();
    });

    fireEvent.keyDown(document.body, { key: 'Escape' });
    // The guard cancels the close, so the parent is never asked to close and the secret stays.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByDisplayValue(SECRET)).toBeDefined();
  });

  it('hides the dismiss "X" while the secret is visible', async () => {
    render(<CreateTokenDialog open onOpenChange={noopOpenChange} onCreated={noopCreated} />);
    // The form view shows the close button.
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined();

    fillNameAndCreate();
    await waitFor(() => {
      expect(screen.getByDisplayValue(SECRET)).toBeDefined();
    });
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});

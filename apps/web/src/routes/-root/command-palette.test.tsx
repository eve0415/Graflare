import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandPalette } from './command-palette';

// The search field is queried by its accessible name; narrow to HTMLInputElement once,
// here, so the tests stay free of inline type guards.
const getSearchInput = (): HTMLInputElement => {
  const input = screen.getByLabelText('Search commands');
  if (!(input instanceof HTMLInputElement)) throw new Error('search input is not an <input>');
  return input;
};

// Stub useNavigate with a spy so command `run` side effects are observable, and Link
// so any nested router primitives don't need a RouterProvider.
const navigateSpy = vi.fn<(options: unknown) => void>();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

// Seed two dashboards so the Dashboards group exercises search.
vi.mock('../dashboards/-queries', () => ({
  dashboardsQueryOptions: () => ({
    queryKey: ['dashboards'],
    queryFn: () =>
      Promise.resolve([
        { id: 'id-cpu', title: 'CPU Overview' },
        { id: 'id-mem', title: 'Memory Usage' },
      ]),
  }),
}));

afterEach(() => {
  cleanup();
  navigateSpy.mockClear();
});

// Simulate real typing: set the controlled value through the native setter, then dispatch
// an InputEvent carrying `inputType` so Base UI's autoHighlight (which only engages on a
// genuine typed input, not a synthetic `change`) kicks in. `fireEvent.change` omits
// `inputType`, so it cannot exercise the type-then-Enter path on its own.
const typeInto = (input: HTMLInputElement, value: string) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
};

const Harness = ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => {
  const [open, setOpen] = useState(true);
  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      setOpen(next);
    },
    [onOpenChange],
  );
  return <CommandPalette open={open} onOpenChange={handleOpenChange} />;
};

// Renders the palette starting open, exposing the latest open state for assertions.
const renderOpen = () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  render(<Harness onOpenChange={onOpenChange} />, { wrapper });
  return { onOpenChange };
};

describe('command palette', () => {
  it('renders a labelled search combobox and grouped pages/actions when open', () => {
    renderOpen();
    const input = screen.getByLabelText('Search commands');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(screen.getByText('Pages')).toBeDefined();
    expect(screen.getByText('Actions')).toBeDefined();
    // Page + action entries are present.
    expect(screen.getByText('Explore')).toBeDefined();
    expect(screen.getByText('New dashboard')).toBeDefined();
  });

  it('moves focus into the search input on open', async () => {
    renderOpen();
    const input = screen.getByLabelText('Search commands');
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });

  it('loads and shows dashboards in their own group', async () => {
    renderOpen();
    await waitFor(() => {
      expect(screen.getByText('CPU Overview')).toBeDefined();
    });
    expect(screen.getByText('Memory Usage')).toBeDefined();
  });

  it('filters the list as the user types', async () => {
    renderOpen();
    const input = screen.getByLabelText('Search commands');
    await waitFor(() => {
      expect(screen.getByText('CPU Overview')).toBeDefined();
    });
    fireEvent.change(input, { target: { value: 'explore' } });
    await waitFor(() => {
      expect(screen.queryByText('CPU Overview')).toBeNull();
    });
    expect(screen.getByText('Explore')).toBeDefined();
  });

  it('runs the top match on Enter after typing, without arrowing (autoHighlight)', async () => {
    renderOpen();
    const input = getSearchInput();
    typeInto(input, 'explore');
    await waitFor(() => {
      expect(screen.getByText('Explore')).toBeDefined();
    });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith({ to: '/explore' });
    });
  });

  it('closes the palette when a command is selected', async () => {
    const { onOpenChange } = renderOpen();
    const input = screen.getByLabelText('Search commands');
    fireEvent.change(input, { target: { value: 'explore' } });
    await waitFor(() => {
      expect(screen.getByText('Explore')).toBeDefined();
    });
    fireEvent.click(screen.getByText('Explore'));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('shows an empty state when nothing matches', async () => {
    renderOpen();
    const input = screen.getByLabelText('Search commands');
    fireEvent.change(input, { target: { value: 'zzzzzzz' } });
    await waitFor(() => {
      expect(screen.getByText(/No results/)).toBeDefined();
    });
  });

  it('closes on Escape', async () => {
    // The Autocomplete consumes Escape rather than bubbling it to the Dialog, so the
    // palette relies on forwarding the Autocomplete's onOpenChange to close.
    const { onOpenChange } = renderOpen();
    const input = getSearchInput();
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('resets the query when toggled closed with the keyboard shortcut, so it reopens clean', async () => {
    // Exercises the window keydown listener (the only test that does) and the toggle-close
    // path: closing via Cmd-K must clear the query like every other close path.
    renderOpen();
    const input = getSearchInput();
    fireEvent.change(input, { target: { value: 'explore' } });
    await waitFor(() => {
      // "Alerting" is filtered out by the "explore" query.
      expect(screen.queryByText('Alerting')).toBeNull();
    });
    // Cmd-K closes (the listener is registered on globalThis; fireEvent wraps in act)...
    fireEvent.keyDown(globalThis.window, { key: 'k', metaKey: true });
    // ...and Cmd-K reopens. The Harness mirrors open state, so this round-trips.
    fireEvent.keyDown(globalThis.window, { key: 'k', metaKey: true });
    await waitFor(() => {
      expect(getSearchInput().value).toBe('');
    });
    // The full list is back (the previously-filtered "Alerting" page returns), proving the filter cleared.
    expect(screen.getByText('Alerting')).toBeDefined();
  });
});

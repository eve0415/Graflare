import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { expectNoA11yViolations } from '../../../tests/a11y';

import { CommandPalette } from './command-palette';
import { isMacPlatform } from './platform';
import { resetRecentDashboardsCacheForTests } from './recent-dashboards-store';
import { ThemeProvider, useTheme } from './theme-provider';

const RECENTS_STORAGE_KEY = 'graflare.recentDashboards';

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
  localStorage.clear();
  resetRecentDashboardsCacheForTests();
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

// TanStack Hotkeys binds `Mod+K` on `document` and matches modifiers exactly; `Mod` is ⌘ on
// macOS and Ctrl elsewhere. Fire the platform-correct combo on document to drive the real
// binding. Computed once at module scope so the test body stays conditional-free.
const IS_MAC = isMacPlatform();
const fireModK = () => fireEvent.keyDown(document, { key: 'k', ctrlKey: !IS_MAC, metaKey: IS_MAC });

// Surfaces the active resolved theme so a test can assert the toggle flipped it.
const ThemeProbe = () => {
  const { resolved } = useTheme();
  return <span data-testid='resolved-theme'>{resolved}</span>;
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
  return (
    <ThemeProvider>
      <ThemeProbe />
      <CommandPalette open={open} onOpenChange={handleOpenChange} />
    </ThemeProvider>
  );
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

  it('resets the query when toggled closed with the keyboard shortcut (Mod+K), so it reopens clean', async () => {
    // The toggle-close path: closing via Mod+K must clear the query like every other close
    // path (fireModK drives the real document-bound binding — see the module-scope helper).
    renderOpen();
    const input = getSearchInput();
    fireEvent.change(input, { target: { value: 'explore' } });
    await waitFor(() => {
      // "Alerting" is filtered out by the "explore" query.
      expect(screen.queryByText('Alerting')).toBeNull();
    });
    // Mod+K closes...
    fireModK();
    // ...and Mod+K reopens. The Harness mirrors open state, so this round-trips.
    fireModK();
    await waitFor(() => {
      expect(getSearchInput().value).toBe('');
    });
    // The full list is back (the previously-filtered "Alerting" page returns), proving the filter cleared.
    expect(screen.getByText('Alerting')).toBeDefined();
  });

  it('flips the resolved theme when the Toggle theme command runs', async () => {
    renderOpen();
    const before = screen.getByTestId('resolved-theme').textContent;
    fireEvent.click(screen.getByText('Toggle theme'));
    await waitFor(() => {
      expect(screen.getByTestId('resolved-theme').textContent).not.toBe(before);
    });
    // The toggle moves between the two explicit themes off `resolved`.
    const after = screen.getByTestId('resolved-theme').textContent;
    expect([before, after].sort()).toEqual(['dark', 'light']);
  });

  it('renders a Recent group with persisted recents at rest', async () => {
    // Seed a recent that is NOT one of the mocked dashboards, so its label is unique to the
    // Recent group. Reset the live snapshot cache so the store reads the seed.
    localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify([{ id: 'id-disk', title: 'Disk IO' }]));
    resetRecentDashboardsCacheForTests();
    renderOpen();
    await waitFor(() => {
      expect(screen.getByText('Recent')).toBeDefined();
    });
    const recent = screen.getByText('Disk IO');
    expect(recent).toBeDefined();
    // The recent entry navigates to its dashboard route when chosen.
    fireEvent.click(recent);
    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith({ to: '/dashboards/$id', params: { id: 'id-disk' } });
    });
  });

  // The palette is a Dialog portal: its content mounts on document.body, so the axe scan and the
  // listbox/status queries target the whole document, not the render container.
  it('has no axe violations with results showing (status node not inside the listbox)', async () => {
    renderOpen();
    await waitFor(() => {
      expect(screen.getByText('CPU Overview')).toBeDefined();
    });
    // Regression for aria-required-children: Base UI's Empty/Status render role=status and stay
    // mounted with results, so nesting them in CommandList (role=listbox) put a status inside the
    // listbox. They are now siblings of the list — assert no status descends from the listbox.
    const listbox = screen.getByRole('listbox');
    expect(listbox.querySelector('[role="status"]')).toBeNull();
    await expectNoA11yViolations(document.body);
  });

  it('has no axe violations in the empty state (no results)', async () => {
    renderOpen();
    const input = screen.getByLabelText('Search commands');
    fireEvent.change(input, { target: { value: 'zzzzzzz' } });
    await waitFor(() => {
      expect(screen.getByText(/No results/)).toBeDefined();
    });
    // An empty listbox (all groups filtered out) must stay valid — aria-required-children flags
    // wrong children, not their absence — and the Empty status sits outside it.
    expect(screen.getByRole('listbox').querySelector('[role="status"]')).toBeNull();
    await expectNoA11yViolations(document.body);
  });
});

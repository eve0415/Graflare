import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isMacPlatform } from './platform';
import { ShortcutsHelp } from './shortcuts-help';

afterEach(() => {
  cleanup();
});

// `?` is physically Shift+/. TanStack Hotkeys matches the binding (`{ key: '/', shift: true }`)
// against the real event via its `code: 'Slash'` (the `key` is the special char `?`), so the
// synthetic event must carry both `shiftKey` and `code` — a bare `{ key: '?' }` would not match.
// Fired on `document`, where the manager binds. Computed at module scope so test bodies stay
// free of conditionals (mirrors the command-palette test's `IS_MAC`/`fireModK`).
const fireHelpKey = (target: Document | HTMLElement = document) => fireEvent.keyDown(target, { key: '?', shiftKey: true, code: 'Slash' });

// `Mod` resolves to ⌘ on macOS and Ctrl elsewhere; the keycap must show the platform glyph,
// and the combo's screen-reader label must use the spoken modifier name. Resolved once at
// module scope so test bodies stay free of conditionals.
const EXPECTED_MOD_GLYPH = isMacPlatform() ? '⌘' : 'Ctrl';
const EXPECTED_PALETTE_COMBO_LABEL = isMacPlatform() ? 'Command then K' : 'Control then K';

const keycapText = (): readonly (string | null)[] => Array.from(document.querySelectorAll('kbd')).map(cap => cap.textContent);

const Harness = ({ initialOpen, onOpenChange }: { initialOpen: boolean; onOpenChange: (open: boolean) => void }) => {
  const [open, setOpen] = useState(initialOpen);
  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      setOpen(next);
    },
    [onOpenChange],
  );
  return (
    <>
      {/* A focusable input outside the dialog, to exercise the "typing a literal ?" path. */}
      <input aria-label='outside field' />
      <ShortcutsHelp open={open} onOpenChange={handleOpenChange} />
    </>
  );
};

const renderHelp = (initialOpen: boolean): { readonly onOpenChange: ReturnType<typeof vi.fn<(open: boolean) => void>> } => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  render(<Harness initialOpen={initialOpen} onOpenChange={onOpenChange} />);
  return { onOpenChange };
};

describe('shortcuts help overlay', () => {
  it('exposes a dialog labelled by its visible "Keyboard shortcuts" title', () => {
    renderHelp(true);
    const dialog = screen.getByRole('dialog');
    const title = screen.getByText('Keyboard shortcuts');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
  });

  it('renders each documented group and shortcut with keycaps', () => {
    renderHelp(true);
    expect(screen.getByRole('heading', { name: 'Global' })).toBeDefined();
    expect(screen.getByText('Open the command palette')).toBeDefined();
    expect(screen.getByText('Open this keyboard shortcuts help')).toBeDefined();
    expect(screen.getByText('Close the open dialog or palette')).toBeDefined();
    expect(document.querySelectorAll('kbd').length).toBeGreaterThan(0);
  });

  it('uses <dt>/<dd> rows so each description is paired with its keycaps', () => {
    renderHelp(true);
    const term = screen.getByText('Open the command palette');
    expect(term.tagName).toBe('DT');
    // The matching <dd> carries a screen-reader label for the combo.
    const row = term.closest('div');
    const dd = row?.querySelector('dd');
    expect(dd?.getAttribute('aria-label')).toBe(EXPECTED_PALETTE_COMBO_LABEL);
  });

  it('shows the platform-correct command-palette modifier on a keycap', () => {
    renderHelp(true);
    const caps = keycapText();
    expect(caps).toContain(EXPECTED_MOD_GLYPH);
    expect(caps).toContain('K');
  });

  it('opens when `?` is pressed and focus is not in a field', async () => {
    const { onOpenChange } = renderHelp(false);
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
    fireHelpKey();
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
    expect(screen.getByText('Keyboard shortcuts')).toBeDefined();
  });

  it('does NOT open when `?` is pressed while typing in an input (literal ?)', async () => {
    const { onOpenChange } = renderHelp(false);
    const field = screen.getByLabelText('outside field');
    field.focus();
    expect(document.activeElement).toBe(field);
    fireHelpKey(field);
    // Give any async handler a chance to (wrongly) fire before asserting it didn't.
    await Promise.resolve();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
  });

  it('closes on Escape (the Dialog handles it; no Autocomplete to swallow it)', async () => {
    const { onOpenChange } = renderHelp(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

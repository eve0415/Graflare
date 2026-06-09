import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KeyboardShortcuts } from './keyboard-shortcuts';
import { navSequences } from './nav-sequences';

// `useNavigate` is stubbed with a spy so each chord's navigation target is observable. The
// real binding registers on `document` via the singleton SequenceManager and fires its
// callback synchronously inside the keydown handler — so assertions need no `waitFor`.
const navigateSpy = vi.fn<(options: unknown) => void>();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
}));

// Press a single key on `document`, where the manager binds its listener. A bare letter
// (no modifiers) is what a `g`-chord step expects.
const press = (key: string) => fireEvent.keyDown(document, { key });

// Walk a full chord (e.g. `g`, then `d`) as separate keydowns, mirroring real typing.
const pressChord = (...keys: readonly string[]) => {
  for (const key of keys) press(key);
};

afterEach(() => {
  // Unmount so the hook unregisters from the document-bound singleton; otherwise
  // registrations leak across tests (conflict warnings, double-fires).
  cleanup();
  navigateSpy.mockClear();
});

describe('keyboard navigation chords', () => {
  it('navigates to every section when its `g`-chord is pressed', () => {
    render(<KeyboardShortcuts />);
    for (const nav of navSequences) {
      navigateSpy.mockClear();
      pressChord(...nav.chord.map(key => key.toLowerCase()));
      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith({ to: nav.to });
    }
  });

  it('matches chords case-insensitively (uppercase keystrokes still fire)', () => {
    render(<KeyboardShortcuts />);
    // Physical Shift would change the event, but an uppercase `key` with no modifier still
    // matches — the library compares letters case-insensitively.
    pressChord('G', 'H');
    expect(navigateSpy).toHaveBeenCalledWith({ to: '/' });
  });

  it('does nothing when `g` is followed by a key that matches no chord', () => {
    render(<KeyboardShortcuts />);
    pressChord('g', 'z');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('resets after a non-matching second key, so a fresh chord still fires', () => {
    render(<KeyboardShortcuts />);
    // `g` then `z` is a dead end; the following `g` `d` must still navigate.
    pressChord('g', 'z');
    expect(navigateSpy).not.toHaveBeenCalled();
    pressChord('g', 'd');
    expect(navigateSpy).toHaveBeenCalledExactlyOnceWith({ to: '/dashboards' });
  });

  it('does not fire when a modifier is held with `g` (so it never clashes with Mod+K)', () => {
    render(<KeyboardShortcuts />);
    // Each modifier variant of the `g` step must be ignored: the binding requires no
    // modifiers, matched exactly.
    fireEvent.keyDown(document, { key: 'g', metaKey: true });
    press('d');
    fireEvent.keyDown(document, { key: 'g', ctrlKey: true });
    press('d');
    fireEvent.keyDown(document, { key: 'g', altKey: true });
    press('d');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('ignores the chord while focus is in an input, so `g` never hijacks typing', () => {
    const { getByLabelText } = render(
      <>
        <input aria-label='field' />
        <KeyboardShortcuts />
      </>,
    );
    const field = getByLabelText('field');
    field.focus();
    expect(document.activeElement).toBe(field);
    // Type `g` then `d` into the field — single-letter chords default to ignoring inputs.
    fireEvent.keyDown(field, { key: 'g' });
    fireEvent.keyDown(field, { key: 'd' });
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  describe('inter-key timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not fire when the second key lands after the ~1000ms window', () => {
      render(<KeyboardShortcuts />);
      press('g');
      // The library resets lazily on the next keydown: advancing past the timeout makes the
      // following `d` start a new (unmatched) attempt rather than completing `g d`.
      vi.advanceTimersByTime(1100);
      press('d');
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('fires when both keys land inside the window', () => {
      render(<KeyboardShortcuts />);
      press('g');
      vi.advanceTimersByTime(500);
      press('d');
      expect(navigateSpy).toHaveBeenCalledExactlyOnceWith({ to: '/dashboards' });
    });
  });
});

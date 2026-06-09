import type { UseHotkeySequenceDefinition } from '@tanstack/react-hotkeys';

import { useHotkeySequences } from '@tanstack/react-hotkeys';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';

import { navSequences } from './nav-sequences';

/**
 * App-wide Grafana-style `g`-prefix navigation chords (`g h` → Home, `g d` → Dashboards, …).
 * Mounted once at the root, inside the router, so it can call `useNavigate`. Renders nothing —
 * it exists only to register the sequences for the lifetime of the app, the same shape as the
 * always-mounted command palette / shortcuts-help.
 *
 * Sequence matching, the ~1000 ms inter-key timeout, ignoring keystrokes typed into inputs
 * (single-letter chords default `ignoreInputs: true`, so `g` never hijacks typing), and not
 * firing while Ctrl/Meta/Alt is held (the binding's modifiers are all `false`, matched exactly)
 * are all handled by `@tanstack/react-hotkeys`. The chord→route list lives in `nav-sequences.ts`
 * and is shared with the help-modal registry so the two can't drift.
 */
export const KeyboardShortcuts = () => {
  const navigate = useNavigate();

  // One definition per chord. `useHotkeySequences` re-syncs callbacks each render, so the
  // memo only needs to track `navigate`. Each chord is spread into the mutable `HotkeySequence`
  // the hook expects; `nav.to` stays a route literal so `navigate({ to })` type-checks against
  // the generated route tree (no widening to string), matching `command-data.ts`.
  const definitions = useMemo<UseHotkeySequenceDefinition[]>(
    () =>
      navSequences.map(nav => ({
        sequence: [...nav.chord],
        callback: () => void navigate({ to: nav.to }),
      })),
    [navigate],
  );

  useHotkeySequences(definitions);

  return null;
};

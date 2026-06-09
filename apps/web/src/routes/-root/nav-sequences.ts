import type { Hotkey } from '@tanstack/react-hotkeys';

/**
 * Grafana-style `g`-prefix navigation chords: press `g`, then a letter, to jump to a
 * top-level section. The single source of truth shared by the keyboard binding
 * (`keyboard-shortcuts.tsx`) and the help-modal registry (`shortcuts.ts`), so the two can
 * never drift — a new chord is one entry here.
 *
 * `chord` is stored in TanStack Hotkeys' canonical UPPERCASE form: a `HotkeySequence` is
 * `Hotkey[]` and a letter `Hotkey` is `'A'..'Z'`, so `['G', 'H']` type-checks while
 * `['g', 'h']` would not. Matching is case-insensitive at runtime, and the registry
 * lowercases each token for display — the casing is purely a type requirement. The binding
 * spreads each (`readonly`) chord into the mutable `HotkeySequence` the hook expects.
 *
 * `to` is kept a route literal via `as const` (not widened to `string`) so each
 * `navigate({ to })` in the binding type-checks against the generated route tree, exactly
 * like `nav-items.ts` and `command-data.ts`.
 */
export const navSequences = [
  { chord: ['G', 'H'], to: '/', label: 'Home' },
  { chord: ['G', 'D'], to: '/dashboards', label: 'Dashboards' },
  { chord: ['G', 'E'], to: '/explore', label: 'Explore' },
  { chord: ['G', 'A'], to: '/alerting', label: 'Alerting' },
  { chord: ['G', 'C'], to: '/datasources', label: 'Data Sources' },
  { chord: ['G', 'I'], to: '/import', label: 'Import' },
  { chord: ['G', 'T'], to: '/service-tokens', label: 'Service Tokens' },
] as const satisfies readonly { chord: readonly Hotkey[]; to: string; label: string }[];

export type NavSequence = (typeof navSequences)[number];

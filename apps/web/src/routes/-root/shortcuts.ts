/**
 * Data-driven registry of the app's keyboard shortcuts, rendered by the help overlay
 * (`shortcuts-help.tsx`). Shortcuts are plain data so adding one — including future
 * `g d`-style sequences — is a single array entry, never a JSX edit.
 *
 * `keys` holds *display tokens*, not the binding string and not a pre-rendered glyph:
 * the modal maps each token to a platform-correct keycap (`Mod` → ⌘ on macOS, Ctrl
 * elsewhere) and to a screen-reader label at render time. Keeping the glyph out of the
 * data means the same registry renders correctly on every platform and stays SSR-safe.
 */

import { navSequences } from './nav-sequences';

/**
 * The platform-resolved modifier token. Stored instead of a literal ⌘/Ctrl so the
 * displayed glyph follows the client platform (resolved via `isMacPlatform()` in the
 * modal) and can't drift from the actual `Mod` binding.
 */
export const MOD_KEY = 'Mod';

/**
 * The buckets a shortcut can belong to. A union (not a free string) so the help modal
 * renders groups in a known order and a new group is an explicit, additive change.
 */
export type ShortcutGroupId = 'global' | 'navigation';

/** A single documented shortcut — one row in the help modal. */
export interface Shortcut {
  /**
   * Display key tokens, in press order. Each becomes its own keycap. Use {@link MOD_KEY}
   * for the platform modifier; everything else is shown as written (e.g. `'?'`, `'Esc'`).
   */
  readonly keys: readonly string[];
  /** What the shortcut does — the `<dt>` term in the modal. */
  readonly description: string;
  readonly group: ShortcutGroupId;
}

/**
 * The Grafana-style `g`-prefix navigation chords, documented straight from the binding's
 * source of truth ({@link navSequences}). Each chord's canonical UPPERCASE tokens are
 * lowercased to the `g d` form users actually press, so these rows can never drift from the
 * keys the binding (`keyboard-shortcuts.tsx`) listens for.
 */
const navigationShortcuts: readonly Shortcut[] = navSequences.map(nav => ({
  keys: nav.chord.map(key => key.toLowerCase()),
  description: `Go to ${nav.label}`,
  group: 'navigation',
}));

/**
 * Every shortcut the app currently exposes. Order within a group is the display order.
 * Bindings themselves live with their components (e.g. `Mod+K` in `command-palette.tsx`,
 * `Shift+/` in `shortcuts-help.tsx`, the `g`-chords in `keyboard-shortcuts.tsx`); this
 * registry is the human-facing documentation.
 */
export const shortcuts: readonly Shortcut[] = [
  { keys: [MOD_KEY, 'K'], description: 'Open the command palette', group: 'global' },
  { keys: ['?'], description: 'Open this keyboard shortcuts help', group: 'global' },
  { keys: ['Esc'], description: 'Close the open dialog or palette', group: 'global' },
  ...navigationShortcuts,
];

/** A group of shortcuts with a rendered heading, as consumed by the modal. */
export interface ShortcutGroup {
  readonly id: ShortcutGroupId;
  readonly heading: string;
  readonly shortcuts: readonly Shortcut[];
}

/**
 * Canonical group order and headings. Declared here (not derived from the data) so the
 * modal's section order is stable and intentional regardless of registry insertion order
 * — adding a group is an explicit entry, mirroring `command-data.ts`.
 */
const GROUP_ORDER: readonly { readonly id: ShortcutGroupId; readonly heading: string }[] = [
  { id: 'global', heading: 'Global' },
  { id: 'navigation', heading: 'Navigation' },
];

/**
 * Bucket a flat shortcut list into ordered, headed groups for rendering. Groups follow
 * {@link GROUP_ORDER}; within a group, shortcuts keep their input order. Empty groups are
 * omitted so a group with no shortcuts never renders an empty section.
 */
export const groupShortcuts = (source: readonly Shortcut[]): readonly ShortcutGroup[] =>
  GROUP_ORDER.flatMap(({ id, heading }) => {
    const inGroup = source.filter(shortcut => shortcut.group === id);
    return inGroup.length > 0 ? [{ id, heading, shortcuts: inGroup }] : [];
  });

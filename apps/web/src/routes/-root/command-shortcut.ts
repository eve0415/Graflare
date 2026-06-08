/**
 * Whether a keyboard event is the command-palette shortcut: Cmd+K (macOS) or Ctrl+K
 * (Windows/Linux). Case-insensitive on the key so Shift/Caps don't break it.
 *
 * Kept as a pure predicate so it's unit-testable and the window listener stays a thin
 * wrapper around it.
 */
export const isCommandPaletteShortcut = (event: KeyboardEvent): boolean => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';

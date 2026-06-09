import type { Shortcut } from './shortcuts';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@graflare/ui/components/dialog';
import { useHotkey } from '@tanstack/react-hotkeys';
import { Fragment, useSyncExternalStore } from 'react';

import { isMacPlatform } from './platform';
import { MOD_KEY, groupShortcuts, shortcuts } from './shortcuts';

// Platform is a client-only value. `useSyncExternalStore` reads the server snapshot
// (`false` → "Ctrl") during SSR and hydration, then the client snapshot resolves "⌘" on
// macOS — no hydration mismatch, no setState-in-effect (same approach as the palette trigger).
const subscribeNoop = (): (() => void) => () => {};
const getIsMacServer = (): boolean => false;

const TITLE_ID = 'shortcuts-help-title';

/** Glyph shown on a keycap for tokens that have a conventional symbol. */
const KEY_GLYPHS: Record<string, string> = {
  Shift: '⇧',
  Alt: '⌥',
  Enter: '↵',
};

/**
 * Spoken name for a key token, so a screen reader announces "Command then K" rather than
 * the raw glyph (⌘, ⇧, ⌥ are read poorly or skipped). Falls back to the token itself
 * (single letters read fine).
 */
const KEY_LABELS: Record<string, string> = {
  Shift: 'Shift',
  Alt: 'Option',
  Enter: 'Enter',
  Esc: 'Escape',
  '?': 'question mark',
};

const keyGlyph = (key: string, isMac: boolean): string => {
  if (key === MOD_KEY) return isMac ? '⌘' : 'Ctrl';
  return KEY_GLYPHS[key] ?? key;
};

const keyLabel = (key: string, isMac: boolean): string => {
  if (key === MOD_KEY) return isMac ? 'Command' : 'Control';
  return KEY_LABELS[key] ?? key;
};

/**
 * Human-readable announcement for a whole combo, e.g. "Command then K". Applied as the
 * `<dd>`'s `aria-label` while the visible keycaps are `aria-hidden`, so the combo is read
 * once, cleanly, instead of the unreliable glyphs being read (or skipped) one by one.
 */
const comboLabel = (keys: readonly string[], isMac: boolean): string => keys.map(key => keyLabel(key, isMac)).join(' then ');

interface ShortcutRowProps {
  readonly shortcut: Shortcut;
  readonly isMac: boolean;
}

const ShortcutRow = ({ shortcut, isMac }: ShortcutRowProps) => (
  <div className='flex items-center justify-between gap-4 py-2.5'>
    <dt className='text-foreground text-sm'>{shortcut.description}</dt>
    <dd aria-label={comboLabel(shortcut.keys, isMac)} className='flex shrink-0 items-center gap-1'>
      {shortcut.keys.map((key, index) => (
        <Fragment key={key}>
          {index > 0 && shortcut.sequence !== true && (
            <span aria-hidden className='text-muted-foreground text-xs'>
              +
            </span>
          )}
          <kbd
            aria-hidden
            className='bg-muted text-foreground inline-flex h-6 min-w-6 items-center justify-center rounded border px-1.5 font-mono text-xs font-medium select-none'
          >
            {keyGlyph(key, isMac)}
          </kbd>
        </Fragment>
      ))}
    </dd>
  </div>
);

const groups = groupShortcuts(shortcuts);

export interface ShortcutsHelpProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * App-wide keyboard-shortcuts help overlay (opened with `?`). Mounted once at the root,
 * always rendered so its hotkey is registered regardless of open state — the same lifetime
 * as the command palette. Renders the {@link shortcuts} registry grouped, with platform-
 * correct keycaps and screen-reader-friendly combo labels.
 *
 * Open state is controlled by the parent so the hotkey and any future trigger share one
 * source of truth, matching the command-palette pattern.
 */
export const ShortcutsHelp = ({ open, onOpenChange }: ShortcutsHelpProps) => {
  const isMac = useSyncExternalStore(subscribeNoop, isMacPlatform, getIsMacServer);

  // `?` is physically Shift+/. In `@tanstack/hotkeys`, `useHotkey('?')` would never fire:
  // its matcher compares modifiers exactly, and the real event carries `shiftKey: true`
  // while the parsed `'?'` token expects `shift: false`. So we bind the underlying combo
  // `{ key: '/', shift: true }` (object form — `'Shift+/'` as a string isn't in the typed
  // `Hotkey` union), which matches the real `?` event via its `code: 'Slash'`. Do NOT
  // "simplify" this back to `'?'`. `ignoreInputs: true` — the library default for single/
  // Shift-only keys, set explicitly here — keeps it from firing while the user is typing a
  // literal `?` in an input or the palette's search field.
  useHotkey(
    { key: '/', shift: true },
    () => {
      onOpenChange(true);
    },
    { preventDefault: true, ignoreInputs: true },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className='gap-0 overflow-hidden p-0 sm:max-w-lg' aria-labelledby={TITLE_ID}>
        <div className='border-b px-5 py-4'>
          <DialogTitle id={TITLE_ID} className='text-base font-medium'>
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className='text-muted-foreground mt-1 text-sm'>Speed up navigation with these keys.</DialogDescription>
        </div>
        <div className='max-h-[min(70vh,32rem)] overflow-y-auto px-5 py-4'>
          {groups.map(group => (
            <section key={group.id} className='not-first:mt-6'>
              <h3 className='text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase'>{group.heading}</h3>
              <dl className='divide-border divide-y'>
                {group.shortcuts.map(shortcut => (
                  <ShortcutRow key={shortcut.description} shortcut={shortcut} isMac={isMac} />
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

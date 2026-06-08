import { Button } from '@graflare/ui/components/button';
import { SearchIcon } from 'lucide-react';
import { useSyncExternalStore } from 'react';

export interface CommandPaletteTriggerProps {
  readonly onOpen: () => void;
}

// Platform is a client-only value. `useSyncExternalStore` reads "Ctrl" on the server and
// during hydration, then the client snapshot resolves "⌘" on macOS — no hydration mismatch,
// and no setState-in-effect.
const subscribeNoop = (): (() => void) => () => {};
// Mirror the hotkey library's detectPlatform (checks platform AND userAgent) so the displayed
// glyph can't drift from the actual Mod binding.
const getIsMacClient = (): boolean => /mac/i.test(navigator.platform) || /mac/i.test(navigator.userAgent);
const getIsMacServer = (): boolean => false;

/**
 * Discoverable launcher for the command palette, shown in the app header. Doubles as the
 * focus-restore target when the palette is dismissed via the keyboard shortcut.
 */
export const CommandPaletteTrigger = ({ onOpen }: CommandPaletteTriggerProps) => {
  const isMac = useSyncExternalStore(subscribeNoop, getIsMacClient, getIsMacServer);

  return (
    <Button variant='outline' size='sm' onClick={onOpen} className='text-muted-foreground h-8 gap-2 px-2.5 font-normal' aria-label='Open command palette'>
      <SearchIcon className='size-4' />
      <span className='hidden sm:inline'>Search…</span>
      <kbd className='bg-muted text-muted-foreground pointer-events-none ml-1 hidden h-5 items-center gap-0.5 rounded border px-1.5 font-mono text-[10px] font-medium select-none sm:inline-flex'>
        {isMac ? '⌘' : 'Ctrl'}K
      </kbd>
    </Button>
  );
};

import { Button } from '@graflare/ui/components/button';
import { Kbd } from '@graflare/ui/components/kbd';
import { SearchIcon } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { isMacPlatform } from './platform';

export interface CommandPaletteTriggerProps {
  readonly onOpen: () => void;
}

// Platform is a client-only value. `useSyncExternalStore` reads "Ctrl" on the server and
// during hydration (server snapshot), then the client snapshot (`isMacPlatform`) resolves "⌘"
// on macOS — no hydration mismatch, and no setState-in-effect.
const subscribeNoop = (): (() => void) => () => {};
const getIsMacServer = (): boolean => false;

/**
 * Discoverable launcher for the command palette, shown in the app header. Doubles as the
 * focus-restore target when the palette is dismissed via the keyboard shortcut.
 */
export const CommandPaletteTrigger = ({ onOpen }: CommandPaletteTriggerProps) => {
  const isMac = useSyncExternalStore(subscribeNoop, isMacPlatform, getIsMacServer);

  return (
    <Button variant='outline' size='sm' onClick={onOpen} className='text-muted-foreground h-8 gap-2 px-2.5 font-normal' aria-label='Open command palette'>
      <SearchIcon className='size-4' />
      <span className='hidden sm:inline'>Search…</span>
      <Kbd className='ml-1 hidden text-[10px] sm:inline-flex'>{isMac ? '⌘' : 'Ctrl'}K</Kbd>
    </Button>
  );
};

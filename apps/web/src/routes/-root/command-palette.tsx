import type { CommandDescriptor } from './command-data';

import { Command, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandList, CommandStatus } from '@graflare/ui/components/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@graflare/ui/components/dialog';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { dashboardsQueryOptions } from '../dashboards/-queries';

import { assembleCommands } from './command-data';
import { rankCommands } from './command-filter';
import { isCommandPaletteShortcut } from './command-shortcut';

// Stable so it isn't recreated per render (react-perf): how Base UI stringifies a command
// value for its input/announce text.
const commandToLabel = (command: CommandDescriptor): string => command.label;

interface CommandItemRowProps {
  readonly command: CommandDescriptor;
  readonly onSelect: (command: CommandDescriptor) => void;
}

/**
 * One palette row. Split out (and memoized) so its click handler is a stable per-item
 * `useCallback` rather than an arrow created inside the list's `.map()`.
 */
const CommandItemRow = memo(({ command, onSelect }: CommandItemRowProps) => {
  const handleClick = useCallback(() => {
    onSelect(command);
  }, [command, onSelect]);
  const Icon = command.icon;
  return (
    <CommandItem value={command} onClick={handleClick}>
      {Icon ? <Icon /> : null}
      <span>{command.label}</span>
    </CommandItem>
  );
});
CommandItemRow.displayName = 'CommandItemRow';

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * App-wide command palette (Cmd/Ctrl+K). Mounted once at the root so it overlays every
 * route. Navigation targets, create actions, and dashboard search are assembled as typed
 * command descriptors and filtered/grouped locally, then rendered in a centered modal
 * Dialog wrapping the Base UI Autocomplete listbox.
 *
 * Open state is controlled by the parent so a header trigger and the keyboard shortcut
 * share one source of truth; the parent's button is the natural focus-restore target.
 */
export const CommandPalette = ({ open, onOpenChange }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Only fetch dashboards while the palette is open — it lives on every route, so an
  // unconditional fetch would hit the server fn on every page load.
  const { data: dashboards, isLoading } = useQuery(dashboardsQueryOptions({ enabled: open }));

  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      // Reset the query whenever the palette closes so it reopens clean.
      if (!next) setQuery('');
    },
    [onOpenChange],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        // Route through handleOpenChange so toggling closed also resets the query.
        handleOpenChange(!open);
      }
    };
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleOpenChange]);

  const commands = useMemo(() => assembleCommands({ navigate, dashboards: dashboards ?? [] }), [navigate, dashboards]);
  const groups = useMemo(() => rankCommands(query, commands), [query, commands]);

  const select = useCallback(
    (command: CommandDescriptor) => {
      onOpenChange(false);
      setQuery('');
      command.run();
    },
    [onOpenChange],
  );

  const dashboardsPending = open && isLoading && dashboards === undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className='gap-0 overflow-hidden p-0 sm:max-w-lg' initialFocus={inputRef} aria-label='Command palette'>
        <DialogTitle className='sr-only'>Command palette</DialogTitle>
        <DialogDescription className='sr-only'>
          Search for pages, actions, and dashboards. Use the arrow keys to navigate and Enter to select.
        </DialogDescription>
        {/* The Autocomplete swallows Escape (floating-ui dismiss doesn't bubble it to the
            Dialog), but still reports the intent via onOpenChange — forward it to close. */}
        <Command
          items={groups}
          value={query}
          onValueChange={setQuery}
          onOpenChange={handleOpenChange}
          mode='none'
          open
          autoHighlight
          itemToStringValue={commandToLabel}
        >
          <CommandInput ref={inputRef} placeholder='Search pages, actions, dashboards…' aria-label='Search commands' />
          <CommandList>
            <CommandEmpty>{dashboardsPending ? 'Loading…' : 'No results found.'}</CommandEmpty>
            {dashboardsPending && <CommandStatus>Loading dashboards…</CommandStatus>}
            {groups.map(group => (
              <CommandGroup key={group.id} items={group.items}>
                <CommandGroupLabel>{group.heading}</CommandGroupLabel>
                {group.items.map(command => (
                  <CommandItemRow key={command.id} command={command} onSelect={select} />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};

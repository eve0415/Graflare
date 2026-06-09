import type { CommandDescriptor } from './command-data';

import { Command, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandList, CommandStatus } from '@graflare/ui/components/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@graflare/ui/components/dialog';
import { useHotkey } from '@tanstack/react-hotkeys';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import { dashboardsQueryOptions } from '../dashboards/-queries';

import { assembleCommands } from './command-data';
import { rankCommands } from './command-filter';
import { useTheme } from './theme-provider';
import { useRecentDashboards } from './use-recent-dashboards';

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
  const { resolved, setTheme } = useTheme();
  const { recents } = useRecentDashboards();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // `setTheme` accepts 'system' | 'light' | 'dark'; toggling off `resolved` (the concrete
  // applied theme) flips between explicit light and dark regardless of a 'system' setting.
  const toggleTheme = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setTheme]);

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

  // Global Cmd/Ctrl+K toggles the palette. `Mod` resolves to ⌘ on macOS and Ctrl elsewhere;
  // the callback is re-synced each render so it sees the current `open`. `ignoreInputs: false`
  // keeps it working while focus is in a field, and routing through handleOpenChange means
  // toggling closed also clears the query.
  useHotkey(
    'Mod+K',
    () => {
      handleOpenChange(!open);
    },
    { preventDefault: true, ignoreInputs: false },
  );

  const commands = useMemo(
    () => assembleCommands({ navigate, dashboards: dashboards ?? [], recents, toggleTheme }),
    [navigate, dashboards, recents, toggleTheme],
  );
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
          {/* Empty + Status are SIBLINGS of the list, not children. Base UI's `List` renders the
              `role=listbox`, and `aria-required-children` allows a listbox to own only
              `option`/`group` — but `Empty`/`Status` render `role=status` and stay mounted even
              with results (their live region must persist to announce). Nesting them inside the
              list put a `role=status` inside `role=listbox` (a real violation, present in every
              state). This sibling layout is exactly Base UI's documented Autocomplete anatomy. */}
          <CommandEmpty>{dashboardsPending ? 'Loading…' : 'No results found.'}</CommandEmpty>
          {dashboardsPending && <CommandStatus>Loading dashboards…</CommandStatus>}
          <CommandList>
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

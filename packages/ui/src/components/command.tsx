'use client';

import { Autocomplete as AutocompletePrimitive } from '@base-ui/react/autocomplete';
import { cn } from '@graflare/ui/lib/utils';
import { SearchIcon } from 'lucide-react';
import * as React from 'react';

/**
 * A group of related command items. Mirrors Base UI's grouped-items shape (`items` is
 * the required key; arbitrary metadata such as a heading may live alongside it).
 */
interface CommandGroupData<TValue> {
  readonly items: readonly TValue[];
}

/**
 * Command palette primitive, built on Base UI's `Autocomplete` (a type-to-filter
 * listbox with built-in keyboard navigation + ARIA `aria-activedescendant`).
 *
 * The list renders inline (no `Positioner`/`Popup`/`Portal`) so it can live inside a
 * centered modal `Dialog`: the Dialog owns the focus trap and positioning, the
 * Autocomplete owns filtering UI, highlight, and selection. Drive `open` from the
 * parent so the list stays visible while the Dialog is open.
 *
 * Generic over the grouped item arrays so item values stay strongly typed end to end.
 * Base UI's `Autocomplete.Root.Props` omits `items` (it lives only on the component's
 * overloads), so it is re-declared here against the grouped shape.
 */
function Command<TGroups extends readonly CommandGroupData<unknown>[]>({
  ...props
}: Omit<AutocompletePrimitive.Root.Props<TGroups[number]['items'][number]>, 'items'> & { items: TGroups }) {
  return <AutocompletePrimitive.Root data-slot='command' {...props} />;
}

function CommandInput({ className, ...props }: AutocompletePrimitive.Input.Props) {
  return (
    <div data-slot='command-input-wrapper' className='flex h-11 items-center gap-2 border-b px-3'>
      <SearchIcon className='size-4 shrink-0 opacity-50' />
      <AutocompletePrimitive.Input
        data-slot='command-input'
        className={cn(
          'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List data-slot='command-list' className={cn('max-h-80 scroll-py-1 overflow-x-hidden overflow-y-auto p-1', className)} {...props} />
  );
}

function CommandEmpty({ className, ...props }: AutocompletePrimitive.Empty.Props) {
  return <AutocompletePrimitive.Empty data-slot='command-empty' className={cn('py-6 text-center text-sm text-muted-foreground', className)} {...props} />;
}

function CommandStatus({ className, ...props }: AutocompletePrimitive.Status.Props) {
  return <AutocompletePrimitive.Status data-slot='command-status' className={cn('py-6 text-center text-sm text-muted-foreground', className)} {...props} />;
}

function CommandGroup({ className, ...props }: AutocompletePrimitive.Group.Props) {
  return <AutocompletePrimitive.Group data-slot='command-group' className={cn('overflow-hidden p-1 text-foreground', className)} {...props} />;
}

function CommandGroupLabel({ className, ...props }: AutocompletePrimitive.GroupLabel.Props) {
  return (
    <AutocompletePrimitive.GroupLabel
      data-slot='command-group-label'
      className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: AutocompletePrimitive.Item.Props) {
  return (
    <AutocompletePrimitive.Item
      data-slot='command-item'
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot='command-shortcut' className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)} {...props} />;
}

export { Command, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandList, CommandShortcut, CommandStatus };

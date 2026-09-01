import * as React from 'react';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from '@/lib/icons';
import * as SelectPrimitive from '@radix-ui/react-select';

import { cn } from '@/lib/utils';
import { cva } from 'class-variance-authority';

const selectTriggerVariants = cva(
  // Trailhead: data-[size=default]:h-12 (not just h-12 in the size
  // variant below) is deliberate — this data-attribute-scoped class has
  // higher specificity than a bare height utility, so the plain h-12 in
  // `size.default` alone would lose the cascade to a leftover h-9 here.
  // justify-between (was justify-center) left-aligns the value against the
  // right-aligned chevron once a caller opts into w-full.
  // sm is h-11, not h-8: it is the dense form, not an exemption from the 44px
  // target. It keeps px-4 so its closed value stays in the item column.
  // The hover fill is --accent, not a --happy-* step: this is a field, and the
  // Light-Tuned Scale Rule holds it to semantic tokens. --muted is not an
  // option either, since it is the same value as --card in dark and would be
  // invisible exactly where the upstream dark-only hover already was.
  // SelectValue clones the chosen item's children into the trigger, so an icon
  // that SelectItem sized and spaced arrives here with neither: it rendered at
  // lucide's own 24px against the row's 16px, jammed against its label. The
  // trigger has to repeat both rules — the size on any svg that does not name
  // one, the gap on the value slot — or every icon row reads right open and
  // wrong closed.
  "data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground aria-invalid:border-destructive-text flex w-fit items-center justify-between gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium elevation-raised-subtle transition-[color,background-color,border-color,box-shadow] hover:bg-accent focus-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-12 data-[size=sm]:h-11 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2",
  {
    variants: {
      size: {
        default: 'h-12 px-4 py-1.5',
        sm: 'h-11 px-4 py-1',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

function Select({
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props}>{children}</SelectPrimitive.Root>;
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot='select-group' {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot='select-value' {...props} />;
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: 'sm' | 'default';
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot='select-trigger'
      data-size={size}
      className={cn(selectTriggerVariants({ size }), className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className='size-4 opacity-50' />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot='select-content'
        className={cn(
          // Trailhead: no border, bigger radius + shadow.
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] duration-fast ease-standard origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-card border-0 elevation-floating',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            position === 'popper' &&
              'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1'
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot='select-label'
      className={cn('type-micro text-muted-foreground px-4 py-1.5', className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot='select-item'
      className={cn(
        // Trailhead: one focus tone with a dark twin, mirroring DropdownMenuItem —
        // `--happy-100` is theme-invariant, so a light-only tone reads 10.02 in dark.
        // pl-4 lines item text up with the trigger's px-4.
        "focus:bg-happy-100 focus:text-happy-900 dark:focus:bg-happy-900 dark:focus:text-happy-100 [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-xl py-1.5 pr-8 pl-4 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span className='absolute right-2 flex size-4 items-center justify-center'>
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className='size-4' />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot='select-scroll-up-button'
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className
      )}
      {...props}
    >
      <ChevronUpIcon className='size-4' />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot='select-scroll-down-button'
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className
      )}
      {...props}
    >
      <ChevronDownIcon className='size-4' />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
};

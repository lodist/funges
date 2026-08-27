'use client';

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { CircleIcon } from '@/lib/icons';

import { cn } from '@/lib/utils';

// Same stroke reasoning as Checkbox: the box has no fill when selected, so the
// dot and the stroke are the only things that read, and both sit on
// --primary-text rather than the 2.94:1 --primary step. gap-6 keeps the 44px
// hit areas from overlapping each other on a 20px box.
const RADIO_ITEM_CLASS =
  'relative p-0 aspect-square size-5 shrink-0 rounded-full border-2 ' +
  'border-primary-text text-primary-text aria-invalid:border-destructive-text ' +
  'before:absolute before:top-1/2 before:left-1/2 before:size-11 ' +
  'before:-translate-x-1/2 before:-translate-y-1/2 ' +
  'transition-[color,border-color,box-shadow] focus-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot='radio-group'
      className={cn('grid gap-6', className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot='radio-group-item'
      className={cn(RADIO_ITEM_CLASS, className)}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot='radio-group-indicator'
        className='relative flex items-center justify-center'
      >
        {/* fill and text are both pinned: the icon takes no className
            passthrough, and the stroke follows currentColor rather than fill,
            so without text- the dot picks up a stray ring from --foreground. */}
        <CircleIcon className='fill-primary-text text-primary-text absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2' />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };

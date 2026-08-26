'use client';

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { CircleIcon } from '@/lib/icons';

import { cn } from '@/lib/utils';
import { cva } from 'class-variance-authority';

const radioGroupItemVariants = cva(
  // Trailhead (#213): p-0 fixes the same global button{padding} reset as
  // Checkbox/Switch (globals.scss). border/text-primary === happy-600.
  'p-0 border-2 border-primary text-primary aria-invalid:border-destructive aspect-square shrink-0 rounded-full elevation-control transition-[color,box-shadow] focus-ring disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'size-5',
        sm: 'size-3',
        lg: 'size-6',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot='radio-group'
      className={cn('grid gap-3', className)}
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
      className={cn(
        radioGroupItemVariants({
          size: 'default',
        }),
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot='radio-group-indicator'
        className='relative flex items-center justify-center'
      >
        {/* Trailhead (#213): hardcoded instead of fill-primary, since this
            icon has no className passthrough. text- is pinned too — the
            stroke follows currentColor, not fill, so without it the dot
            gets a stray dark ring from --foreground. */}
        <CircleIcon className='fill-happy-600 text-happy-600 absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2' />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };

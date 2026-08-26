import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { CheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { cva } from 'class-variance-authority';

const checkboxVariants = cva(
  // Trailhead (#213): square with a genuinely visible tick. p-0 also fixes
  // a pre-existing global `button{padding}` reset (globals.scss) that was
  // stretching this into a pill. border/bg-primary === happy-600.
  'peer p-0 rounded-[5px] border-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-white aria-invalid:border-destructive shrink-0 shadow-xs transition-shadow focus-ring disabled:cursor-not-allowed disabled:opacity-50',
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

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot='checkbox'
      className={cn(
        checkboxVariants({
          className,
        })
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot='checkbox-indicator'
        className='flex items-center justify-center text-current transition-none'
      >
        <CheckIcon className='size-3.5' />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

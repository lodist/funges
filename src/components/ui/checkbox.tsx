import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { CheckIcon } from '@/lib/icons';

import { cn } from '@/lib/utils';

// The 2px stroke carries the 3:1 non-text floor in every state, so the checked
// fill never has to: --primary measures 2.94:1 on the page, --primary-text
// 7.85:1 light / 6.44:1 dark. p-0 defeats the global button{padding} reset in
// globals.scss. ::before widens the hit area to 44px without resizing the box.
const CHECKBOX_CLASS =
  'peer relative p-0 size-5 shrink-0 rounded-sm border-2 border-primary-text ' +
  'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground ' +
  'aria-invalid:border-destructive-text [&_svg]:size-3 ' +
  'before:absolute before:top-1/2 before:left-1/2 before:size-11 ' +
  'before:-translate-x-1/2 before:-translate-y-1/2 ' +
  'transition-[color,background-color,border-color,box-shadow] focus-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot='checkbox'
      className={cn(CHECKBOX_CLASS, className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot='checkbox-indicator'
        className='flex items-center justify-center text-current'
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

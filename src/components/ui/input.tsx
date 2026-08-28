import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot='input'
      className={cn(
        // Trailhead (#213): search-bar pill. pl-4 by default — callers
        // with a leading icon (e.g. search) add pl-11 themselves.
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 flex h-12 w-full min-w-0 rounded-full border border-border bg-card px-4 py-1 text-base elevation-raised-subtle transition-[color,border-color,box-shadow] focus-ring file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'aria-invalid:border-destructive-text',
        className
      )}
      {...props}
    />
  );
}

export { Input };

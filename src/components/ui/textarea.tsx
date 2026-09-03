import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot='textarea'
      className={cn(
        // Trailhead (#213).
        'placeholder:text-muted-foreground aria-invalid:border-destructive-text dark:bg-input/30 flex field-sizing-content max-h-[50dvh] min-h-16 w-full rounded-card border border-border bg-card p-4 text-base elevation-raised-subtle transition-[color,border-color,box-shadow] focus-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };

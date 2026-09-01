import { cva } from 'class-variance-authority';

export const badgeVariants = cva(
  // Transparent 1px border keeps every variant the same height, so only the
  // ones that want a visible stroke pay for it.
  'inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit max-w-full min-w-0 whitespace-nowrap shrink-0 gap-1 [&>svg]:size-3 [&>svg]:shrink-0 [&>svg]:pointer-events-none focus-ring aria-invalid:border-destructive transition-[color,background-color,border-color,box-shadow]',
  {
    variants: {
      variant: {
        // Literal happy-500, one step brighter than --primary, so a badge
        // reads as a marker rather than a small button.
        default: 'bg-happy-500 text-happy-900 [a&]:hover:bg-happy-500/90',
        secondary:
          'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        // The fill alone is 2.50:1 on Night Canvas; the border carries the
        // boundary in dark.
        destructive:
          'bg-destructive text-white dark:border-destructive-border [a&]:hover:bg-destructive/90',
        outline:
          'border-primary-text text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        warning:
          'bg-status-warning-background border-status-warning-border text-status-warning-text',
        // On bg-secondary these fall to 4.00:1 in dark. Their tokens alias
        // --primary-text, so they read the ground instead of a fill.
        success: 'border-status-success text-status-success',
        info: 'border-status-info text-status-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

import { cva } from 'class-variance-authority';

export const badgeVariants = cva(
  // Trailhead (#213): pills, no border — matches the redesigned atoms'
  // "no borders except the one outline button" rule.
  'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        // bg intentionally stays literal happy-500 (--primary is happy-600).
        default:
          'border-transparent bg-[var(--happy-500)] text-[var(--happy-900)] [a&]:hover:bg-[var(--happy-500)]/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        // No red anywhere, per review — bg-destructive === --happy-900.
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90',
        outline:
          'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

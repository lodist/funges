import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // Trailhead (#213): "Hit the Trail" pill CTA — happy green, dark
        // text (never white, not even on hover), soft diffuse shadow
        // instead of a border. Hover is a deliberate big jump down the
        // scale, not a token nudge. Not dark-mode-guarded: this recolour is
        // intentional in both modes (unlike outline/ghost below, which keep
        // their prior dark-mode look).
        // bg/text intentionally stay literal happy-500/900, not
        // bg-primary/text-primary-foreground (--primary is happy-600) — the
        // hero CTA uses the brighter 500 step on purpose.
        default:
          'rounded-full border-0 font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.18)] bg-[var(--happy-500)] text-[var(--happy-900)] hover:bg-[oklch(0.58_0.18_150)] hover:shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-[background-color,box-shadow]',
        // Deepest step of the happy-green scale stands in for "destructive"
        // — no red anywhere, per review. bg-destructive === --happy-900.
        destructive:
          'rounded-full border-0 font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.18)] bg-destructive text-white hover:bg-[oklch(0.36_0.10_150)] hover:shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-[background-color,box-shadow]',
        // The one button that's semantically "outline" (e.g. Share) — the
        // only bordered button in the redesign; hover only ever shifts the
        // fill, never adds/removes an outline. border-primary === happy-600.
        // dark: classes unchanged — Trailhead wasn't reviewed in dark mode.
        outline:
          'rounded-full border-2 border-primary bg-transparent text-[var(--happy-700)] shadow-none hover:bg-[var(--happy-50)] hover:text-[var(--happy-700)] dark:border-primary dark:bg-card dark:text-primary dark:hover:bg-primary dark:hover:text-primary-foreground',
        'enhanced-outline':
          'border-2 border-primary bg-white text-primary shadow-md hover:bg-primary hover:text-white hover:shadow-lg transition-all duration-[var(--duration-base)] dark:border-primary dark:bg-card dark:text-primary dark:hover:bg-primary dark:hover:text-primary-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        // dark: classes unchanged — Trailhead wasn't reviewed in dark mode.
        ghost:
          'rounded-full font-medium text-foreground hover:bg-[var(--happy-50)] hover:text-[var(--happy-700)] transition-colors dark:hover:bg-accent/50 dark:hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // Trailhead (#213): size controls height/padding only. Radius is the
      // variant's call (pill for default/outline/destructive/ghost) — a
      // leftover `rounded-md` here would win over it via tailwind-merge and
      // square off every sm/lg button regardless of variant.
      size: {
        default: 'h-11 px-6 py-2 has-[>svg]:px-4',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-11',
      },
    },
    compoundVariants: [
      {
        // Circular floating icon button (map zoom/locate
        // controls): no border even though it's semantically "outline",
        // colored icon on a plain card-colored circle.
        variant: 'outline',
        size: 'icon',
        class:
          'rounded-full p-0 border-0 shadow-[0_2px_10px_rgba(0,0,0,0.18)] bg-card text-[var(--happy-700)] hover:bg-[var(--happy-50)] hover:text-[var(--happy-700)]',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot='button'
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

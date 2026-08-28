import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Border width lives here so aria-invalid has something to paint into, and
  // transparent keeps every variant the same height. In dark the error edge
  // needs --destructive-border: the fill tone is 2.50:1 on Night Canvas. The
  // invalid hover has to live here too — background and label both, or a
  // variant repaints one of them brand green under a red edge. The dark copies
  // are not redundant: `dark:hover:*` ties on specificity and sorts later.
  // The transition names its properties: `transition-all` also animated layout.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent text-sm font-medium transition-[color,background-color,border-color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 focus-ring aria-invalid:border-destructive dark:aria-invalid:border-destructive-border aria-invalid:hover:bg-destructive/10 aria-invalid:hover:text-destructive-text dark:aria-invalid:hover:bg-destructive/10 dark:aria-invalid:hover:text-destructive-text",
  {
    variants: {
      variant: {
        // Hero CTA. Literal happy-500/900, not bg-primary (happy-600) — the
        // brighter step on purpose. Not dark-guarded: intentional in both modes.
        default:
          'font-semibold elevation-control elevation-interactive bg-happy-500 text-happy-900 hover:bg-primary-hover',
        // Fly-agaric red. The fill alone is 2.50:1 on the dark page, so dark
        // adds --destructive-border for an edge, as Badge does.
        destructive:
          'font-semibold elevation-control elevation-interactive bg-destructive text-white hover:bg-destructive-hover dark:border-destructive-border',
        // Stroke and label are both --primary-text, and the invalid state takes
        // the label too — a red stroke around a green label reads as a mistake.
        // Stroke and label are both --primary-text. --primary is 2.94:1 on
        // paper (under the 3:1 floor) and 4.36:1 on dark --card (under AA);
        // here the stroke is the light variant's only boundary.
        outline:
          'border-2 border-primary-text bg-transparent text-primary-text shadow-none aria-invalid:text-destructive-text hover:bg-happy-50 dark:bg-card dark:hover:bg-primary dark:hover:text-primary-foreground',
        // Hover inverts to a solid fill. --primary-foreground in both themes:
        // white on --primary is 3.00:1.
        'enhanced-outline':
          'border-2 border-primary-text bg-card text-primary-text aria-invalid:text-destructive-text elevation-control elevation-interactive hover:bg-primary hover:text-primary-foreground',
        // The 1.10:1 wash is not the boundary; the 5.02:1 label is.
        secondary:
          'bg-secondary text-secondary-foreground elevation-control elevation-interactive hover:bg-secondary/80',
        ghost:
          'font-medium text-foreground hover:bg-happy-50 hover:text-primary-text dark:hover:bg-accent/50 dark:hover:text-accent-foreground',
        // Underlined at rest: with `text-primary` redefined as --foreground,
        // link and ghost computed the same Ink label over the same fill.
        link: 'text-primary-text underline underline-offset-4 hover:no-underline',
      },
      // Height and padding only — radius is the base's call, and a `rounded-*`
      // here would win over it via tailwind-merge. Ramp: 28/32/44/48 below
      // `sm:`, 32/32/44/48 above. `xs` is what five call sites hand-rolled.
      size: {
        xs: 'h-7 gap-1.5 px-2 text-xs sm:h-8',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        default: 'h-11 px-6 py-2 has-[>svg]:px-4',
        lg: 'h-12 px-8 has-[>svg]:px-6',
        icon: 'size-11',
      },
    },
    compoundVariants: [
      {
        // Floating map control: the named exception to Outline-Means-Outline.
        // `border-transparent`, not `border-0`, so aria-invalid still paints.
        variant: 'outline',
        size: 'icon',
        class:
          'p-0 border-transparent elevation-control elevation-interactive bg-card text-primary-text hover:bg-happy-50',
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

// `buttonVariants` stays module-local: nothing imports it, and exporting a
// non-component alongside Button breaks react-refresh's HMR boundary.
export { Button };

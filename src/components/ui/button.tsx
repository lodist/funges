import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 focus-ring aria-invalid:border-destructive",
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
          'border-0 font-semibold elevation-control elevation-interactive bg-happy-500 text-happy-900 hover:bg-[oklch(0.58_0.18_150)]',
        // Fly-agaric red (#225) — see --destructive in index.css for why red
        // earns its place in this palette. The hover step is the same hue
        // pressed darker: 9.85:1 against the white label.
        destructive:
          'border-0 font-semibold elevation-control elevation-interactive bg-destructive text-white hover:bg-[oklch(0.40_0.17_28)]',
        // The one button that's semantically "outline" (e.g. Share) — the
        // only bordered button in the redesign; hover only ever shifts the
        // fill, never adds/removes an outline. border-primary === happy-600.
        // dark: classes unchanged — Trailhead wasn't reviewed in dark mode.
        outline:
          'border-2 border-primary bg-transparent text-happy-700 shadow-none hover:bg-happy-50 hover:text-happy-700 dark:border-primary dark:bg-card dark:text-primary dark:hover:bg-primary dark:hover:text-primary-foreground',
        'enhanced-outline':
          'border-2 border-primary bg-card text-primary elevation-control elevation-interactive hover:bg-primary hover:text-white dark:border-primary dark:bg-card dark:text-primary dark:hover:bg-primary dark:hover:text-primary-foreground',
        secondary:
          'bg-secondary text-secondary-foreground elevation-control elevation-interactive hover:bg-secondary/80',
        // dark: classes unchanged — Trailhead wasn't reviewed in dark mode.
        ghost:
          'font-medium text-foreground hover:bg-happy-50 hover:text-happy-700 transition-colors dark:hover:bg-accent/50 dark:hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // Trailhead (#213): size controls height/padding only. Radius is the
      // base's call — every button is a pill, per DESIGN.md's Pill-Or-Card
      // Rule. Any `rounded-*` here or in a variant would win over it via
      // tailwind-merge and square off buttons that should stay round; that is
      // exactly how `secondary`, `enhanced-outline` and `link` spent #225
      // shipping as 6px rectangles nobody chose.
      // `lg` was h-10 — 40px, *shorter* than default's 44px, so the large
      // button rendered smaller than the medium one. It now steps up to 48px,
      // keeping the ramp monotonic: 32 / 44 / 48.
      size: {
        default: 'h-11 px-6 py-2 has-[>svg]:px-4',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-12 px-8 has-[>svg]:px-6',
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
          'p-0 border-0 elevation-control elevation-interactive bg-card text-happy-700 hover:bg-happy-50 hover:text-happy-700',
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

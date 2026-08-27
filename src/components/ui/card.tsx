import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// `cardVariants` stays module-local: exporting a non-component alongside Card
// breaks react-refresh's HMR boundary.
const cardVariants = cva(
  'text-card-foreground flex flex-col rounded-card gap-0 elevation-raised',
  {
    variants: {
      // Glass carries its own background and hairline, so `solid` owns both.
      surface: {
        solid: 'bg-card border-0',
        glass: 'glass-regular',
      },
      // The card owns its vertical rhythm; header/content own the horizontal.
      // `none` is for full-bleed media and for cards that pad their own body.
      padding: {
        content: 'py-6',
        none: 'p-0',
      },
      // The hover lift belongs to cards you can actually activate.
      interactive: {
        true: 'elevation-interactive',
        false: '',
      },
      // Clipping is for photo-bearing cards only: it also eats focus rings.
      media: {
        true: 'overflow-hidden',
        false: '',
      },
    },
    defaultVariants: {
      surface: 'solid',
      padding: 'content',
      interactive: false,
      media: false,
    },
  }
);

type CardProps = React.ComponentProps<'div'> &
  VariantProps<typeof cardVariants>;

function Card({
  className,
  surface,
  padding,
  interactive,
  media,
  ...props
}: CardProps) {
  return (
    <div
      data-slot='card'
      data-interactive={interactive ? '' : undefined}
      className={cn(
        cardVariants({ surface, padding, interactive, media }),
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-header'
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        className
      )}
      {...props}
    />
  );
}

type CardTitleProps = React.ComponentProps<'h3'> & {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
};

// A card title is a section heading: `h3` by default, `as` picks the level.
function CardTitle({ className, as: Comp = 'h3', ...props }: CardTitleProps) {
  return (
    <Comp
      data-slot='card-title'
      className={cn('text-base leading-snug font-semibold', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-description'
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-action'
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-content'
      className={cn('px-6', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-footer'
      className={cn('flex items-center px-6', className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};

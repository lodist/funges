import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import type { VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { badgeVariants } from './badge-variants';

function Badge({
  className,
  variant,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  // text-overflow needs a block box, which the flex container is not. Adjacent
  // text children merge into one so gap does not open between the words.
  // asChild hands its single child to Slot untouched.
  const content = asChild
    ? children
    : React.Children.toArray(children)
        .reduce<React.ReactNode[]>((acc, child) => {
          if (typeof child !== 'string' && typeof child !== 'number') {
            acc.push(child);
            return acc;
          }
          const last = acc[acc.length - 1];
          if (typeof last === 'string') acc[acc.length - 1] = last + child;
          else acc.push(String(child));
          return acc;
        }, [])
        .map((child, index) =>
          typeof child === 'string' ? (
            // eslint-disable-next-line react/no-array-index-key
            <span key={index} className='truncate'>
              {child}
            </span>
          ) : (
            child
          )
        );

  return (
    <Comp
      data-slot='badge'
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {content}
    </Comp>
  );
}

export { Badge };

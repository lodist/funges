import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      // Presentational: the pulse is a visual channel only, and reduced motion
      // collapses it to a still block. SkeletonGroup carries the announcement.
      aria-hidden='true'
      // The shape is the caller's, and the radius is part of the shape. The
      // container radius used to be the default, but CSS clamps a radius past
      // half the shorter side, so every placeholder under 40px tall rendered
      // as a pill — including the text lines, which are most of them.
      className={cn('bg-muted animate-pulse rounded-md', className)}
      {...props}
    />
  );
}

function SkeletonGroup({
  className,
  label,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  /** Overrides the generic wait message where the surface has a specific one. */
  label?: string;
}) {
  const { t } = useTranslation('common');

  return (
    <div
      data-slot='skeleton-group'
      role='status'
      aria-busy='true'
      className={className}
      {...props}
    >
      <span className='sr-only'>{label ?? t('common.loading')}</span>
      {children}
    </div>
  );
}

export { Skeleton, SkeletonGroup };

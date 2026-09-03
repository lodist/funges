import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { XIcon } from '@/lib/icons';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot='sheet' {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot='sheet-trigger' {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot='sheet-close' {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot='sheet-portal' {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot='sheet-overlay'
      className={cn(
        // Scrim and panel share the overlay enter/exit duration.
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-scrim transition-none duration-slow ease-standard',
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const { t } = useTranslation('common');

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot='sheet-content'
        className={cn(
          // Motion: Sheet is a `floating` surface, so enter and exit
          // both ride --transition-duration-slow. The asymmetric 500ms open is folded
          // onto the shared scale — one scale, no undocumented exception.
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out elevation-floating fixed z-50 flex max-h-dvh flex-col transition-none duration-slow ease-standard',
          side === 'right' &&
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 rounded-l-card sm:max-w-sm',
          side === 'left' &&
            'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 rounded-r-card sm:max-w-sm',
          side === 'top' &&
            'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto rounded-b-card',
          // A bottom panel is lit from below, so its shadow inverts.
          side === 'bottom' &&
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto rounded-t-card elevation-floating-up',
          className
        )}
        {...props}
      >
        <div
          data-slot='sheet-body'
          className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4'
        >
          {children}
        </div>
        {/* Round X carrying the panel's own colour, so body text scrolling
            underneath stays masked, with a happy fill on hover. Sits above the
            scrolling body, so it never scrolls away. */}
        <SheetPrimitive.Close
          data-slot='sheet-close-icon'
          className='focus-ring absolute top-4 right-4 z-10 rounded-full size-11 p-0 border-0 bg-background text-happy-700 dark:text-happy-300 grid place-items-center leading-none opacity-100 transition-colors hover:bg-happy-50 dark:hover:bg-happy-900 disabled:pointer-events-none'
        >
          <XIcon className='size-4' />
          <span className='sr-only'>{t('close')}</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='sheet-header'
      className={cn(
        // The dismiss is absolute so it never scrolls away, which puts it on
        // top of this row: 16px of inset plus its own 44px. Without the
        // gutter the panel's own background masks whatever runs under it, so
        // a wrapping description loses a word rather than colliding visibly.
        'flex flex-col gap-1.5 pr-11',
        className
      )}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='sheet-footer'
      className={cn('mt-auto flex flex-col gap-2', className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot='sheet-title'
      className={cn(
        'text-foreground text-lg leading-snug font-semibold',
        className
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot='sheet-description'
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};

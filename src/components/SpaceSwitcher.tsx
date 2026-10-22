import { useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SpaceMark } from '@/components/Logo';
import { Check, ChevronDown } from '@/lib/icons';
import {
  currentSpace,
  pathForSpace,
  visibleSpaces,
  type Space,
} from '@/lib/spaces';
import { cn } from '@/lib/utils';

/**
 * Moves between the spaces of Funges: the current space's name on a pill of
 * its own colour, and a menu of every space as a tile of its colour, with the
 * Funges mark in that colour and what it holds. Switching opens the page last
 * seen in that space. Draws nothing while only one space is shown (the live
 * site, until Huerta launches).
 */
export const SpaceSwitcher = ({ className }: { className?: string }) =>
  visibleSpaces().length > 1 ? <SpaceMenu className={className} /> : null;

function SpaceMenu({ className }: { className?: string }) {
  const { t } = useTranslation('sidebar');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const current = currentSpace(pathname);
  const name = (space: Space) => t(`spaces.${space}.name`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          data-space={current}
          className={cn(
            'justify-start gap-2 rounded-full bg-band pl-4 pr-3 font-display text-lg font-semibold text-band-foreground hover:bg-band hover:text-band-foreground hover:brightness-110 dark:bg-band dark:hover:bg-band dark:hover:text-band-foreground',
            className
          )}
          aria-label={t('spaces.switch', { space: name(current) })}
        >
          <span>{name(current)}</span>
          <ChevronDown className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        className='flex w-72 flex-col gap-1.5 p-1.5'
      >
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={space =>
            navigate({ to: pathForSpace(space as Space) })
          }
          className='flex flex-col gap-1.5'
        >
          {visibleSpaces().map(space => (
            <DropdownMenuPrimitive.RadioItem
              key={space}
              value={space}
              data-space={space}
              className='flex min-h-16 cursor-default select-none items-center gap-3 rounded-xl bg-band p-3 text-band-foreground outline-hidden transition-[filter] duration-base data-[highlighted]:brightness-115 data-[highlighted]:ring-2 data-[highlighted]:ring-band-foreground/60 data-[highlighted]:ring-inset'
            >
              <SpaceMark space={space} />
              <span className='flex min-w-0 flex-1 flex-col'>
                <span className='font-display text-base font-semibold'>
                  {name(space)}
                </span>
                <span className='text-xs text-band-foreground/80'>
                  {t(`spaces.${space}.tagline`)}
                </span>
              </span>
              <DropdownMenuPrimitive.ItemIndicator className='flex size-6 shrink-0 items-center justify-center rounded-full bg-band-foreground text-band'>
                <Check className='size-4' />
              </DropdownMenuPrimitive.ItemIndicator>
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SpaceDot } from '@/components/SpaceDot';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from '@/lib/icons';
import {
  currentSpace,
  pathForSpace,
  visibleSpaces,
  type Space,
} from '@/lib/spaces';
import { cn } from '@/lib/utils';

/**
 * Moves between the spaces of Funges: the current space's name, and a menu of
 * every space with what it is for. Switching opens the page last seen in that
 * space. Draws nothing while only one space is shown (the live site, until
 * Huerta launches).
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
          className={cn(
            'justify-start gap-2 font-display text-lg font-semibold text-primary-text',
            className
          )}
          aria-label={t('spaces.switch', { space: name(current) })}
        >
          <SpaceDot space={current} />
          <span>{name(current)}</span>
          <ChevronDown className='size-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='w-64'>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={space =>
            navigate({ to: pathForSpace(space as Space) })
          }
        >
          {visibleSpaces().map(space => (
            <DropdownMenuRadioItem
              key={space}
              value={space}
              className='min-h-11 gap-3'
            >
              <SpaceDot space={space} />
              <span className='flex flex-col'>
                <span className='font-semibold'>{name(space)}</span>
                <span className='text-xs text-muted-foreground'>
                  {t(`spaces.${space}.tagline`)}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { CategoryChips } from '@/components/CategoryChips';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BAND_SURFACE_CLASS } from '@/lib/band-surface';
import {
  CROPS,
  huertaImage,
  KINDS,
  STATUS_GROUPS,
  type PlaceAdvice,
  type StatusGroup,
} from '@/lib/huerta';
import { ChevronDown, Search, X } from '@/lib/icons';
import { DURATION_BASE, EASE_STANDARD } from '@/lib/motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

// The panel unmounts on close, so the filters live here, as in Terra's panel.
// ponytail: module scope = remembered for the session, not across reloads.
let lastKind = 'all';
let lastStatus = 'all';

const photo = (id: string) => huertaImage(`crops/${id}`);

/** The garden map's crop control: Terra's species tile and its full-screen
 *  panel (SpeciesSelector, SpeciesSelectorFullscreen), for crops. The panel
 *  filters by kind and, where the map is looked at, by what goes in now. */
export function HuertaCropPicker({
  crop,
  onPick,
  advice,
  onOpen,
}: {
  crop: string;
  onPick: (crop: string) => void;
  /** The advice where the map is looked at: undefined while it loads, null
   *  where Huerta has none. */
  advice?: PlaceAdvice | null;
  onOpen?: () => void;
}) {
  const { t } = useTranslation('huerta');
  const [isOpen, setIsOpen] = useState(false);
  const selected = CROPS.find(c => c.id === crop);
  const name = t(`crops.${crop}`);
  return (
    <div className='relative'>
      <motion.button
        type='button'
        onClick={() => {
          if (!isOpen) onOpen?.();
          setIsOpen(!isOpen);
        }}
        aria-haspopup='dialog'
        aria-expanded={isOpen}
        aria-label={`${t('map.crop')}: ${name}`}
        className={cn(
          'elevation-raised elevation-interactive focus-ring',
          BAND_SURFACE_CLASS,
          'flex h-16 items-center gap-3 rounded-card py-2 pl-2 pr-3 text-left',
          'max-w-[min(18rem,calc(100vw-5.5rem))]'
        )}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        <span
          aria-hidden='true'
          className='relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-secondary'
        >
          <img
            key={crop}
            src={photo(crop)}
            alt=''
            className='absolute inset-0 h-full w-full object-cover object-center'
            onError={e => {
              e.currentTarget.hidden = true;
            }}
          />
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-sm font-semibold leading-tight text-happy-50'>
            {name}
          </span>
          {selected ? (
            <span className='mt-1 block truncate text-xs italic leading-tight text-happy-100'>
              {selected.scientific}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden='true'
          className={cn(
            'h-4 w-4 flex-shrink-0 text-happy-100 transition-transform duration-base',
            isOpen && 'rotate-180'
          )}
        />
      </motion.button>
      <AnimatePresence>
        {isOpen && (
          <Panel
            crop={crop}
            advice={advice}
            onPick={id => {
              onPick(id);
              setIsOpen(false);
            }}
            onClose={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Panel({
  crop,
  advice,
  onPick,
  onClose,
}: {
  crop: string;
  advice?: PlaceAdvice | null;
  onPick: (crop: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('huerta');
  const isMobile = useIsMobile();
  const [term, setTerm] = useState('');
  const [kind, setKindState] = useState(lastKind);
  const [status, setStatusState] = useState(lastStatus);
  const setKind = (value: string) => {
    lastKind = value;
    setKindState(value);
  };
  const setStatus = (value: string) => {
    lastStatus = value;
    setStatusState(value);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  // The status filter needs the place's advice; without it, every crop shows.
  const byStatus = advice && status !== 'all';
  const shown = CROPS.map(c => ({
    ...c,
    name: t(`crops.${c.id}`),
  }))
    .filter(c => {
      const text = term.toLowerCase();
      return (
        (c.name.toLowerCase().includes(text) ||
          c.scientific.toLowerCase().includes(text)) &&
        (kind === 'all' || c.kind === kind) &&
        (!byStatus ||
          (STATUS_GROUPS[status as StatusGroup] as string[]).includes(
            advice.crops[c.id]
          ))
      );
    })
    .sort((a, z) => a.name.localeCompare(z.name));

  return createPortal(
    <motion.div
      layoutId='crop-picker'
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 20 }}
      transition={{ duration: DURATION_BASE, ease: EASE_STANDARD }}
      className='fixed inset-0 z-60 flex h-full w-full flex-col bg-black/15 backdrop-blur-lg'
    >
      <div className='flex items-center gap-4 bg-white/3 px-6 py-4 backdrop-blur-lg'>
        <div className='relative mx-auto max-w-md flex-1 lg:max-w-lg xl:max-w-xl'>
          <Search className='absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-white/60' />
          <Input
            type='text'
            placeholder={t('map.search')}
            value={term}
            onChange={e => setTerm(e.target.value)}
            className='h-10 w-full border-white/30 bg-white/20 pl-12 pr-4 text-lg text-white backdrop-blur-sm placeholder:text-white/60 focus:border-white/50 focus:ring-white/20'
            autoFocus={!isMobile}
          />
        </div>
        <Button
          variant='ghost'
          size='icon'
          onClick={onClose}
          aria-label={t('map.close')}
          className='flex-shrink-0 border-white/30 bg-white/20 text-white hover:border-white/50 hover:bg-white/40'
        >
          <X className='size-5' />
        </Button>
      </div>

      <div className='flex flex-col gap-2 bg-white/3 px-6 py-3 backdrop-blur-lg'>
        <CategoryChips
          tone='glass'
          chips={KINDS.map(value => ({
            value,
            label: t(`kinds.${value}`),
            icon: huertaImage(`kinds/${value}`),
          }))}
          value={kind}
          onChange={setKind}
        />
        {advice ? (
          <CategoryChips
            tone='glass'
            chips={(['all', 'now', 'wait', 'over'] as const).map(value => ({
              value,
              label:
                value === 'all' ? t('kinds.all') : t(`map.legend.${value}`),
            }))}
            value={status}
            onChange={setStatus}
          />
        ) : null}
        <div className='mt-1 text-center text-sm text-white/60'>
          {t('count', { count: shown.length })}
          {advice ? ` · ${t('map.place', { place: advice.place })}` : null}
        </div>
      </div>

      <div className='flex-1 overflow-hidden bg-white/3 backdrop-blur-lg'>
        <div className='h-full overflow-y-auto p-6'>
          {shown.length === 0 ? (
            <div className='py-12 text-center text-white/80'>
              <Search className='mx-auto mb-4 h-16 w-16 text-white/40' />
              <p className='text-lg font-medium'>{t('map.noResults')}</p>
              <Button
                variant='outline'
                onClick={() => {
                  setTerm('');
                  setKind('all');
                  setStatus('all');
                }}
                className='mt-4 border-white/30 bg-white/20 text-white hover:border-white/50 hover:bg-white/30'
              >
                {t('map.clearFilters')}
              </Button>
            </div>
          ) : (
            <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'>
              {shown.map(c => {
                const isSelected = c.id === crop;
                return (
                  <motion.button
                    key={c.id}
                    type='button'
                    onClick={() => onPick(c.id)}
                    title={c.name}
                    className={cn(
                      'group relative flex min-h-[140px] flex-col items-center justify-center rounded-card border-0 bg-card p-4 text-center transition-all duration-base hover:shadow-[0_6px_20px_rgba(0,0,0,0.14)]',
                      'hover:scale-105 active:scale-95',
                      isSelected
                        ? 'scale-105 bg-secondary shadow-[0_6px_20px_rgba(0,0,0,0.14)]'
                        : 'shadow-[0_2px_16px_rgba(0,0,0,0.10)]'
                    )}
                  >
                    {isSelected && (
                      <div className='absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-happy-600 shadow-[0_2px_8px_rgba(0,0,0,0.18)]'>
                        <div className='h-3 w-3 rounded-full bg-white' />
                      </div>
                    )}
                    <div className='relative mb-3 h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-secondary transition-transform duration-base group-hover:scale-110'>
                      <img
                        src={photo(c.id)}
                        alt=''
                        className='h-full w-full object-cover object-center'
                        loading='lazy'
                      />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <span
                        className={cn(
                          'mb-1 block break-words text-sm font-semibold leading-tight text-foreground',
                          isSelected && 'text-secondary-foreground'
                        )}
                      >
                        {c.name}
                      </span>
                      <span className='block break-words text-xs italic leading-tight text-muted-foreground'>
                        {c.scientific}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>,
    document.body
  );
}

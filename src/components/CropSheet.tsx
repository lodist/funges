import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  cropReasons,
  weekday,
  type Crop,
  type CropNeeds,
  type PlaceAdvice,
} from '@/lib/huerta';
import { fetchNeeds, huertaApiConfigured } from '@/lib/huerta-api';
import { Check, Clock } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { MonthCell } from '@/components/MonthCell';
import type { CropYear } from '@/lib/huerta-api';

interface CropSheetProps {
  crop: Crop | null;
  advice: PlaceAdvice;
  /** Its months at the place, when known. */
  year?: CropYear;
  /** The crop's photo, as the card shows it. */
  image: (crop: Crop) => string;
  onClose: () => void;
}

/** One crop at this place: why it is or isn't for this week, and how to grow
 *  it. Opened from its card, like a species sheet in Terra. */
export function CropSheet({
  crop,
  advice,
  year,
  image,
  onClose,
}: CropSheetProps) {
  return (
    <Dialog open={crop !== null} onOpenChange={open => !open && onClose()}>
      {crop ? (
        <SheetBody crop={crop} advice={advice} year={year} image={image} />
      ) : null}
    </Dialog>
  );
}

function SheetBody({
  crop,
  advice,
  year,
  image,
}: Omit<CropSheetProps, 'crop' | 'onClose'> & { crop: Crop }) {
  const { t, i18n } = useTranslation('huerta');
  const [need, setNeed] = useState<CropNeeds>();
  useEffect(() => {
    if (!huertaApiConfigured) return;
    let live = true;
    fetchNeeds()
      .then(needs => live && setNeed(needs[crop.id]))
      .catch(() => {}); // the sheet still says the status and how to grow it
    return () => {
      live = false;
    };
  }, [crop.id]);

  const status = advice.crops[crop.id];
  const reasons = cropReasons(status, advice, need);
  const label =
    status === 'now' ? t(`sheet.${crop.how}Now`) : t(`status.${status}`);

  return (
    <DialogContent className='sm:max-w-3xl'>
      <div className='grid gap-6 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'>
        <img
          src={image(crop)}
          alt=''
          className='aspect-square w-full rounded-card bg-muted object-cover'
        />
        <div className='flex min-w-0 flex-col gap-5'>
          {/* The close button floats over the top right; the header keeps
              clear of it. */}
          <DialogHeader className='gap-1 pr-12 text-left sm:text-left'>
            <DialogTitle className='text-3xl leading-tight font-semibold hyphens-auto break-words'>
              {t(`crops.${crop.id}`)}
            </DialogTitle>
            <DialogDescription className='text-base italic'>
              {crop.scientific}
            </DialogDescription>
          </DialogHeader>
          <Badge
            variant={status === 'now' ? 'default' : 'secondary'}
            className='self-start'
          >
            {label}
          </Badge>
          <section className='flex flex-col gap-2'>
            <p className='type-micro text-muted-foreground'>
              {t('sheet.week', { place: advice.place })}
            </p>
            <ul className='flex flex-col gap-2'>
              {reasons.map(reason => {
                const Icon = reason.ok ? Check : Clock;
                return (
                  <li key={reason.key} className='flex gap-2 text-foreground'>
                    <Icon
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        reason.ok
                          ? 'text-primary-text'
                          : 'text-muted-foreground'
                      )}
                    />
                    <span>
                      {t(
                        `sheet.why.${reason.key}`,
                        reason.key === 'frostLater'
                          ? {
                              night: weekday(
                                String(reason.values?.night),
                                i18n.language
                              ),
                            }
                          : reason.values
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
      {year ? <YearStrip year={year} place={advice.place} /> : null}
      <Facts crop={crop} need={need} />
      <p className='text-xs text-muted-foreground'>{t('sheet.source')}</p>
    </DialogContent>
  );
}

/** Its year at the place: the species sheet's month strip, sowing dark,
 *  harvest light, this month ringed. */
function YearStrip({ year, place }: { year: CropYear; place: string }) {
  const { t, i18n } = useTranslation('huerta');
  const thisMonth = new Date().getMonth();
  const letter = new Intl.DateTimeFormat(i18n.language, { month: 'narrow' });
  const name = new Intl.DateTimeFormat(i18n.language, { month: 'long' });
  const said = (mask: number) =>
    Array.from({ length: 12 }, (_, m) => m)
      .filter(m => (mask >> m) & 1)
      .map(m => name.format(new Date(2026, m, 1)))
      .join(', ');
  return (
    <section className='flex flex-col gap-2'>
      <p className='type-micro text-muted-foreground'>
        {t('sheet.year', { place })}
      </p>
      <ol aria-hidden='true' className='grid grid-cols-12 gap-1'>
        {Array.from({ length: 12 }, (_, m) => (
          <li key={m} className='flex flex-col items-center gap-1.5'>
            <MonthCell
              sow={Boolean((year.sow >> m) & 1)}
              harvest={Boolean((year.harvest >> m) & 1)}
              now={m === thisMonth}
              className='h-2 rounded-full'
            />
            <span
              className={cn(
                'text-xs',
                m === thisMonth
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {letter.format(new Date(2026, m, 1))}
            </span>
          </li>
        ))}
      </ol>
      <p className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
        <span className='flex items-center gap-1.5'>
          <MonthCell
            sow
            harvest={false}
            now={false}
            className='h-2 w-4 rounded-full'
          />
          {t('year.sow')}
        </span>
        {year.harvest ? (
          <span className='flex items-center gap-1.5'>
            <MonthCell
              sow={false}
              harvest
              now={false}
              className='h-2 w-4 rounded-full'
            />
            {t('year.harvest')}
          </span>
        ) : null}
      </p>
      {/* The strip is drawn for the eye; the months are said in words. */}
      <p className='sr-only'>
        {t('year.sow')}: {said(year.sow)}.{' '}
        {year.harvest ? `${t('year.harvest')}: ${said(year.harvest)}.` : ''}
      </p>
    </section>
  );
}

/** How to grow it: depth, spacing, place and when it is ready. */
function Facts({ crop, need }: { crop: Crop; need?: CropNeeds }) {
  const { t } = useTranslation('huerta');
  const days = need?.days ?? null;
  const ready = crop.note
    ? t(`sheet.ready.${crop.note}`)
    : days === null
      ? null
      : crop.kind === 'flower'
        ? t('sheet.ready.flowers', { count: Math.round(days / 7) })
        : crop.kind === 'cover'
          ? t('sheet.ready.cover', { count: Math.round(days / 7) })
          : days >= 84
            ? t('sheet.ready.months', { count: Math.round(days / 30) })
            : t('sheet.ready.weeks', { count: Math.round(days / 7) });
  const facts = [
    {
      key: 'depth',
      value:
        crop.depth === null
          ? t('sheet.depthPot')
          : t('sheet.depthCm', { value: crop.depth }),
    },
    {
      key: 'spacing',
      value:
        crop.spacing === null
          ? t('sheet.scatter')
          : crop.rows === null
            ? t('sheet.apart', { value: crop.spacing })
            : t('sheet.apartRows', { value: crop.spacing, rows: crop.rows }),
    },
    { key: 'place', value: t(`sheet.sun.${crop.sun}`) },
    ...(ready ? [{ key: 'ready', value: ready }] : []),
  ];
  return (
    <section className='flex flex-col gap-3'>
      <h3 className='text-base font-semibold text-foreground'>
        {t(`sheet.how.${crop.how}`)}
      </h3>
      <dl className='grid grid-cols-2 gap-4 text-sm sm:grid-cols-4'>
        {facts.map(fact => (
          <div key={fact.key}>
            <dt className='type-micro text-muted-foreground'>
              {t(`sheet.facts.${fact.key}`)}
            </dt>
            <dd className='mt-1 text-foreground'>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

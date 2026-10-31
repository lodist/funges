import { useEffect, useState, type ReactNode } from 'react';
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
import { GUIDES, type CropGuide } from '@/lib/crop-guides';
import { harvestFrom } from '@/lib/garden-week';
import { fetchNeeds, huertaApiConfigured } from '@/lib/huerta-api';
import type { CropYear } from '@/lib/huerta-api';
import type { PlaceYear } from '@/lib/huerta-wire';
import { nextYear, partners, type Plan } from '@/lib/planner';
import { PLANT_LOOK } from '@/lib/planner-data';
import { gardenSoil, type Acidity } from '@/lib/soil';
import { Check, Clock } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { MonthCell } from '@/components/MonthCell';

interface CropSheetProps {
  crop: Crop | null;
  advice: PlaceAdvice;
  /** The place's year, when known: each crop's months, the soil, the climate. */
  year?: PlaceYear | null;
  /** The garden at this place: its soil. */
  plan?: Plan | null;
  /** The crop's photo, as the card shows it. */
  image: (crop: Crop) => string;
  onClose: () => void;
}

/** One crop at this place: why it is or isn't for this week and how to grow
 *  it. Opened from its card, like a species sheet in Terra. */
export function CropSheet({
  crop,
  advice,
  year,
  plan,
  image,
  onClose,
}: CropSheetProps) {
  return (
    <Dialog open={crop !== null} onOpenChange={open => !open && onClose()}>
      {crop ? (
        <CropBody
          crop={crop}
          advice={advice}
          year={year}
          plan={plan}
          image={image}
        />
      ) : null}
    </Dialog>
  );
}

/** The sheet's content: in the dialog for a garden, or as the public page
 *  /huerta/species/$id, which has no place (no advice): then it says how to
 *  grow the crop and nothing about this week or a garden. */
export function CropBody({
  crop,
  advice,
  year,
  plan,
  image,
  asPage = false,
}: Omit<CropSheetProps, 'crop' | 'onClose' | 'advice'> & {
  crop: Crop;
  advice?: PlaceAdvice;
  /** A page of its own instead of the dialog (Radix's title parts need one). */
  asPage?: boolean;
}) {
  const { t, i18n } = useTranslation('huerta');
  const Shell = asPage ? 'article' : DialogContent;
  const Title = asPage ? 'h1' : DialogTitle;
  const Latin = asPage ? 'p' : DialogDescription;
  const [need, setNeed] = useState<CropNeeds | undefined>();
  useEffect(() => {
    // The public page asks nothing of the account's API.
    if (!huertaApiConfigured || !advice) return;
    let live = true;
    fetchNeeds()
      .then(needs => live && setNeed(needs[crop.id]))
      .catch(() => {}); // the sheet still says the status and how to grow it
    return () => {
      live = false;
    };
  }, [crop.id, advice]);

  const status = advice?.crops[crop.id];
  const reasons = advice
    ? cropReasons(advice.crops[crop.id], advice, need)
    : [];
  const label =
    status === 'now' ? t(`sheet.${crop.how}Now`) : t(`status.${status}`);
  const months = year?.crops[crop.id];
  const guide = GUIDES[crop.id];

  return (
    <Shell className={asPage ? 'flex flex-col gap-6' : 'sm:max-w-3xl'}>
      <div className='grid gap-6 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'>
        <img
          src={image(crop)}
          alt=''
          className='aspect-square w-full rounded-card bg-muted object-cover'
        />
        <div className='flex min-w-0 flex-col gap-5'>
          {/* The close button floats over the top right; the header keeps
              clear of it. */}
          <DialogHeader
            className={cn('gap-1 text-left sm:text-left', !asPage && 'pr-12')}
          >
            <Title className='text-3xl leading-tight font-semibold hyphens-auto break-words'>
              {t(`crops.${crop.id}`)}
            </Title>
            <Latin className='text-base text-muted-foreground italic'>
              {crop.scientific}
            </Latin>
          </DialogHeader>
          {guide ? (
            <p className='text-foreground'>{t(`grow.${crop.id}.about`)}</p>
          ) : null}
          {advice ? (
            <>
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
                      <li
                        key={reason.key}
                        className='flex gap-2 text-foreground'
                      >
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
            </>
          ) : null}
        </div>
      </div>
      {months && advice ? (
        <YearStrip year={months} place={advice.place} />
      ) : null}
      <Facts crop={crop} need={need} harvest={months?.harvest} />
      <Weather
        crop={crop}
        need={need}
        hardy={year?.hardy?.[crop.id]}
        soil={plan ? gardenSoil(plan.garden, year?.soil).acidity : null}
      />
      {guide ? <Care crop={crop} guide={guide} /> : null}
      <Neighbours crop={crop} />
      {guide ? <Harvest crop={crop} /> : null}
      <p className='text-xs text-muted-foreground'>
        {t('sheet.source')}
        {guide ? ` ${t(`grow.${crop.id}.source`)}` : null}
      </p>
    </Shell>
  );
}

/** A part of the sheet under its heading. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='flex flex-col gap-3'>
      <h2 className='text-base font-semibold text-foreground'>{title}</h2>
      {children}
    </section>
  );
}

/** Label over its text on a phone, side by side from a tablet up. */
function Rows({
  rows,
}: {
  rows: { key: string; label: string; value: ReactNode }[];
}) {
  return (
    <dl className='flex flex-col gap-4 text-sm sm:gap-3'>
      {rows.map(row => (
        <div
          key={row.key}
          className='grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3'
        >
          <dt className='text-muted-foreground'>{row.label}</dt>
          <dd className='text-foreground'>{row.value}</dd>
        </div>
      ))}
    </dl>
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

/** How to grow it: depth, spacing, place, when it is ready, how tall it
 *  grows and how many to grow. A perennial's, next-year crop's or bulb's
 *  first crop is the month its harvest begins at the place (`harvest`, the
 *  calendar's months), where there is one. */
function Facts({
  crop,
  need,
  harvest,
}: {
  crop: Crop;
  need?: CropNeeds;
  harvest?: number;
}) {
  const { t, i18n } = useTranslation('huerta');
  const days = need?.days ?? null;
  const from = harvestFrom(harvest);
  const ready = crop.note
    ? crop.note === 'perennial' && harvest === 0xfff
      ? t('sheet.ready.perennial_all')
      : from !== null
        ? t(`sheet.ready.${crop.note}_at`, {
            month: new Intl.DateTimeFormat(i18n.language, {
              month: 'long',
            }).format(new Date(2026, from, 1)),
          })
        : t(`sheet.ready.${crop.note}`)
    : days === null
      ? null
      : crop.kind === 'flower'
        ? t('sheet.ready.flowers', { count: Math.round(days / 7) })
        : crop.kind === 'cover'
          ? t('sheet.ready.cover', { count: Math.round(days / 7) })
          : days >= 84
            ? t('sheet.ready.months', { count: Math.round(days / 30) })
            : t('sheet.ready.weeks', { count: Math.round(days / 7) });
  const height = PLANT_LOOK[crop.id]?.height;
  const each = GUIDES[crop.id]?.perPerson;
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
    ...(height
      ? [
          {
            key: 'height',
            value: new Intl.NumberFormat(i18n.language, {
              style: 'unit',
              unit: height >= 1 ? 'meter' : 'centimeter',
              maximumFractionDigits: 1,
            }).format(height >= 1 ? height : Math.round(height * 100)),
          },
        ]
      : []),
    ...(each
      ? [
          {
            key: 'howMany',
            value: each.keep
              ? t('grow.perPersonKeep', {
                  from: each.fresh[0],
                  to: each.fresh[1],
                  keepFrom: each.keep[0],
                  keepTo: each.keep[1],
                })
              : t('grow.perPerson', {
                  from: each.fresh[0],
                  to: each.fresh[1],
                }),
          },
        ]
      : []),
  ];
  return (
    <section className='flex flex-col gap-3'>
      <h2 className='text-base font-semibold text-foreground'>
        {t(`sheet.how.${crop.how}`)}
      </h2>
      <dl className='grid grid-cols-2 gap-4 text-sm sm:grid-cols-3'>
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

/** Whether the soil's pH suits a crop's range; the soil classes part at
 *  pH 6 and 7.5 (lib/soil). */
const phFit = (soil: Acidity, [low, high]: [number, number]) =>
  soil === 'acid' && low >= 6
    ? 'acid'
    : soil === 'alkaline' && high < 7.5
      ? 'alkaline'
      : 'fits';

/** The cold it takes, the warmth it goes in at, and the soil it likes. */
function Weather({
  crop,
  need,
  hardy,
  soil,
}: {
  crop: Crop;
  need?: CropNeeds;
  /** The coldest it survives, °C, where known. */
  hardy?: number | null;
  /** The garden's soil; null without a garden. */
  soil: Acidity | null;
}) {
  const { t, i18n } = useTranslation('huerta');
  const num = (v: number) => new Intl.NumberFormat(i18n.language).format(v);
  const rows: { key: string; label: string; value: ReactNode }[] = [];
  if (need) {
    rows.push({
      key: 'frost',
      label: t('grow.facts.frost'),
      value:
        need.frost === 'tender'
          ? t('grow.frost.tender')
          : hardy != null
            ? t('grow.frost.to', { value: num(hardy) })
            : t(`grow.frost.${need.frost}`),
    });
    const [min, max] = need.soil;
    const warmth = [
      min === null
        ? null
        : crop.how === 'plant'
          ? t('grow.warmth.plant', { min: num(min) })
          : max === null
            ? t('grow.warmth.sow', { min: num(min) })
            : t('grow.warmth.sowRange', { min: num(min), max: num(max) }),
      need.night === null
        ? null
        : t('grow.warmth.nights', { night: num(need.night) }),
    ].filter(Boolean);
    if (warmth.length)
      rows.push({
        key: 'warmth',
        label: t('grow.facts.warmth'),
        value: warmth.join(' '),
      });
  }
  const ph = GUIDES[crop.id]?.ph;
  if (ph)
    rows.push({
      key: 'ph',
      label: t('grow.facts.ph'),
      value: [
        t('grow.ph.range', { from: num(ph[0]), to: num(ph[1]) }),
        soil ? t(`grow.ph.${phFit(soil, ph)}`) : null,
      ]
        .filter(Boolean)
        .join(' '),
    });
  if (rows.length === 0) return null;
  return (
    <Part title={t('grow.weather')}>
      <Rows rows={rows} />
    </Part>
  );
}

/** Water, feeding and pots. */
function Care({ crop, guide }: { crop: Crop; guide: CropGuide }) {
  const { t } = useTranslation('huerta');
  return (
    <Part title={t('grow.care')}>
      <Rows
        rows={[
          {
            key: 'water',
            label: t('grow.facts.water'),
            value: t(`grow.${crop.id}.water`),
          },
          {
            key: 'feed',
            label: t('grow.facts.feed'),
            value: t(`grow.${crop.id}.feed`),
          },
          {
            key: 'pot',
            label: t('grow.facts.pot'),
            value:
              guide.pot === null
                ? t('grow.noPot')
                : t('grow.pot', { value: guide.pot }),
          },
        ]}
      />
    </Part>
  );
}

/** Its good and bad neighbours, and what follows it in its bed next year. */
function Neighbours({ crop }: { crop: Crop }) {
  const { t, i18n } = useTranslation('huerta');
  const names = new Intl.ListFormat(i18n.language, { type: 'conjunction' });
  const pairs = partners(crop.id);
  const group = (bad: boolean) => {
    const these = pairs.filter(p => p.bad === bad);
    return these.length === 0
      ? []
      : [
          {
            key: bad ? 'bad' : 'good',
            label: t(bad ? 'grow.apartFrom' : 'grow.goodWith'),
            value: (
              <ul className='flex flex-col gap-2'>
                {these.map(p => (
                  <li key={p.key}>
                    {/* A rule over most vegetables (fennel's) says so itself. */}
                    {p.with.length <= 8 ? (
                      <span className='font-semibold'>
                        {names.format(p.with.map(c => t(`crops.${c}`)))}:{' '}
                      </span>
                    ) : null}
                    {t(`planner.rule.${p.key}`)}{' '}
                    <span className='text-muted-foreground'>
                      ({t(`planner.basis.${p.basis}`)})
                    </span>
                  </li>
                ))}
              </ul>
            ),
          },
        ];
  };
  return (
    <Part title={t('planner.neighbours')}>
      <Rows
        rows={[
          ...group(false),
          ...group(true),
          {
            key: 'next',
            label: t('grow.facts.nextYear'),
            value: t(`planner.next.${nextYear(crop.id)}`),
          },
        ]}
      />
    </Part>
  );
}

/** When and how to pick it, how it keeps, and what goes wrong. */
function Harvest({ crop }: { crop: Crop }) {
  const { t, i18n } = useTranslation('huerta');
  const keeps = `grow.${crop.id}.keeps`;
  const problems = t(`grow.${crop.id}.problems`, {
    returnObjects: true,
  }) as { name: string; fix: string }[];
  return (
    <>
      <Part title={t(`grow.harvest.${crop.kind}`)}>
        <p className='text-sm text-foreground'>
          {t(`grow.${crop.id}.harvest`)}
          {i18n.exists(keeps) ? ` ${t(keeps)}` : null}
        </p>
      </Part>
      <Part title={t('grow.problems')}>
        <ul className='flex flex-col gap-2 text-sm text-foreground'>
          {problems.map(p => (
            <li key={p.name}>
              <span className='font-semibold'>{p.name}.</span> {p.fix}
            </li>
          ))}
        </ul>
      </Part>
    </>
  );
}

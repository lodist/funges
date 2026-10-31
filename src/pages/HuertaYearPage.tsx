import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CategoryChips } from '@/components/CategoryChips';
import { PlacePicker } from '@/components/PlacePicker';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { useHuertaYear } from '@/hooks/use-huerta-year';
import { CROPS, huertaImage, KINDS } from '@/lib/huerta';
import type { Season } from '@/lib/huerta-wire';
import {
  huertaApiConfigured,
  plain,
  savedPlace,
  savePlace,
} from '@/lib/huerta-api';
import { MapPinned, Search } from '@/lib/icons';
import { ScopeHeader } from '@/components/ScopeHeader';
import { cn } from '@/lib/utils';

/** The calendar: every crop's sowing and harvest months at the visitor's place,
 *  like the back of a seed packet, but for this climate. */
export default function HuertaYearPage() {
  // Another place: the page starts afresh, as My garden does.
  const [moves, setMoves] = useState(0);
  return <Calendar key={moves} onMoved={() => setMoves(n => n + 1)} />;
}

function Calendar({ onMoved }: { onMoved: () => void }) {
  const { t, i18n } = useTranslation('huerta');
  const year = useHuertaYear();
  // Choosing the place, open under the header.
  const [picking, setPicking] = useState(false);
  const [kind, setKind] = useState<string>('all');
  const [query, setQuery] = useState('');
  const hasPlace = huertaApiConfigured && savedPlace() !== null;
  const thisMonth = new Date().getMonth();
  const backdrop = monthBackdrop(thisMonth);
  const letter = new Intl.DateTimeFormat(i18n.language, { month: 'narrow' });
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'long' });
  const short = new Intl.DateTimeFormat(i18n.language, { month: 'short' });
  // By its name here or its Latin one, accents and case aside, as on Species.
  const q = plain(query);
  const shown = CROPS.filter(
    c =>
      (kind === 'all' || c.kind === kind) &&
      (!q ||
        plain(t(`crops.${c.id}`)).includes(q) ||
        plain(c.scientific).includes(q))
  );
  const rows = shown.filter(c => year?.crops[c.id]?.sow);
  const absent = shown.filter(c => year && !year.crops[c.id]?.sow);

  return (
    <>
      <SEO
        title={t('year.title')}
        description={t('year.description')}
        canonicalUrl={`${import.meta.env.BASE_URL}huerta/planting-calendar`}
      />
      <div className='container mx-auto max-w-7xl px-4 py-8'>
        <header className='mb-8 flex flex-col gap-6'>
          <ScopeHeader
            title={t('year.title')}
            scopeLabel={
              year ? t('year.around', { place: year.place }) : undefined
            }
            action={
              huertaApiConfigured ? (
                <Button variant='outline' onClick={() => setPicking(p => !p)}>
                  <MapPinned />
                  {hasPlace ? t('change') : t('planner.choosePlace')}
                </Button>
              ) : null
            }
          />
          {picking ? (
            <PlacePicker
              onPick={chosen => {
                savePlace(chosen);
                onMoved();
              }}
            />
          ) : null}
          {hasPlace && year ? (
            <div>
              <div className='relative lg:w-72'>
                <Search className='pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  type='search'
                  placeholder={t('find.placeholder')}
                  aria-label={t('find.placeholder')}
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  className='pl-11'
                />
              </div>
              <CategoryChips
                chips={KINDS.map(value => ({
                  value,
                  label: t(`kinds.${value}`),
                  icon: huertaImage(`kinds/${value}`),
                }))}
                value={kind}
                onChange={setKind}
                className='mt-4 justify-start'
              />
            </div>
          ) : null}
        </header>

        {!hasPlace ? (
          <p className='text-foreground'>
            {t('year.noPlace')}{' '}
            <Link
              to='/huerta/crops'
              className='font-medium text-primary-text underline underline-offset-4'
            >
              {t('planner.choosePlace')}
            </Link>
          </p>
        ) : !year ? (
          <SkeletonGroup>
            <Skeleton className='h-96 w-full rounded-card' />
          </SkeletonGroup>
        ) : q !== '' && shown.length === 0 ? (
          <div className='mt-10 flex flex-col items-center gap-4 py-12 text-center'>
            <Search className='size-12 text-muted-foreground' />
            <h2 className='text-xl font-semibold text-foreground'>
              {t('find.none')}
            </h2>
            <p className='text-muted-foreground'>{t('find.noneHelp')}</p>
            <Button
              variant='outline'
              onClick={() => {
                setQuery('');
                setKind('all');
              }}
            >
              {t('find.clear')}
            </Button>
          </div>
        ) : (
          <>
            <div className='flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground'>
              <span className='flex items-center gap-2'>
                <span className='h-2 w-6 rounded-full bg-band' />
                {t('year.sow')}
              </span>
              <span className='flex items-center gap-2'>
                <span className='h-2 w-6 rounded-full bg-happy-300' />
                {t('year.harvest')}
              </span>
              <span className='flex items-center gap-2'>
                <span className='h-4 w-3 rounded-sm bg-muted' />
                {t('year.thisMonth', {
                  month: monthName.format(new Date(2026, thisMonth, 1)),
                })}
              </span>
            </div>
            {/* Every month in view, on a phone too: each crop's sowing and its
                harvest as two lanes running through the year, the months
                joined where the season runs on. */}
            <div className='mt-4 rounded-card bg-card p-3 elevation-raised sm:p-4'>
              <table className='w-full table-fixed border-collapse'>
                <colgroup>
                  <col className='w-28 sm:w-52' />
                  <col />
                </colgroup>
                {/* The months stay at the top while the crops scroll by. */}
                <thead>
                  <tr>
                    <th className={cn(HEAD, 'text-left')}>
                      <span className='sr-only'>{t('year.crop')}</span>
                    </th>
                    <th className={HEAD} aria-hidden='true'>
                      <span className='grid grid-cols-12'>
                        {Array.from({ length: 12 }, (_, m) => (
                          <abbr
                            key={m}
                            title={monthName.format(new Date(2026, m, 1))}
                            className={cn(
                              'text-center text-xs font-semibold no-underline',
                              m === thisMonth
                                ? 'rounded-t-md bg-muted text-primary-text'
                                : 'text-muted-foreground'
                            )}
                          >
                            {letter.format(new Date(2026, m, 1))}
                          </abbr>
                        ))}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.flatMap(crop => {
                    const { sow, harvest, seasons } = year.crops[crop.id];
                    // A crop sown in more than one season: a row for each,
                    // named where it has more than one besides overwintering.
                    const lines: {
                      season: Season | null;
                      sow: number;
                      harvest: number;
                    }[] = seasons ?? [{ season: null, sow, harvest }];
                    const named =
                      lines.filter(l => l.season && l.season !== 'overwinter')
                        .length > 1;
                    return lines.map((line, k) => {
                      // What tells a row's harvest from the same season's:
                      // its season, a perennial's or bulb's own line from
                      // its sheet, or that it overwinters.
                      const caption =
                        line.season === 'overwinter' ||
                        (named && line.season !== null)
                          ? t(`year.season.${line.season}`)
                          : crop.note
                            ? t(`sheet.ready.${crop.note}`)
                            : harvestFirst(line.sow, line.harvest)
                              ? t('year.season.overwinter')
                              : null;
                      return (
                        <tr
                          key={`${crop.id}-${line.season ?? 'all'}`}
                          className={cn(k === 0 && 'border-t border-border')}
                        >
                          <th
                            scope='row'
                            className='py-2 pr-2 text-left font-normal'
                          >
                            <span className='flex items-center gap-2'>
                              {k === 0 ? (
                                <img
                                  src={huertaImage(`crops/${crop.id}`)}
                                  alt=''
                                  loading='lazy'
                                  className='size-7 shrink-0 rounded-md object-cover sm:size-8'
                                />
                              ) : (
                                // A season under the crop's photo: only as tall
                                // as its bars, so the crop reads as one block.
                                <span className='w-7 shrink-0 sm:w-8' />
                              )}
                              <span className='flex min-w-0 flex-col'>
                                <span
                                  className={cn(
                                    'line-clamp-2 text-xs leading-tight font-medium break-words hyphens-auto text-foreground sm:text-sm',
                                    k > 0 && 'sr-only'
                                  )}
                                >
                                  {t(`crops.${crop.id}`)}
                                </span>
                                {caption ? (
                                  <span className='text-xs leading-tight break-words hyphens-auto text-muted-foreground'>
                                    {caption}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </th>
                          <td className='py-2' style={backdrop}>
                            {/* The year as twelve columns, each season one bar. */}
                            <span
                              aria-hidden='true'
                              className='grid grid-cols-12 grid-rows-[0.5rem_0.5rem] gap-y-0.5 sm:grid-rows-[0.625rem_0.625rem]'
                            >
                              {runs(line.sow).map(([from, to]) => (
                                <span
                                  key={`s${from}`}
                                  className='mx-px rounded-full bg-band'
                                  style={{
                                    gridColumn: `${from + 1} / ${to + 2}`,
                                    gridRow: 1,
                                  }}
                                />
                              ))}
                              {runs(line.harvest).map(([from, to]) => (
                                <span
                                  key={`h${from}`}
                                  className='mx-px rounded-full bg-happy-300'
                                  style={{
                                    gridColumn: `${from + 1} / ${to + 2}`,
                                    gridRow: 2,
                                  }}
                                />
                              ))}
                            </span>
                            <span className='sr-only'>
                              {[
                                [t('year.sow'), line.sow],
                                [
                                  line.season === 'overwinter'
                                    ? `${t('year.harvest')} (${t('year.nextYear')})`
                                    : t('year.harvest'),
                                  line.harvest,
                                ],
                              ]
                                .filter(([, months]) => months)
                                .map(
                                  ([what, months]) =>
                                    `${what}: ${runs(months as number)
                                      .map(([from, to]) =>
                                        from === to
                                          ? short.format(
                                              new Date(2026, from, 1)
                                            )
                                          : `${short.format(new Date(2026, from, 1))}–${short.format(new Date(2026, to, 1))}`
                                      )
                                      .join(', ')}`
                                )
                                .join('. ')}
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
            {absent.length > 0 ? (
              <p className='mt-4 text-sm text-muted-foreground'>
                {t('year.notHere', {
                  crops: absent.map(c => t(`crops.${c.id}`)).join(', '),
                })}
              </p>
            ) : null}
            <p className='mt-4 text-sm text-muted-foreground'>
              {t('year.note')}
            </p>
          </>
        )}
      </div>
    </>
  );
}

const HEAD =
  'sticky top-0 z-10 bg-card pt-2 pb-2 shadow-[inset_0_-1px_0_var(--color-border)]';

/** Behind a crop's bars: this month shaded through the whole row, and a faint
 *  line where each month begins, to follow a bar up to its month. */
const monthBackdrop = (month: number) => ({
  backgroundImage: [
    `linear-gradient(to right, transparent calc(100% * ${month} / 12), var(--color-muted) calc(100% * ${month} / 12) calc(100% * ${month + 1} / 12), transparent calc(100% * ${month + 1} / 12))`,
    'linear-gradient(to right, color-mix(in oklab, var(--color-border) 70%, transparent) 1px, transparent 1px)',
  ].join(', '),
  backgroundSize: '100% 100%, calc(100% / 12) 100%',
});

/** Every harvest month before the first sowing month: the harvest of a crop
 *  sown to stand the winter, the following year (winter rye). */
const harvestFirst = (sow: number, harvest: number) =>
  harvest > 0 && sow > 0 && harvest < (sow & -sow);

/** A crop's months (bit 0 = January) as runs of consecutive months, [first, last]. */
const runs = (months: number) => {
  const out: [number, number][] = [];
  for (let m = 0; m < 12; m++)
    if ((months >> m) & 1) {
      const last = out[out.length - 1];
      if (last && last[1] === m - 1) last[1] = m;
      else out.push([m, m]);
    }
  return out;
};

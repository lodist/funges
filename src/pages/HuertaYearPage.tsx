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
        canonicalUrl={`${import.meta.env.BASE_URL}huerta/year`}
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
              to='/huerta/species'
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
                <thead>
                  <tr>
                    <th className='pb-2 text-left'>
                      <span className='sr-only'>{t('year.crop')}</span>
                    </th>
                    <th className='pb-2' aria-hidden='true'>
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
                  {rows.map(crop => {
                    const { sow, harvest } = year.crops[crop.id];
                    return (
                      <tr key={crop.id} className='border-t border-border'>
                        <th
                          scope='row'
                          className='py-2 pr-2 text-left font-normal'
                        >
                          <span className='flex items-center gap-2'>
                            <img
                              src={huertaImage(`crops/${crop.id}`)}
                              alt=''
                              loading='lazy'
                              className='size-7 shrink-0 rounded-md object-cover sm:size-8'
                            />
                            <span className='line-clamp-2 text-xs leading-tight font-medium text-foreground sm:text-sm'>
                              {t(`crops.${crop.id}`)}
                            </span>
                          </span>
                        </th>
                        <td className='py-2'>
                          {/* The year as twelve columns: this month's shaded
                              through the row, each season one bar over it. */}
                          <span
                            aria-hidden='true'
                            className='grid grid-cols-12 grid-rows-[0.5rem_0.5rem] gap-y-0.5 sm:grid-rows-[0.625rem_0.625rem]'
                          >
                            <span
                              className='-my-2 bg-muted'
                              style={{
                                gridColumn: thisMonth + 1,
                                gridRow: '1 / 3',
                              }}
                            />
                            {runs(sow).map(([from, to]) => (
                              <span
                                key={`s${from}`}
                                className='mx-px rounded-full bg-band'
                                style={{
                                  gridColumn: `${from + 1} / ${to + 2}`,
                                  gridRow: 1,
                                }}
                              />
                            ))}
                            {runs(harvest).map(([from, to]) => (
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
                              [t('year.sow'), sow],
                              [t('year.harvest'), harvest],
                            ]
                              .filter(([, months]) => months)
                              .map(
                                ([what, months]) =>
                                  `${what}: ${runs(months as number)
                                    .map(([from, to]) =>
                                      from === to
                                        ? short.format(new Date(2026, from, 1))
                                        : `${short.format(new Date(2026, from, 1))}–${short.format(new Date(2026, to, 1))}`
                                    )
                                    .join(', ')}`
                              )
                              .join('. ')}
                          </span>
                        </td>
                      </tr>
                    );
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

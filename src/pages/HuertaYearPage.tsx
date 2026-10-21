import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CategoryChips } from '@/components/CategoryChips';
import SEO from '@/components/SEO';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { useHuertaYear } from '@/hooks/use-huerta-year';
import { CROPS, huertaImage, KINDS } from '@/lib/huerta';
import { huertaApiConfigured, savedPlace } from '@/lib/huerta-api';
import { cn } from '@/lib/utils';
import { MonthCell } from '@/components/MonthCell';

/** "Your year": every crop's sowing and harvest months at the visitor's place,
 *  like the back of a seed packet, but for this climate. */
export default function HuertaYearPage() {
  const { t, i18n } = useTranslation('huerta');
  const year = useHuertaYear();
  const [kind, setKind] = useState<string>('all');
  const hasPlace = huertaApiConfigured && savedPlace() !== null;
  const thisMonth = new Date().getMonth();
  const letter = new Intl.DateTimeFormat(i18n.language, { month: 'narrow' });
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'long' });
  const shown = CROPS.filter(c => kind === 'all' || c.kind === kind);
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
        <header className='mb-6 flex flex-col gap-2'>
          <h1 className='text-3xl leading-tight font-semibold text-balance text-foreground sm:text-4xl'>
            {t('year.title')}
          </h1>
          <p className='text-muted-foreground'>
            {year ? t('year.around', { place: year.place }) : null}
          </p>
        </header>

        {!hasPlace ? (
          <p className='text-foreground'>
            {t('year.noPlace')}{' '}
            <Link
              to='/huerta'
              className='font-medium text-primary-text underline underline-offset-4'
            >
              {t('planner.choosePlace')}
            </Link>
          </p>
        ) : !year ? (
          <SkeletonGroup>
            <Skeleton className='h-96 w-full rounded-card' />
          </SkeletonGroup>
        ) : (
          <>
            <CategoryChips
              chips={KINDS.map(value => ({
                value,
                label: t(`kinds.${value}`),
                icon: huertaImage(`kinds/${value}`),
              }))}
              value={kind}
              onChange={setKind}
              className='justify-start'
            />
            <div className='mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground'>
              <span className='flex items-center gap-2'>
                <MonthCell
                  sow
                  harvest={false}
                  now={false}
                  className='h-3 w-5'
                />
                {t('year.sow')}
              </span>
              <span className='flex items-center gap-2'>
                <MonthCell
                  sow={false}
                  harvest
                  now={false}
                  className='h-3 w-5'
                />
                {t('year.harvest')}
              </span>
              <span className='flex items-center gap-2'>
                <MonthCell
                  sow={false}
                  harvest={false}
                  now
                  className='h-3 w-5'
                />
                {t('year.thisMonth', {
                  month: monthName.format(new Date(2026, thisMonth, 1)),
                })}
              </span>
            </div>
            <div className='mt-4 overflow-x-auto rounded-card bg-card p-4 elevation-raised'>
              <table className='w-full min-w-[40rem] border-separate border-spacing-x-1 border-spacing-y-2'>
                <thead>
                  <tr>
                    <th className='w-44 text-left'>
                      <span className='sr-only'>{t('year.crop')}</span>
                    </th>
                    {Array.from({ length: 12 }, (_, m) => (
                      <th
                        key={m}
                        scope='col'
                        className={cn(
                          'text-xs font-semibold',
                          m === thisMonth
                            ? 'text-primary-text'
                            : 'text-muted-foreground'
                        )}
                      >
                        <abbr
                          title={monthName.format(new Date(2026, m, 1))}
                          className='no-underline'
                        >
                          {letter.format(new Date(2026, m, 1))}
                        </abbr>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(crop => {
                    const { sow, harvest } = year.crops[crop.id];
                    return (
                      <tr key={crop.id}>
                        <th scope='row' className='text-left font-normal'>
                          <span className='flex items-center gap-3'>
                            <img
                              src={huertaImage(`crops/${crop.id}`)}
                              alt=''
                              loading='lazy'
                              className='size-8 rounded-lg object-cover'
                            />
                            <span className='text-sm font-semibold text-foreground'>
                              {t(`crops.${crop.id}`)}
                            </span>
                          </span>
                        </th>
                        {Array.from({ length: 12 }, (_, m) => (
                          <td key={m}>
                            <MonthCell
                              sow={Boolean((sow >> m) & 1)}
                              harvest={Boolean((harvest >> m) & 1)}
                              now={m === thisMonth}
                              className='h-5'
                            />
                          </td>
                        ))}
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

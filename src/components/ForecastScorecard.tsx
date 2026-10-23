import { useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { useSpeciesData } from '@/data/species';
import { cn } from '@/lib/utils';
import {
  areaKey,
  CHANCE,
  formatDay,
  formatShare,
  timesInTen,
  useScorecard,
  type Tally,
} from '@/lib/scorecard';

/** How often the forecast picked the find's spot, on a track with a tick at
 *  guessing: the species sheet's season strip, read as a meter. */
function HitBar({ share, className }: { share: number; className?: string }) {
  return (
    <span
      aria-hidden='true'
      className={cn('relative block h-2 rounded-full bg-muted', className)}
    >
      <span
        className='absolute inset-y-0 left-0 rounded-full bg-primary-text'
        style={{ width: `${share * 100}%` }}
      />
      <span
        className='absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-foreground'
        style={{ left: `${CHANCE * 100}%` }}
      />
    </span>
  );
}

/** One species' result under its conditions on the species sheet: all
 *  regions together, since one region alone rarely has enough finds. */
export function ScorecardLine({ speciesId }: { speciesId: string }) {
  const { t, i18n } = useTranslation(['species', 'common']);
  const card = useScorecard();
  const tally = card?.all?.species[speciesId];
  if (!card?.all || !tally) return null;

  // The sheet's own pattern: a micro label over a strip, like "Today" over
  // the meter and "Season" over the months.
  return (
    <div className='flex flex-col gap-2'>
      <p className='type-micro text-muted-foreground'>
        {t('sheet.testedLabel', {
          area: t(`common:${areaKey(card.all.from)}`),
          since: formatDay(card.since, i18n.language, 'short'),
        })}
      </p>
      <HitBar share={tally.place} />
      <p className='text-sm text-muted-foreground'>
        <Trans
          t={t}
          i18nKey='sheet.tested'
          values={{
            times: timesInTen(tally.place),
            finds: tally.finds.toLocaleString(i18n.language),
          }}
          components={{ strong: <strong className='text-foreground' /> }}
        />{' '}
        <Link
          to='/data'
          hash='scorecard'
          className='focus-ring font-medium whitespace-nowrap text-primary-text underline underline-offset-2'
        >
          {t('sheet.howWeCheck')}
        </Link>
      </p>
    </div>
  );
}

function Row({
  name,
  tally,
  strong,
}: {
  name: string;
  tally: Tally;
  strong?: boolean;
}) {
  const { t, i18n } = useTranslation('common');
  return (
    // Phones: name and share on one line, the bar under them; wider screens
    // put the bar between them. A long name wraps under itself, the share
    // staying on its first line.
    <li className='grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 sm:grid-cols-[18rem_minmax(0,1fr)_3.5rem]'>
      <span className='min-w-0 text-sm'>
        <span className={cn('text-foreground', strong && 'font-semibold')}>
          {name}
        </span>
        <span className='whitespace-nowrap text-muted-foreground'>
          {' · '}
          {t('data.scorecard.finds', {
            count: tally.finds,
            finds: tally.finds.toLocaleString(i18n.language),
          })}
        </span>
      </span>
      <span className='text-right text-sm font-semibold tabular-nums text-foreground sm:order-last sm:self-center'>
        {formatShare(tally.place, i18n.language)}
      </span>
      <HitBar
        share={tally.place}
        className='col-span-2 self-center sm:col-span-1'
      />
    </li>
  );
}

/** The Data page's proof: every tested mushroom, all regions together, good
 *  or bad, and how the test works. The page's region switch does not apply:
 *  the intro names where the finds came from. Links land on #scorecard. */
export function ForecastScorecard() {
  const { t, i18n } = useTranslation('common');
  const species = useSpeciesData();
  const card = useScorecard();
  const section = useRef<HTMLElement>(null);

  // The page draws this only after its data loads, too late for the router's
  // own jump to the hash.
  const ready = card !== null;
  useEffect(() => {
    if (ready && window.location.hash === '#scorecard') {
      section.current?.scrollIntoView({ block: 'start' });
    }
  }, [ready]);

  if (!card) return null;
  const all = card.all;
  const days = {
    since: formatDay(card.since, i18n.language),
    until: formatDay(card.until, i18n.language),
  };
  const rows = all
    ? Object.entries(all.species)
        .map(([id, tally]) => ({
          id,
          tally,
          name: species.find(s => s.id === id)?.name ?? id,
        }))
        .sort(
          (a, b) =>
            b.tally.place - a.tally.place || a.name.localeCompare(b.name)
        )
    : [];

  return (
    <section
      ref={section}
      id='scorecard'
      aria-labelledby='scorecard-title'
      className='flex scroll-mt-6 flex-col gap-6 border-t border-border pt-8'
    >
      <div className='flex max-w-prose flex-col gap-3'>
        <h2
          id='scorecard-title'
          className='text-2xl leading-tight font-semibold text-foreground'
        >
          {t('data.scorecard.title')}
        </h2>
        <p className='text-muted-foreground'>
          {all
            ? t('data.scorecard.intro', {
                area: t(areaKey(all.from)),
                ...days,
                chance: formatShare(CHANCE, i18n.language),
              })
            : t('data.scorecard.empty')}
        </p>
      </div>

      {all ? (
        <ul className='flex flex-col gap-4'>
          <Row name={t('data.scorecard.all')} tally={all} strong />
          {rows.map(row => (
            <Row key={row.id} name={row.name} tally={row.tally} />
          ))}
        </ul>
      ) : null}

      <div className='flex max-w-prose flex-col gap-2'>
        <h3 className='text-base font-semibold text-foreground'>
          {t('data.scorecard.howTitle')}
        </h3>
        <ul className='list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground'>
          <li>{t('data.scorecard.how.replay')}</li>
          <li>{t('data.scorecard.how.unseen', { since: days.since })}</li>
          <li>{t('data.scorecard.how.spots')}</li>
          <li>{t('data.scorecard.how.everything')}</li>
          <li>
            {t('data.scorecard.how.late', {
              updated: formatDay(card.updated_at, i18n.language),
            })}
          </li>
        </ul>
      </div>
    </section>
  );
}

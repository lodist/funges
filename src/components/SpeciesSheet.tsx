import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScorecardLine } from '@/components/ForecastScorecard';
import { ConditionsMeter } from '@/components/SpeciesSignals';
import { getRecipesBySpecies, type Recipe } from '@/data/recipes';
import type { SpeciesWithTranslations } from '@/data/species';
import { TOXIC_SPECIES, type ToxicSeverity } from '@/data/toxic-species';
import { AlertTriangle, ChefHat, MapPin } from '@/lib/icons';
import { cn, getSpeciesImage } from '@/lib/utils';
import { monthsLabel, seasonMonthSet, speciesSeasons } from '@/lib/seasons';

const SEVERITY_ORDER: ToxicSeverity[] = ['lethal', 'toxic', 'inedible'];
const SEVERITY_LABEL: Record<ToxicSeverity, string> = {
  lethal: 'identify:results.lethalLabel',
  toxic: 'identify:results.toxicLabel',
  inedible: 'identify:results.inedibleLabel',
};

interface SpeciesSheetProps {
  species: SpeciesWithTranslations | null;
  /** Today's score near the reader or in their region; absent = not scoring. */
  score?: number;
  /** Where `score` was read: "North Europe", "Within 100 km of you". */
  scopeLabel?: string;
  recipes: Recipe[];
  onClose: () => void;
}

/** Everything the catalog knows about one species, opened from its tile. */
export function SpeciesSheet({
  species,
  score,
  scopeLabel,
  recipes,
  onClose,
}: SpeciesSheetProps) {
  return (
    <Dialog open={species !== null} onOpenChange={open => !open && onClose()}>
      {species ? (
        <SpeciesBody
          species={species}
          score={score}
          scopeLabel={scopeLabel}
          recipes={recipes}
        />
      ) : null}
    </Dialog>
  );
}

/** The sheet's content: inside the dialog, or as the page /species/$id. */
export function SpeciesBody({
  species,
  score,
  scopeLabel,
  recipes,
  asPage = false,
}: Omit<SpeciesSheetProps, 'species' | 'onClose'> & {
  species: SpeciesWithTranslations;
  /** A page of its own instead of the dialog (Radix's title parts need one). */
  asPage?: boolean;
}) {
  const { t, i18n } = useTranslation(['species', 'common', 'identify']);
  const Shell = asPage ? 'article' : DialogContent;
  const Title = asPage ? 'h1' : DialogTitle;
  const Latin = asPage ? 'p' : DialogDescription;
  // The full sheet under list_of_species.<key>.guide, where it is written.
  const key = species.translationKey;
  const guide = (part: string) =>
    i18n.exists(`species:list_of_species.${key}.guide.${part}`)
      ? t(`list_of_species.${key}.guide.${part}`)
      : null;
  const seasons = speciesSeasons(species.season);
  const inSeason = seasonMonthSet(seasons);
  const thisMonth = new Date().getMonth();
  const monthLetter = new Intl.DateTimeFormat(i18n.language, {
    month: 'narrow',
  });

  const lookalikes = useMemo(
    () =>
      TOXIC_SPECIES.filter(toxic =>
        toxic.confusedWithSpeciesIds.includes(species.id)
      ).sort(
        (a, b) =>
          SEVERITY_ORDER.indexOf(a.severity) -
          SEVERITY_ORDER.indexOf(b.severity)
      ),
    [species.id]
  );
  // Several look-alikes share a check; say each one once.
  const checks = [
    ...new Set(
      lookalikes.flatMap(
        toxic => toxic.checksFor?.[species.id] ?? toxic.checkKeys
      )
    ),
  ];
  const criticalNotes = [
    ...new Set(
      lookalikes.flatMap(toxic =>
        (toxic.criticalConfusions ?? [])
          .filter(confusion => confusion.catalogId === species.id)
          .map(confusion => confusion.noteKey)
      )
    ),
  ];
  const dishes = getRecipesBySpecies(species.id, recipes);
  const regions = (species.forecastRegions ?? []).map(region =>
    t(`common:worthForagingNow.regions.${region}`)
  );
  const image = getSpeciesImage(species.id);

  return (
    <Shell className={asPage ? 'flex flex-col gap-6' : 'sm:max-w-3xl'}>
      <div className='grid gap-6 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'>
        {image ? (
          <img
            src={image}
            alt=''
            className='aspect-square w-full rounded-card bg-muted object-cover'
          />
        ) : null}
        <div className='flex min-w-0 flex-col gap-5'>
          {/* The close button floats over the top right; the header keeps
              clear of it. */}
          <DialogHeader
            className={cn('gap-1 text-left sm:text-left', !asPage && 'pr-12')}
          >
            <Title className='text-3xl leading-tight font-semibold hyphens-auto break-words'>
              {species.name}
            </Title>
            <Latin className='text-base text-muted-foreground italic'>
              {species.scientificName}
            </Latin>
          </DialogHeader>

          {scopeLabel ? (
            <div className='flex flex-col gap-2'>
              <p className='type-micro text-muted-foreground'>
                {t('sheet.today', { place: scopeLabel })}
              </p>
              {score !== undefined ? (
                <ConditionsMeter score={score} />
              ) : (
                <p className='text-sm text-foreground'>{t('sheet.notToday')}</p>
              )}
            </div>
          ) : null}

          {/* Why to believe the meter: how today's forecast did on this
              species' recent finds, when there are enough. */}
          <ScorecardLine speciesId={species.id} />

          <div className='flex flex-col gap-2'>
            <p className='type-micro text-muted-foreground'>
              {t('season')}
              {seasons.length > 0
                ? ` · ${seasons
                    .map(season => t(`seasons.${season}`))
                    .join(', ')}`
                : null}
            </p>
            <ol aria-hidden='true' className='grid grid-cols-12 gap-1'>
              {Array.from({ length: 12 }, (_, month) => (
                <li key={month} className='flex flex-col items-center gap-1.5'>
                  <span
                    className={cn(
                      'h-2 w-full rounded-full',
                      inSeason.has(month) ? 'bg-primary-text' : 'bg-muted',
                      month === thisMonth &&
                        'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                    )}
                  />
                  <span
                    className={cn(
                      'text-xs',
                      month === thisMonth
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {monthLetter.format(new Date(2026, month, 1))}
                  </span>
                </li>
              ))}
            </ol>
            {/* The bar is drawn for the eye; the months are said in words. */}
            <p className='sr-only'>{monthsLabel(seasons, i18n.language)}</p>
          </div>

          <dl className='grid grid-cols-2 gap-4 text-sm'>
            {species.habitat ? (
              <div>
                <dt className='type-micro text-muted-foreground'>
                  {t('habitat')}
                </dt>
                <dd className='mt-1 text-foreground'>
                  {t(`habitats.${species.habitat}`)}
                </dd>
              </div>
            ) : null}
            {regions.length > 0 ? (
              <div>
                <dt className='type-micro text-muted-foreground'>
                  {t('sheet.whereItGrows')}
                </dt>
                <dd className='mt-1 text-foreground'>{regions.join(', ')}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <p className='leading-relaxed text-foreground'>{species.description}</p>

      <GuidePart title={t('guide.identify')} text={guide('identify')} />
      {guide('habitat') ? (
        <GuidePart title={t('guide.habitat')} text={guide('habitat')} />
      ) : (
        <GuidePart title={t('howTo')} text={species.howTo} />
      )}
      <GuidePart title={t('guide.season')} text={guide('season')} />

      {lookalikes.length > 0 ? (
        <section className='flex flex-col gap-3 rounded-lg bg-status-warning-background p-4 text-status-warning-text ring-2 ring-status-warning-border/60'>
          <h2 className='flex items-center gap-2 text-base font-semibold'>
            <AlertTriangle className='size-4 shrink-0' />
            {t('sheet.lookalikes')}
          </h2>
          {criticalNotes.map(noteKey => (
            <p key={noteKey} className='text-sm font-medium leading-relaxed'>
              {t(`identify:${noteKey}`)}
            </p>
          ))}
          <ul className='flex flex-col gap-1 text-sm'>
            {lookalikes.map(toxic => (
              <li key={toxic.id}>
                <i>{toxic.scientificName}</i>
                {' · '}
                <span className='font-semibold'>
                  {t(SEVERITY_LABEL[toxic.severity])}
                </span>
              </li>
            ))}
          </ul>
          {checks.length > 0 ? (
            <div className='flex flex-col gap-1'>
              <h3 className='text-sm font-semibold'>{t('sheet.tellApart')}</h3>
              <ul className='list-disc space-y-1 pl-5 text-sm leading-relaxed'>
                {checks.map(checkKey => (
                  <li key={checkKey}>{t(`identify:${checkKey}`)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <GuidePart title={t('guide.picking')} text={guide('picking')} />
      <GuidePart title={t('guide.kitchen')} text={guide('kitchen')} />
      <GuidePart title={t('guide.keeps')} text={guide('keeps')} />

      {dishes.length > 0 ? (
        <section className='flex flex-col gap-3'>
          <h2 className='flex items-center gap-2 text-base font-semibold text-foreground'>
            <ChefHat className='size-4 shrink-0 text-primary-text' />
            {t('common:worthForagingNow.kitchenPayoff')}
          </h2>
          <ul className='flex flex-wrap gap-2'>
            {dishes.map(dish => (
              <li key={dish.id} className='min-w-0 max-w-full'>
                <Link
                  to='/recipes'
                  search={{ q: dish.title }}
                  className='focus-ring flex min-h-12 items-center gap-3 rounded-full bg-muted py-1 pr-4 pl-1 text-sm font-medium text-foreground transition-colors hover:bg-happy-50 dark:hover:bg-accent/50'
                >
                  {dish.image ? (
                    <img
                      src={dish.image}
                      alt=''
                      loading='lazy'
                      decoding='async'
                      className='size-10 shrink-0 rounded-full object-cover'
                    />
                  ) : null}
                  <span className='line-clamp-2 leading-tight'>
                    {dish.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {guide('source') ? (
        <p className='text-xs leading-relaxed text-muted-foreground'>
          {t('guide.source')}: {guide('source')}
        </p>
      ) : null}

      <div className='flex flex-wrap gap-3'>
        <Button asChild>
          <Link to='/map' search={{ species: species.id }}>
            <MapPin />
            {t('viewOnMap')}
          </Link>
        </Button>
      </div>
    </Shell>
  );
}

function GuidePart({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <section className='flex flex-col gap-2'>
      <h2 className='text-base font-semibold text-foreground'>{title}</h2>
      <p className='leading-relaxed text-foreground'>{text}</p>
    </section>
  );
}

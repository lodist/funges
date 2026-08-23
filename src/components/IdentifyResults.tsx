import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, ChevronRight, HelpCircle, Skull } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SPECIES_DATA } from '@/data/species';
import {
  findCriticalConfusions,
  hasToxicCandidate,
  type Candidate,
} from '@/lib/photo-id';
import { getSpeciesImage } from '@/lib/utils';

/**
 * Renders the ~3 candidates from a photo.
 *
 * The safety design rests on one measurement from the spike: for a photo of a
 * toxic species, an edible ALSO appears in the top 3 about 28% of the time,
 * while a toxic label appears in the top 3 for 98.3% of them. So the warning is
 * almost always available — but "user reads row 1, stops reading" must not be a
 * failure mode. Hence a banner above every row whenever any candidate is toxic,
 * regardless of its rank.
 *
 * Two traps deliberately avoided, both from copying FeatureInfoModal.tsx:
 *   - it filters rows with `.filter(entry => entry.image)`. Toxic species have no
 *     image asset, so that line would silently drop every toxic row — the worst
 *     possible outcome, reached by following the obvious template.
 *   - its `getScoreTextColorClass` ramps intensity-is-good (pale to dark maroon,
 *     mirroring the map's fill colors). A 90%-confidence toxic match is not good,
 *     so confidence is neutral, de-emphasised text here.
 */

export interface IdentifyResultsProps {
  candidates: Candidate[];
  /** Set when the model produced nothing usable. */
  emptyReason?: string;
}

function catalogName(candidate: Candidate, t: (k: string) => string): string {
  // Several catalog ids can share a scientific name (elderberry/elderflower are
  // both Sambucus nigra); the model cannot tell them apart, so show both rather
  // than silently picking one.
  const names = candidate.catalogSpecies.map(s =>
    t(`list_of_species.${s.nameKey}`)
  );
  return names.join(' / ');
}

export function IdentifyResults({
  candidates,
  emptyReason,
}: IdentifyResultsProps) {
  const { t } = useTranslation('identify');
  const { t: tSpecies } = useTranslation('species');

  if (emptyReason) {
    return (
      <p className='text-sm text-muted-foreground' role='status'>
        {emptyReason}
      </p>
    );
  }

  const showToxicBanner = hasToxicCandidate(candidates);
  const critical = findCriticalConfusions(candidates);

  return (
    <div className='space-y-3'>
      {/* Always above the rows, never inferred from rank 1. */}
      {showToxicBanner && (
        <div
          role='alert'
          /* Core Tailwind amber, not bg-status-warning: this needs explicit
             dark-mode variants and bg-status-warning is flat across themes.
             Stronger than the standing disclaimer's halo, which is the
             hierarchy this feature depends on. */
          className={
            'rounded-lg border-2 border-amber-500 bg-amber-100 p-3 flex gap-2 ' +
            'text-amber-900 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-100'
          }
        >
          <AlertTriangle className='h-5 w-5 shrink-0 mt-0.5' />
          <p className='text-sm font-medium'>{t('results.toxicBanner')}</p>
        </div>
      )}

      {critical.map(({ toxic, catalogSpecies, noteKey }) => (
        <div
          key={`${toxic.id}-${catalogSpecies.id}`}
          role='alert'
          className='border-2 border-destructive rounded-lg p-3 space-y-1'
        >
          <p className='text-sm font-semibold flex items-center gap-2'>
            <Skull className='h-4 w-4 shrink-0' />
            {t('results.criticalHeading')}
          </p>
          <p className='text-sm'>{t(noteKey)}</p>
        </div>
      ))}

      <p className='text-xs text-muted-foreground'>
        {t('disclaimer.aboveResults')}
      </p>

      {/* Labelled so the candidate list is addressable on its own: each toxic
          row nests a "check these features" list, and an unlabelled outer list
          is indistinguishable from those to assistive tech. */}
      <ul className='space-y-2' aria-label={t('results.heading')}>
        {/* Scientific name alone is a safe key: rankPredictions returns the
            top-k distinct label rows, so a name cannot repeat within one
            result set. */}
        {candidates.map(candidate => (
          <CandidateRow
            key={candidate.scientificName}
            candidate={candidate}
            t={t}
            tSpecies={tSpecies}
          />
        ))}
      </ul>

      {/* `disclaimer.neverEat` used to close the list here. It now sits directly
          under the dialog title instead, where it is read before a photo is
          taken rather than after a ranked list has already been offered.
          Repeating it in both places would just teach people to skip it. */}
    </div>
  );
}

function CandidateRow({
  candidate,
  t,
  tSpecies,
}: {
  candidate: Candidate;
  t: (key: string, options?: Record<string, unknown>) => string;
  tSpecies: (key: string) => string;
}) {
  const isToxic = candidate.kind === 'toxic';
  const severity = candidate.toxic?.severity;

  // Text, not colour alone: a small coloured pill fails for colourblind users
  // and in bright outdoor sunlight, which is this feature's actual context.
  const toxicLabel =
    severity === 'lethal'
      ? t('results.lethalLabel')
      : severity === 'inedible'
        ? t('results.inedibleLabel')
        : t('results.toxicLabel');

  const image =
    candidate.kind === 'catalog' && candidate.catalogSpecies[0]
      ? getSpeciesImage(candidate.catalogSpecies[0].id)
      : undefined;

  return (
    <li
      className={`flex gap-3 items-start rounded-lg border p-3 ${
        isToxic ? 'border-destructive' : 'border-input'
      }`}
    >
      <div className='h-12 w-12 shrink-0 rounded-md overflow-hidden bg-secondary flex items-center justify-center'>
        {/* Toxic and tier-2 rows have no photo asset and must still render. */}
        {image ? (
          <img
            src={image}
            alt=''
            className='h-full w-full object-cover'
            loading='lazy'
          />
        ) : isToxic ? (
          <Skull className='h-6 w-6' aria-hidden='true' />
        ) : (
          <HelpCircle className='h-6 w-6 opacity-60' aria-hidden='true' />
        )}
      </div>

      <div className='min-w-0 flex-1 space-y-1'>
        {isToxic && (
          <Badge variant='destructive' className='gap-1'>
            <Skull />
            {toxicLabel}
          </Badge>
        )}

        <p className='font-medium leading-tight'>
          {candidate.kind === 'catalog'
            ? catalogName(candidate, tSpecies)
            : candidate.scientificName}
        </p>

        {candidate.kind === 'catalog' && (
          <p className='text-xs italic text-muted-foreground'>
            {candidate.scientificName}
          </p>
        )}

        {(candidate.kind === 'other' || candidate.kind === 'unknown') && (
          <p className='text-xs text-muted-foreground'>
            {t('results.notInCatalog')}
          </p>
        )}

        {candidate.toxic && (
          <>
            <p className='text-xs'>{t(candidate.toxic.reasonKey)}</p>
            {candidate.toxic.confusedWithSpeciesIds.length > 0 && (
              <p className='text-xs text-muted-foreground'>
                {t('results.confusedWith', {
                  species: candidate.toxic.confusedWithSpeciesIds
                    .map(id => {
                      const s = SPECIES_DATA.find(x => x.id === id);
                      return s ? tSpecies(`list_of_species.${s.nameKey}`) : id;
                    })
                    .join(', '),
                })}
              </p>
            )}
            <details className='text-xs'>
              <summary className='cursor-pointer text-muted-foreground'>
                {t('results.checkThese')}
              </summary>
              <ul className='list-disc pl-4 pt-1 space-y-0.5'>
                {candidate.toxic.checkKeys.map(key => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </details>
          </>
        )}

        {/* Neutral and secondary. Never colour-coded on the toxicity axis. */}
        <p className='text-xs text-muted-foreground tabular-nums'>
          {t('results.confidence', {
            percent: Math.round(candidate.score * 100),
          })}
        </p>
      </div>

      {/* Only catalog matches get this. A tier-2 or toxic row has no page to
          open, and a link that lands on an empty list would read as a bug.

          Filters by the CATALOG's scientific name, not the model's label: the
          catalog stores genus-level entries as "Boletus spp." while the model
          predicts "Boletus edulis", so filtering by the prediction would find
          nothing for exactly the entries that are hardest to identify. */}
      {candidate.kind === 'catalog' && candidate.catalogSpecies[0] && (
        <Button
          asChild
          variant='outline'
          size='icon'
          className='shrink-0 self-center'
        >
          <Link
            to='/species'
            search={{ q: candidate.catalogSpecies[0].scientificName }}
            aria-label={t('results.openSpecies', {
              species: catalogName(candidate, tSpecies),
            })}
          >
            <ChevronRight className='h-4 w-4' />
          </Link>
        </Button>
      )}
    </li>
  );
}

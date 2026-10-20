import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Skull,
} from '@/lib/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SPECIES_DATA } from '@/data/species';
import {
  findCriticalConfusions,
  hasToxicCandidate,
  type Candidate,
} from '@/lib/photo-id';
import { getSpeciesImage } from '@/lib/utils';
import { ZoomableImage } from '@/components/ZoomableImage';

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
 *   - its `getScoreColor` ramps intensity-is-good (pale to dark maroon,
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
    <div className='flex flex-col gap-4'>
      {/* Always above the rows, never inferred from rank 1. */}
      {showToxicBanner && (
        <div
          role='alert'
          /* The warning tokens, which are theme-aware and derived from the map
             score ramp. Border-2 rather than a different colour is what makes
             this stronger than the standing disclaimer's halo — the hierarchy
             this feature depends on. */
          className={
            'rounded-lg border-2 border-status-warning-border bg-status-warning-background p-3 flex gap-2 ' +
            'text-status-warning-text   '
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
          className='border-2 border-destructive dark:border-destructive-border rounded-lg p-3 space-y-1'
        >
          <p className='text-sm font-semibold flex items-center gap-2'>
            <Skull className='h-4 w-4 shrink-0' />
            {t('results.criticalHeading')}
          </p>
          <p className='text-sm'>{t(noteKey)}</p>
        </div>
      ))}

      <p className='text-sm text-muted-foreground'>
        {t('disclaimer.aboveResults')}
      </p>

      {/* Labelled so the candidate list is addressable on its own: each toxic
          row nests a "check these features" list, and an unlabelled outer list
          is indistinguishable from those to assistive tech.
          Equal plates in score order, no hero for rank 1: a bigger first card
          would claim a certainty the model does not have. */}
      <ul className='flex flex-col gap-3' aria-label={t('results.heading')}>
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
  const isCaution = candidate.kind === 'caution';
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
    // A plate per match: borderless and lifted like every card here. A toxic
    // match keeps its red edge as a ring, the contrast-earning stroke the
    // design system allows (--destructive-border carries it in dark).
    <li
      className={`flex items-start gap-4 rounded-card bg-card p-3 elevation-raised sm:p-4 ${
        isToxic ? 'ring-2 ring-destructive dark:ring-destructive-border' : ''
      }`}
    >
      {/* A toxic row's tile is not the brand's go-green wash. */}
      <div
        className={`flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:size-24 ${
          isToxic ? 'bg-muted' : 'bg-secondary'
        }`}
      >
        {/* Toxic and tier-2 rows have no photo asset and must still render. */}
        {image ? (
          <ZoomableImage src={image} className='size-full' />
        ) : isToxic ? (
          <Skull className='size-8 text-destructive-text' aria-hidden='true' />
        ) : isCaution ? (
          <AlertTriangle
            className='size-8 text-status-warning-text'
            aria-hidden='true'
          />
        ) : (
          <HelpCircle
            className='size-8 text-muted-foreground'
            aria-hidden='true'
          />
        )}
      </div>

      <div className='min-w-0 flex-1 space-y-1.5'>
        {isToxic && (
          <Badge variant='destructive'>
            <Skull />
            {toxicLabel}
          </Badge>
        )}
        {isCaution && (
          <Badge variant='warning'>
            <AlertTriangle />
            {t('results.cautionLabel')}
          </Badge>
        )}

        <h3 className='text-base font-semibold leading-snug text-foreground'>
          {candidate.kind === 'catalog'
            ? catalogName(candidate, tSpecies)
            : candidate.scientificName}
        </h3>

        {candidate.kind === 'catalog' && (
          <p className='text-sm italic text-muted-foreground'>
            {candidate.scientificName}
          </p>
        )}

        {(candidate.kind === 'other' || candidate.kind === 'unknown') && (
          <p className='text-sm text-muted-foreground'>
            {t('results.notInCatalog')}
          </p>
        )}
        {isCaution && (
          <p className='text-sm text-foreground'>{t('results.cautionGenus')}</p>
        )}

        {candidate.toxic && (
          <>
            <p className='text-sm text-foreground'>
              {t(candidate.toxic.reasonKey)}
            </p>
            {candidate.toxic.confusedWithSpeciesIds.length > 0 && (
              <p className='text-sm text-muted-foreground'>
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
            {/* `flex` drops the native marker, so the chevron says this
                opens in place rather than navigating. */}
            <details className='group text-sm'>
              <summary className='flex min-h-11 cursor-pointer items-center gap-1 font-medium text-primary-text'>
                {t('results.checkThese')}
                <ChevronDown className='size-4 transition-transform duration-base group-open:rotate-180' />
              </summary>
              <ul className='list-disc space-y-1 pl-4'>
                {candidate.toxic.checkKeys.map(key => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </details>
          </>
        )}

        {/* Neutral and secondary. Never colour-coded on the toxicity axis. */}
        <p className='text-sm text-muted-foreground tabular-nums'>
          {/* "0% match" beside a deadly badge reads as ruled out; it is not. */}
          {Math.round(candidate.score * 100) === 0
            ? t('results.confidenceUnderOne')
            : t('results.confidence', {
                percent: Math.round(candidate.score * 100),
              })}
        </p>
      </div>

      {/* Only catalog matches get this. A tier-2 or toxic row has no page to
          open, and a link that lands on an empty list would read as a bug.

          Filters by the CATALOG's scientific name, not the model's label: the
          catalog stores genus-level entries as "Morchella spp." while the model
          predicts "Morchella esculenta", so filtering by the prediction would
          find nothing for exactly the entries that are hardest to identify. */}
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

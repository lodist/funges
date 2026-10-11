import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { getSpeciesById, speciesNameKey } from '@/data/species';
import { ArrowRight, ArrowUpRight } from '@/lib/icons';
import { getRecipeImage, getSpeciesImage } from '@/lib/utils';
import styles from './LandingPage.module.scss';

const base = import.meta.env.BASE_URL;
const SPECIMENS = ['chant', 'blackberry', 'nettle'] as const;

/* Field-guide cover. THESIS: wild food earns the first impression.
 * OWN-WORLD: incumbent paper, chlorophyll, Space Grotesk and pill controls.
 * STORY: discover a specimen, check conditions, open the map, cook the find.
 * FIRST VIEWPORT: large green headline, botanical plate, visible map CTA.
 * FORM: interactive field-guide cover, candidate 3, seed 33b09c0d.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 * finish review, the verdict, DESIGN.md, and every shipping raster carrying
 * its provenance. Existing catalog illustrations are reused unchanged.
 */
export default function LandingPage() {
  const { t } = useTranslation('common');
  const { t: tSpecies } = useTranslation('species');
  const { t: tRecipes } = useTranslation('recipes');
  const [specimen, setSpecimen] = useState<(typeof SPECIMENS)[number]>('chant');
  const name = tSpecies(`list_of_species.${speciesNameKey(specimen)}`);

  return (
    <>
      <SEO
        title={t('home.headline')}
        description={t('home.description')}
        canonicalUrl={base}
      />
      <div className={styles.page}>
        <header className={styles.header}>
          <Logo className='h-10 md:h-12' />
          <Link
            to='/worth-foraging-now'
            className={`${styles.textLink} focus-ring`}
          >
            {t('home.ctaSecondary')}
            <ArrowUpRight aria-hidden='true' className='size-5' />
          </Link>
        </header>
        <section className={styles.hero} aria-labelledby='landing-title'>
          <div className={styles.heroCopy}>
            <h1 id='landing-title'>{t('home.coverHeadline')}</h1>
            <p className={styles.intro}>{t('home.description')}</p>
            <Button asChild size='lg' className={styles.primaryAction}>
              <Link to='/map'>
                {t('home.cta')}
                <ArrowRight aria-hidden='true' className='size-5' />
              </Link>
            </Button>
          </div>
          <div className={styles.specimen}>
            <div className={styles.plate}>
              <img
                key={specimen}
                src={getSpeciesImage(specimen) ?? undefined}
                alt={name}
                width='512'
                height='512'
                fetchPriority='high'
                className={styles.specimenImage}
              />
            </div>
            <div className={styles.specimenFooter}>
              <div
                aria-live='polite'
                aria-atomic='true'
                className={styles.caption}
              >
                <span>{name}</span>
                <i>{getSpeciesById(specimen)?.scientificName}</i>
              </div>
              <div
                className={styles.specimenChoices}
                role='group'
                aria-label={t('home.specimenPicker')}
              >
                {SPECIMENS.map(id => (
                  <button
                    key={id}
                    type='button'
                    className={`${styles.specimenChoice} focus-ring`}
                    aria-pressed={specimen === id}
                    aria-label={tSpecies(
                      `list_of_species.${speciesNameKey(id)}`
                    )}
                    onClick={() => setSpecimen(id)}
                  >
                    <img
                      src={getSpeciesImage(id) ?? undefined}
                      alt=''
                      width='40'
                      height='40'
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
        <nav
          className={styles.chapterLinks}
          aria-label={t('home.exploreFeatures')}
        >
          <Link to='/worth-foraging-now' className='focus-ring'>
            {t('home.forecast.label')}
            <ArrowUpRight aria-hidden='true' className='size-5' />
          </Link>
          <Link to='/map' search={{ identify: true }} className='focus-ring'>
            {t('home.identify.label')}
            <ArrowUpRight aria-hidden='true' className='size-5' />
          </Link>
          <Link to='/recipes' className='focus-ring'>
            {t('home.cook.label')}
            <ArrowUpRight aria-hidden='true' className='size-5' />
          </Link>
        </nav>
        <section className={styles.forecast} aria-labelledby='forecast-title'>
          <div className={styles.forecastCopy}>
            <h2 id='forecast-title'>{t('home.forecast.heading')}</h2>
            <p>{t('home.forecast.body')}</p>
            <Button asChild size='lg'>
              <Link to='/worth-foraging-now'>
                {t('home.forecast.link')}
                <ArrowRight aria-hidden='true' className='size-5' />
              </Link>
            </Button>
            <p className={styles.coverage}>{t('home.coverage')}</p>
          </div>
          <figure className={styles.mapFigure}>
            <img
              src={`${base}landing/hero-map.webp`}
              alt=''
              loading='lazy'
              width='1500'
              height='1324'
            />
            <figcaption>{t('home.mapPreview')}</figcaption>
          </figure>
        </section>
        <section className={styles.identify} aria-labelledby='identify-title'>
          <div className={styles.identifyArtwork} aria-hidden='true'>
            <img
              src={getSpeciesImage('chicken-of-the-woods') ?? undefined}
              alt=''
              loading='lazy'
              width='512'
              height='512'
            />
          </div>
          <div className={styles.sectionCopy}>
            <h2 id='identify-title'>{t('home.identify.heading')}</h2>
            <p>{t('home.identify.body')}</p>
            <Link
              to='/map'
              search={{ identify: true }}
              className={`${styles.textLink} focus-ring`}
            >
              {t('home.identify.link')}
              <ArrowUpRight aria-hidden='true' className='size-5' />
            </Link>
            <p className={styles.safety}>{tSpecies('safetyWarning')}</p>
          </div>
        </section>
        <section className={styles.cook} aria-labelledby='cook-title'>
          <div className={styles.sectionCopy}>
            <h2 id='cook-title'>{t('home.cook.heading')}</h2>
            <p>{t('home.cook.body')}</p>
            <Link to='/recipes' className={`${styles.textLink} focus-ring`}>
              {t('home.cook.link')}
              <ArrowUpRight aria-hidden='true' className='size-5' />
            </Link>
          </div>
          <figure className={styles.recipeFigure}>
            <img
              src={getRecipeImage('chanterelle-herb-tart') ?? undefined}
              alt=''
              loading='lazy'
              width='768'
              height='768'
            />
            <figcaption>
              {tRecipes('list_of_recipes.chanterelle-herb-tart.title')}
            </figcaption>
          </figure>
        </section>
        <footer className={styles.closing}>
          <h2>{t('home.closing.heading')}</h2>
          <Button asChild size='lg'>
            <Link to='/map'>
              {t('home.closing.cta')}
              <ArrowRight aria-hidden='true' className='size-5' />
            </Link>
          </Button>
        </footer>
      </div>
    </>
  );
}

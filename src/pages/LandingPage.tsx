import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import MapInfoCard from '@/components/MapInfoCard';
import ForecastSlider from '@/components/ForecastSlider';
import { Button } from '@/components/ui/button';
import { ArrowRight } from '@/lib/icons';
import { getScoreColor } from '@/lib/scoreColor';
import { getRecipeImage, getSpeciesImage } from '@/lib/utils';

const base = import.meta.env.BASE_URL;
const HERO_MAP = `${base}landing/hero-map.webp`;
const FJORDS = `${base}landing/fjords.webp`;

// Illustrative marker on the hero: a real species with a plausible September
// score, painted with the same ramp as the map. Decorative, so aria-hidden.
const PIN_SPECIES = 'chant';
const PIN_SCORE = 7;
const FAN_SPECIES = ['chant', 'blackberry', 'chicken-of-the-woods'] as const;
const RECIPES = ['chanterelle-herb-tart', 'chestnut-mushroom-soup'] as const;

const ROW_CLASS =
  'landing-row focus-ring grid items-center gap-8 rounded-card md:grid-cols-2 md:gap-14';

// The Trailhead: opening the map before setting off. The terrain is the ground
// of the page, not a screenshot inside it; everything else floats above it
// the way the app's own chrome does. PRODUCT.md: no stats, no testimonials.
export default function LandingPage() {
  const { t } = useTranslation('common');
  const { t: tNav } = useTranslation('sidebar');
  const { t: tMap } = useTranslation('map');
  const { t: tSpecies } = useTranslation('species');
  const { t: tRecipes } = useTranslation('recipes');

  const footerLinks = [
    { to: '/instructions', label: tNav('instructions') },
    { to: '/support', label: tNav('support') },
    { to: '/impressum', label: tNav('impressum') },
    { to: '/privacy-policy', label: tNav('privacyPolicy') },
    { to: '/termsuse', label: tNav('termsOfUse') },
  ] as const;

  const rowText = (key: 'forecast' | 'identify' | 'cook') => (
    <div>
      <p className='type-micro text-primary-text'>{t(`home.${key}.label`)}</p>
      <h2 className='mt-2 text-3xl font-semibold text-foreground'>
        {t(`home.${key}.heading`)}
      </h2>
      <p className='mt-3 text-base text-muted-foreground md:text-lg'>
        {t(`home.${key}.body`)}
      </p>
      <span className='mt-5 inline-flex items-center gap-1.5 font-medium text-primary-text'>
        {t(`home.${key}.link`)}
        <ArrowRight className='size-4' />
      </span>
    </div>
  );

  return (
    <>
      <SEO
        title={t('home.headline')}
        description={t('home.description')}
        canonicalUrl={base}
      />
      <div className='-mx-4 -mt-4 bg-background'>
        {/* Hero */}
        <section className='relative isolate overflow-hidden'>
          <img
            src={HERO_MAP}
            alt=''
            fetchPriority='high'
            decoding='async'
            className='landing-hero-map landing-hero-media absolute inset-x-0 top-0 -z-10 h-[52dvh] w-full object-cover md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[60%]'
          />

          {/* Floating chrome over the terrain: a species pin and the real
              forecast card. Both decorative here, so hidden from AT and
              inert to the pointer. */}
          <div
            aria-hidden='true'
            className='pointer-events-none absolute left-1/2 top-[14dvh] w-max -translate-x-1/2 md:left-[63%] md:top-[26%]'
          >
            <div className='glass-regular elevation-floating flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3'>
              <img
                src={getSpeciesImage(PIN_SPECIES) ?? undefined}
                alt=''
                className='size-11 rounded-full object-cover'
              />
              <div className='min-w-0 leading-tight'>
                <p className='text-sm font-semibold text-foreground'>
                  {tSpecies(`list_of_species.${PIN_SPECIES}.name`)}
                </p>
                <p className='type-micro text-muted-foreground'>
                  {tMap('forecast.today', { defaultValue: 'Today' })}
                </p>
              </div>
              {/* Same badge as the map's numbers layer: ramp fill, black digit. */}
              <span
                className='grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold text-black'
                style={{ background: getScoreColor(PIN_SCORE) }}
              >
                {PIN_SCORE}
              </span>
            </div>
            <div className='mx-auto h-7 w-px bg-foreground/70' />
            <div className='mx-auto size-2.5 rounded-full bg-foreground' />
          </div>
          <div
            aria-hidden='true'
            className='pointer-events-none absolute bottom-10 right-8 z-10 hidden w-80 lg:block'
          >
            <ForecastSlider />
          </div>

          <div className='mx-auto flex min-h-[88dvh] max-w-6xl flex-col justify-end px-6 pb-12 md:justify-center md:pb-0'>
            {/* Phone: the copy starts below the terrain band. */}
            <div aria-hidden='true' className='h-[46dvh] md:hidden' />
            <div className='max-w-xl'>
              <img
                src={`${base}icons/logo_funges.png`}
                alt={t('home.title')}
                className='h-10 w-auto object-contain md:h-12'
              />
              <h1 className='mt-6 text-4xl font-semibold leading-[1.05] text-foreground md:text-6xl'>
                {t('home.headline')}
              </h1>
              <p className='mt-4 max-w-md text-base text-muted-foreground md:text-lg'>
                {t('home.description')}
              </p>
              <div className='mt-8 flex flex-wrap items-center gap-3'>
                <Button asChild size='lg'>
                  <Link to='/map'>
                    {t('home.cta')}
                    <ArrowRight className='size-5' />
                  </Link>
                </Button>
                <Button asChild variant='ghost' size='lg'>
                  <Link to='/worth-foraging-now'>{t('home.ctaSecondary')}</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* What Funges helps you do */}
        <section className='relative isolate overflow-hidden'>
          {/* A faint relief wash keeps the paper from turning into a blank
              canvas between the two map sections. */}
          <img
            src={FJORDS}
            alt=''
            aria-hidden='true'
            loading='lazy'
            className='landing-wash absolute inset-0 -z-10 h-full w-full object-cover opacity-10 grayscale'
          />
          <div className='mx-auto max-w-6xl space-y-20 px-6 py-20 md:space-y-28 md:py-28'>
            {/* Forecast */}
            <Link to='/worth-foraging-now' className={ROW_CLASS}>
              <div className='landing-row-visual relative aspect-[4/3] overflow-hidden rounded-card elevation-raised'>
                <img
                  src={HERO_MAP}
                  alt=''
                  loading='lazy'
                  className='h-full w-full object-cover object-[35%_70%]'
                />
                <div className='absolute inset-x-4 bottom-4'>
                  <MapInfoCard />
                </div>
              </div>
              {rowText('forecast')}
            </Link>

            {/* Identify */}
            <Link to='/map' search={{ identify: true }} className={ROW_CLASS}>
              <div className='md:order-2'>
                <div className='relative mx-auto h-64 max-w-sm'>
                  {FAN_SPECIES.map((id, index) => (
                    <img
                      key={id}
                      src={getSpeciesImage(id) ?? undefined}
                      alt={tSpecies(`list_of_species.${id}.name`)}
                      loading='lazy'
                      className={[
                        'landing-row-visual absolute top-4 h-52 w-40 rounded-card object-cover elevation-raised',
                        index === 0 && 'left-0 -rotate-6',
                        index === 1 &&
                          'left-1/2 z-10 -translate-x-1/2 -translate-y-3',
                        index === 2 && 'right-0 rotate-6',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    />
                  ))}
                </div>
              </div>
              <div className='md:order-1'>{rowText('identify')}</div>
            </Link>

            {/* Cook */}
            <Link to='/recipes' className={ROW_CLASS}>
              {/* Two recipe cards laid on the table, a touch askew, so neither
                  hides the other's caption. */}
              <div className='mx-auto grid w-full max-w-md grid-cols-2 gap-4 px-2 py-4'>
                {RECIPES.map((id, index) => (
                  <figure
                    key={id}
                    className={[
                      'landing-row-visual overflow-hidden rounded-card bg-card elevation-raised',
                      index === 0 ? '-rotate-2 translate-y-2' : 'rotate-2',
                    ].join(' ')}
                  >
                    <img
                      src={getRecipeImage(id) ?? undefined}
                      alt=''
                      loading='lazy'
                      className='aspect-[4/3] w-full object-cover'
                    />
                    <figcaption className='px-4 py-3 text-sm font-medium text-foreground'>
                      {tRecipes(`list_of_recipes.${id}.title`)}
                    </figcaption>
                  </figure>
                ))}
              </div>
              {rowText('cook')}
            </Link>
          </div>
        </section>

        {/* Final invitation */}
        <section className='relative isolate overflow-hidden'>
          <img
            src={FJORDS}
            alt=''
            aria-hidden='true'
            loading='lazy'
            className='landing-closing-map absolute inset-0 -z-10 h-full w-full object-cover object-bottom'
          />
          <div className='mx-auto max-w-6xl px-6 pt-20 text-center'>
            <h2 className='text-3xl font-semibold text-foreground md:text-4xl'>
              {t('home.closing.heading')}
            </h2>
            <div className='mt-6'>
              <Button asChild size='lg'>
                <Link to='/map'>
                  {t('home.closing.cta')}
                  <ArrowRight className='size-5' />
                </Link>
              </Button>
            </div>
            {/* The terrain below the invitation: the page ends on the ground. */}
            <div aria-hidden='true' className='h-[34dvh] md:h-[40dvh]' />
          </div>
        </section>

        <footer className='mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground'>
          <p>{t('home.coverage')}</p>
          <nav className='mt-4 flex flex-wrap gap-x-5 gap-y-2'>
            {footerLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className='rounded-sm underline underline-offset-2 hover:text-foreground focus-ring'
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </footer>
      </div>
    </>
  );
}

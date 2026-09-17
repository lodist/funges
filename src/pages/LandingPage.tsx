import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import {
  ArrowRight,
  CalendarRange,
  ChefHat,
  ScanSearch,
  type LucideIcon,
} from '@/lib/icons';

const base = import.meta.env.BASE_URL;

// The Trailhead: the moment before setting off. One hero over the map itself,
// one sentence, one way in — then the three things the app does, and the
// honest coverage note. No stats, no testimonials (PRODUCT.md: never fabricate).
export default function LandingPage() {
  const { t } = useTranslation('common');
  const { t: tNav } = useTranslation('sidebar');

  const verbs: Array<{
    key: 'forecast' | 'identify' | 'cook';
    icon: LucideIcon;
    to: '/worth-foraging-now' | '/map' | '/recipes';
    search?: { identify: true };
  }> = [
    { key: 'forecast', icon: CalendarRange, to: '/worth-foraging-now' },
    {
      key: 'identify',
      icon: ScanSearch,
      to: '/map',
      search: { identify: true },
    },
    { key: 'cook', icon: ChefHat, to: '/recipes' },
  ];

  const footerLinks = [
    { to: '/instructions', label: tNav('instructions') },
    { to: '/support', label: tNav('support') },
    { to: '/impressum', label: tNav('impressum') },
    { to: '/privacy-policy', label: tNav('privacyPolicy') },
    { to: '/termsuse', label: tNav('termsOfUse') },
  ] as const;

  return (
    <>
      <SEO
        title={t('home.headline')}
        description={t('home.description')}
        canonicalUrl={base}
      />
      {/* -m-4 escapes the shell's page padding so the hero runs edge to edge,
          the way the map does on the route next door. */}
      <div className='-mx-4 -mt-4'>
        <section className='relative isolate flex min-h-[72dvh] items-end overflow-hidden bg-muted'>
          {/* The real map, hillshade and forecast fills included, captured from
              the app itself. Decorative: the headline carries the meaning. */}
          <img
            src={`${base}landing/hero.webp`}
            alt=''
            fetchPriority='high'
            decoding='async'
            className='landing-hero-media absolute inset-0 -z-20 h-full w-full object-cover'
          />
          {/* Paper rises from the bottom so the copy sits on the page's own
              ground rather than on whatever the terrain happens to be doing. */}
          <div
            aria-hidden='true'
            className='absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/75 to-background/5'
          />
          <div className='mx-auto w-full max-w-5xl px-6 pb-10 pt-48 md:pb-14'>
            <p className='type-micro text-primary-text'>{t('home.title')}</p>
            <h1 className='mt-3 max-w-2xl text-4xl font-semibold leading-[1.1] text-foreground md:text-5xl'>
              {t('home.headline')}
            </h1>
            <p className='mt-4 max-w-xl text-base text-muted-foreground md:text-lg'>
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
        </section>

        <section
          aria-label={t('home.title')}
          className='mx-auto grid max-w-5xl gap-4 px-6 py-10 md:grid-cols-3'
        >
          {verbs.map(({ key, icon: Icon, to, search }) => (
            <Link
              key={key}
              to={to}
              search={search}
              className='block rounded-card focus-ring'
            >
              <Card interactive className='h-full'>
                <CardContent className='flex flex-col gap-3'>
                  <Icon className='size-6 text-primary-text' />
                  <CardTitle>{t(`home.${key}.title`)}</CardTitle>
                  <p className='text-sm text-muted-foreground'>
                    {t(`home.${key}.body`)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>

        <footer className='mx-auto max-w-5xl px-6 pb-12 text-sm text-muted-foreground'>
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

import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLinks } from '@/components/PageLinks';
import SEO from '@/components/SEO';
import { CropBody } from '@/components/CropSheet';
import { Button } from '@/components/ui/button';
import { CROPS, huertaImage } from '@/lib/huerta';
import { ArrowLeft } from '@/lib/icons';
import {
  alternates,
  cropPageDescription,
  localizedPath,
  pathLanguage,
} from '@/lib/seo-pages';

/** One crop on a public page (/huerta/crops/$id, /de/huerta/crops/$id):
 *  how to grow it, for links and search. A garden's own view of it (this
 *  week, its bed) stays behind sign-in. */
export default function CropPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const crop = CROPS.find(c => c.id === id);
  const { t } = useTranslation('huerta');
  if (!crop) return null;

  const path = `/huerta/crops/${crop.id}/`;
  const lang = pathLanguage(window.location.pathname) ?? 'en';
  const name = t(`crops.${crop.id}`);

  return (
    <>
      <SEO
        title={t('page.title', {
          name,
          start: t(`page.start.${crop.how}`),
          end: t(`page.end.${crop.kind}`),
        })}
        description={cropPageDescription(t(`grow.${crop.id}.about`))}
        canonicalUrl={localizedPath(path, lang)}
        alternates={alternates(path, window.location.origin)}
      />
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:py-10'>
        <Link
          to='/huerta'
          className='focus-ring inline-flex min-h-11 items-center gap-2 self-start rounded-full text-sm font-medium text-primary-text'
        >
          <ArrowLeft className='size-4' />
          {t('page.home')}
        </Link>
        <CropBody
          crop={crop}
          image={c => huertaImage(`crops/${c.id}`)}
          asPage
        />
        <Button asChild className='self-start'>
          <Link to='/huerta/signin'>{t('page.signIn')}</Link>
        </Button>
        <PageLinks
          title={t('page.allCrops')}
          links={CROPS.map(c => ({
            href: localizedPath(`/huerta/crops/${c.id}/`, lang),
            name: t(`crops.${c.id}`),
          })).sort((a, b) => a.name.localeCompare(b.name))}
        />
      </div>
    </>
  );
}

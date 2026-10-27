import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLinks } from '@/components/PageLinks';
import SEO from '@/components/SEO';
import { SpeciesBody } from '@/components/SpeciesSheet';
import { useRecipesData } from '@/data/recipes';
import { useSpeciesData } from '@/data/species';
import { ArrowLeft } from '@/lib/icons';
import { alternates, localizedPath, pathLanguage } from '@/lib/seo-pages';

/** One species on a page of its own (/species/$id, /de/species/$id): what its
 *  sheet shows, for links and search. */
export default function SpeciesDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const all = useSpeciesData();
  const species = all.find(s => s.id === id);
  const recipes = useRecipesData();
  const { t } = useTranslation('species');
  if (!species) return null;

  const path = `/species/${species.id}/`;
  const lang = pathLanguage(window.location.pathname) ?? 'en';
  const vars = { name: species.name, latin: species.scientificName };

  return (
    <>
      <SEO
        title={t('page.title', vars)}
        description={t('page.description', vars)}
        canonicalUrl={localizedPath(path, lang)}
        alternates={alternates(path, window.location.origin)}
      />
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:py-10'>
        <Link
          to='/species'
          className='focus-ring inline-flex min-h-11 items-center gap-2 self-start rounded-full text-sm font-medium text-primary-text'
        >
          <ArrowLeft className='size-4' />
          {t('page.allSpecies')}
        </Link>
        <SpeciesBody species={species} recipes={recipes} asPage />
        <PageLinks
          title={t('page.allSpecies')}
          links={[...all]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(s => ({
              href: localizedPath(`/species/${s.id}/`, lang),
              name: s.name,
            }))}
        />
      </div>
    </>
  );
}

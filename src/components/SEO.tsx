import i18n from '@/i18n';
import { useMemo } from 'react';

interface OpenGraphMeta {
  type?: string;
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  siteName?: string;
  locale?: string;
}

interface TwitterMeta {
  card?: string;
  title?: string;
  description?: string;
  image?: string;
  site?: string;
}

interface SEOProps {
  title: string;
  description?: string;
  keywords?: string[] | string;
  canonicalUrl?: string;
  openGraph?: Partial<OpenGraphMeta>;
  twitter?: Partial<TwitterMeta>;
}

export default function SEO({
  title,
  description,
  keywords,
  canonicalUrl,
  openGraph,
  twitter,
}: SEOProps) {
  const fullTitle = `${title} \u2014 Fung.es`;

  const keywordsContent = Array.isArray(keywords)
    ? keywords.join(', ')
    : keywords;

  const canonical = useMemo(() => {
    const path = canonicalUrl ?? window.location.pathname;
    return new URL(path, window.location.origin).toString();
  }, [canonicalUrl]);

  const defaultLocale = i18n.isInitialized
    ? i18n.language.replace('-', '_')
    : 'en_US';

  const og: OpenGraphMeta = {
    type: 'website',
    siteName: 'Fung.es',
    locale: defaultLocale,
    image: '/icons/logo_1.png',
    url: canonical,
    title,
    description,
    ...openGraph,
  };

  const tw: TwitterMeta = {
    card: 'summary_large_image',
    image: '/icons/logo_1.png',
    title,
    description,
    ...twitter,
  };

  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name='description' content={description} />}
      {keywordsContent && <meta name='keywords' content={keywordsContent} />}
      {canonical && <link rel='canonical' href={canonical} />}

      {og.type && <meta property='og:type' content={og.type} />}
      {og.title && <meta property='og:title' content={og.title} />}
      {og.description && (
        <meta property='og:description' content={og.description} />
      )}
      {og.image && <meta property='og:image' content={og.image} />}
      {og.url && <meta property='og:url' content={og.url} />}
      {og.siteName && <meta property='og:site_name' content={og.siteName} />}
      {og.locale && <meta property='og:locale' content={og.locale} />}

      {tw.card && <meta name='twitter:card' content={tw.card} />}
      {tw.title && <meta name='twitter:title' content={tw.title} />}
      {tw.description && (
        <meta name='twitter:description' content={tw.description} />
      )}
      {tw.image && <meta name='twitter:image' content={tw.image} />}
      {tw.site && <meta name='twitter:site' content={tw.site} />}
    </>
  );
}

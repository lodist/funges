import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCodeModal from '@/components/QRCodeModal';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  useSupportMethods,
  type SupportMethodWithTranslations,
} from '@/data/support';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { BAND_OUTLINE_CLASS, BAND_SURFACE_CLASS } from '@/lib/band-surface';
import {
  CheckCircle,
  ChevronDown,
  Copy,
  ExternalLink,
  Heart,
  Mail,
  QrCode,
} from '@/lib/icons';
import { cn, getSpeciesImage } from '@/lib/utils';

const LANDING = `${import.meta.env.BASE_URL}landing`;

/** One picture per reason, in the order of `whySupport.reasons`: the
 *  landing's own photographs and the catalog's species, so the page shows
 *  what the money keeps running rather than stock art. */
const REASON_PICTURES: (string | string[])[] = [
  `${LANDING}/autumn-beech-road.webp`,
  `${LANDING}/alps-map.webp`,
  ['chant', 'nettle', 'lingonb', 'mushroom'],
  `${LANDING}/lingonberries-pine-forest.webp`,
  `${LANDING}/wild-mushroom-toast.webp`,
];

export default function SupportPage() {
  const { t } = useTranslation('support');
  const { t: tCommon } = useTranslation('common');
  const methods = useSupportMethods();
  const { status: copyStatus, key: copyKey, copy } = useCopyToClipboard();
  const copiedId = copyStatus === 'copied' ? copyKey : null;
  const [qrMethod, setQrMethod] =
    useState<SupportMethodWithTranslations | null>(null);

  const coffee = methods.find(method => method.id === 'buymeacoffee');
  const github = methods.find(method => method.id === 'github');
  const crypto = methods.filter(method => method.type === 'crypto');
  const reasons = t('whySupport.reasons', { returnObjects: true }) as string[];

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={`${import.meta.env.BASE_URL}support`}
      />
      <div className='container mx-auto max-w-6xl px-4 py-8'>
        {/* One region for the whole page: a copy anywhere is announced once. */}
        <p aria-live='polite' className='sr-only'>
          {copyStatus === 'copied' && t('copied')}
          {copyStatus === 'error' && tCommon('errors.copy')}
        </p>

        <h1 className='mb-8 text-3xl leading-tight font-semibold text-balance text-foreground sm:text-4xl'>
          {t('title')}
        </h1>

        <section
          aria-labelledby='support-pitch'
          className={cn(
            BAND_SURFACE_CLASS,
            'grid overflow-hidden rounded-card elevation-raised md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]'
          )}
        >
          <div className='relative aspect-[4/3] min-w-0 md:aspect-auto md:min-h-[24rem]'>
            <img
              src={`${LANDING}/astra-porcini.webp`}
              alt=''
              className='absolute inset-0 size-full bg-muted object-cover'
            />
          </div>
          <div className='flex min-w-0 flex-col gap-6 p-6 sm:p-8 lg:p-10'>
            <h2
              id='support-pitch'
              className='text-3xl leading-[1.08] font-semibold text-balance text-happy-50 sm:text-4xl lg:text-5xl'
            >
              {t('subtitle')}
            </h2>
            <p className='leading-relaxed text-happy-100 sm:text-lg'>
              {t('description')}
            </p>
            <div className='mt-auto flex flex-wrap gap-3'>
              {coffee?.url ? (
                <Button asChild size='lg'>
                  <a
                    href={coffee.url}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    <coffee.icon />
                    {coffee.name}
                  </a>
                </Button>
              ) : null}
              {github?.url ? (
                <Button
                  asChild
                  size='lg'
                  variant='outline'
                  className={BAND_OUTLINE_CLASS}
                >
                  <a
                    href={github.url}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    <github.icon />
                    {github.name}
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section aria-labelledby='support-keeps' className='mt-12'>
          <h2
            id='support-keeps'
            className='mb-5 text-2xl font-semibold text-foreground sm:text-3xl'
          >
            {t('keepsRunning')}
          </h2>
          <ul className='grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-5'>
            {reasons.map((reason, index) => (
              <li
                key={reason}
                className={cn(
                  'flex flex-col overflow-hidden rounded-card bg-card elevation-raised',
                  // Five do not split into two columns: the first takes a row.
                  index === 0 && 'col-span-2 lg:col-span-1'
                )}
              >
                <ReasonPicture picture={REASON_PICTURES[index]} />
                <p className='p-4 leading-snug font-medium text-foreground'>
                  {reason}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby='support-crypto' className='mt-12'>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant='ghost' className='-ml-4 px-4 text-lg'>
                <span id='support-crypto'>{t('cryptoTitle')}</span>
                <ChevronDown />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className='pt-3'>
              <ul className='flex flex-col gap-3'>
                {crypto.map(method => (
                  <li
                    key={method.id}
                    className='flex flex-col gap-3 rounded-card bg-card p-4 elevation-raised sm:flex-row sm:items-center sm:gap-5 sm:p-5'
                  >
                    <div className='flex min-w-0 flex-1 items-start gap-3'>
                      <span className='grid size-10 shrink-0 place-items-center rounded-full bg-secondary'>
                        <method.icon className='size-5 text-primary-text' />
                      </span>
                      <div className='min-w-0'>
                        <p className='font-semibold text-foreground'>
                          {method.name}
                        </p>
                        <p className='mt-1 font-mono text-sm break-all text-muted-foreground'>
                          {method.address}
                        </p>
                        {copyStatus === 'error' && copyKey === method.id ? (
                          <p className='mt-1 text-sm text-destructive-text'>
                            {tCommon('errors.copy')}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className='flex shrink-0 gap-2'>
                      <Button
                        variant='outline'
                        onClick={() => copy(method.address!, method.id)}
                      >
                        {copiedId === method.id ? <CheckCircle /> : <Copy />}
                        {copiedId === method.id
                          ? t('copied')
                          : t('copyAddress')}
                      </Button>
                      <Button
                        variant='outline'
                        onClick={() => setQrMethod(method)}
                      >
                        <QrCode />
                        {t('showQR')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </section>

        <section
          aria-labelledby='support-contact'
          className='mt-12 flex flex-col gap-4 rounded-card bg-card p-6 elevation-raised sm:flex-row sm:items-center sm:justify-between sm:p-8'
        >
          <div>
            <h2
              id='support-contact'
              className='text-xl font-semibold text-foreground'
            >
              {t('contact.title')}
            </h2>
            <p className='mt-1 text-muted-foreground'>
              {t('contact.description')}
            </p>
          </div>
          <Button asChild variant='outline'>
            <a href={`mailto:${t('contact.email')}`}>
              <Mail />
              {t('contact.email')}
              <ExternalLink />
            </a>
          </Button>
        </section>

        <div className='mt-10 flex flex-col items-center gap-3 pb-4 text-center'>
          <p className='inline-flex items-center gap-2 font-medium text-primary-text'>
            <Heart className='size-5' />
            {t('thankYou')}
          </p>
          <p className='text-sm text-muted-foreground'>{t('credits')}</p>
        </div>

        {qrMethod?.address ? (
          <QRCodeModal
            isOpen
            onClose={() => setQrMethod(null)}
            address={qrMethod.address}
            methodName={qrMethod.name}
            onCopyAddress={address => {
              copy(address, qrMethod.id);
              setQrMethod(null);
            }}
          />
        ) : null}
      </div>
    </>
  );
}

/** A reason's picture: one photograph, or four species as a 2×2 plate. */
function ReasonPicture({ picture }: { picture: string | string[] }) {
  if (typeof picture === 'string') {
    return (
      <img
        src={picture}
        alt=''
        loading='lazy'
        decoding='async'
        className='aspect-[4/3] w-full bg-muted object-cover'
      />
    );
  }
  return (
    <span
      aria-hidden='true'
      className='grid aspect-[4/3] grid-cols-2 grid-rows-2 overflow-hidden'
    >
      {picture.map(id => (
        <img
          key={id}
          src={getSpeciesImage(id) ?? undefined}
          alt=''
          loading='lazy'
          decoding='async'
          className='size-full bg-muted object-cover'
        />
      ))}
    </span>
  );
}

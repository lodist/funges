import { useTranslation } from 'react-i18next';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Heart, ExternalLink, Copy, QrCode, CheckCircle } from '@/lib/icons';
import { useState } from 'react';
import { useSupportMethods } from '@/data/support';
import QRCodeModal from '@/components/QRCodeModal';
import React from 'react';
import SEO from '@/components/SEO';

export default function SupportPage() {
  const { t } = useTranslation('support');
  const supportMethods = useSupportMethods();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<
    (typeof supportMethods)[0] | null
  >(null);

  const handleCopyAddress = async (address: string, methodId: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(methodId);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const handleShowQR = (method: (typeof supportMethods)[0]) => {
    if (method.address) {
      setSelectedMethod(method);
      setQrModalOpen(true);
    }
  };

  const cryptoMethods = supportMethods.filter(
    method => method.type === 'crypto'
  );
  const platformMethods = supportMethods.filter(
    method => method.type === 'platform'
  );

  return (
    <>
      <SEO
        title={t('title')}
        description={t('description')}
        canonicalUrl={`${import.meta.env.BASE_URL}support`}
      />
      <div className='support-page max-w-6xl mx-auto px-4 py-8'>
        <div className='space-y-8'>
          {/* Header */}
          <div className='text-center'>
            <div className='flex justify-center mb-4'>
              <div className='p-4 bg-destructive/10 rounded-full'>
                <Heart className='h-12 w-12 text-destructive-text' />
              </div>
            </div>
            <h1 className='text-4xl font-bold text-foreground dark:text-white mb-4'>
              {t('title')}
            </h1>
            <p className='text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto'>
              {t('subtitle')}
            </p>
            <p className='text-lg text-muted-foreground leading-relaxed max-w-3xl mx-auto mt-4'>
              {t('description')}
            </p>
          </div>

          {/* Why Support Section */}
          <section className='bg-secondary bg-muted rounded-xl p-8'>
            <h2 className='text-2xl font-semibold text-foreground dark:text-white mb-6 text-center'>
              {t('whySupport.title')}
            </h2>
            <div className='grid md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {(
                t('whySupport.reasons', { returnObjects: true }) as string[]
              ).map((reason: string) => (
                <div key={reason} className='flex items-start space-x-3'>
                  <CheckCircle className='h-5 w-5 text-primary-text mt-0.5 flex-shrink-0' />
                  <p className='text-foreground'>{reason}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Platform Support Methods */}
          <section>
            <h2 className='text-2xl font-semibold text-foreground dark:text-white mb-6 text-center'>
              {t('platformSupport')}
            </h2>
            <div className='grid md:grid-cols-2 lg:grid-cols-3 gap-6'>
              {platformMethods.map(method => (
                <Card key={method.id} interactive className='relative'>
                  <CardHeader>
                    <div
                      className='mb-2 w-fit rounded-lg p-3'
                      style={{
                        backgroundColor: method.color
                          ? `${method.color}20`
                          : 'var(--accent)',
                      }}
                    >
                      {React.createElement(
                        method.icon as React.ComponentType<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
                        {
                          className: 'size-6',
                          style: { color: method.color },
                        }
                      )}
                    </div>
                    <CardTitle className='text-lg'>
                      {/* Stretched to the card so the whole tile is one link. */}
                      <a
                        href={method.url}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='focus-ring text-card-foreground rounded-sm after:absolute after:inset-0'
                      >
                        {method.name}
                      </a>
                    </CardTitle>
                    <CardDescription>{method.description}</CardDescription>
                    <CardAction>
                      <ExternalLink
                        aria-hidden='true'
                        className='size-5 text-muted-foreground'
                      />
                    </CardAction>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>

          {/* Crypto Donations */}
          <section>
            <h2 className='text-2xl font-semibold text-foreground dark:text-white mb-6 text-center'>
              {t('donate')}
            </h2>
            <div className='grid md:grid-cols-2 lg:grid-cols-3 gap-6'>
              {cryptoMethods.map(method => (
                <Card key={method.id}>
                  <CardHeader>
                    <div
                      className='mb-2 w-fit rounded-lg p-3'
                      style={{
                        backgroundColor: method.color
                          ? `${method.color}20`
                          : 'var(--accent)',
                      }}
                    >
                      {React.createElement(
                        method.icon as React.ComponentType<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
                        {
                          className: 'size-6',
                          style: { color: method.color },
                        }
                      )}
                    </div>
                    <CardTitle className='text-lg'>{method.name}</CardTitle>
                    <CardDescription>{method.description}</CardDescription>
                    <CardAction>
                      <Badge variant='secondary'>
                        {method.id.toUpperCase()}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  {method.address && (
                    <>
                      <CardContent>
                        <div className='bg-muted rounded-lg p-3'>
                          <p className='text-muted-foreground mb-1 text-xs'>
                            {t('address')}
                          </p>
                          <p className='font-mono text-sm break-all'>
                            {method.address}
                          </p>
                        </div>
                      </CardContent>
                      <CardFooter className='gap-2'>
                        <Button
                          variant='outline'
                          onClick={() =>
                            handleCopyAddress(method.address!, method.id)
                          }
                          className='flex-1'
                        >
                          {copiedAddress === method.id ? (
                            <CheckCircle />
                          ) : (
                            <Copy />
                          )}
                          {copiedAddress === method.id
                            ? t('copied')
                            : t('copyAddress')}
                        </Button>
                        <Button
                          variant='outline'
                          onClick={() => handleShowQR(method)}
                          className='flex-1'
                        >
                          <QrCode />
                          {t('showQR')}
                        </Button>
                      </CardFooter>
                    </>
                  )}
                </Card>
              ))}
            </div>
          </section>

          {/* Contact Section */}
          <section className='bg-muted rounded-xl p-8'>
            <h2 className='text-2xl font-semibold text-foreground dark:text-white mb-4 text-center'>
              {t('contact.title')}
            </h2>
            <p className='text-muted-foreground text-center mb-4'>
              {t('contact.description')}
            </p>
            <div className='text-center'>
              <a
                href={`mailto:${t('contact.email')}`}
                className='inline-flex items-center space-x-2 text-primary-text hover:underline'
              >
                <span>{t('contact.email')}</span>
                <ExternalLink className='h-4 w-4' />
              </a>
            </div>
          </section>

          {/* Contributor Credit */}
          <p className='text-center text-sm text-muted-foreground pt-4'>
            {t('credits')}
          </p>

          {/* Thank You Message */}
          <div className='text-center py-8'>
            <div className='inline-flex items-center space-x-2 bg-secondary px-6 py-4 rounded-full'>
              <Heart className='h-5 w-5 text-primary-text' />
              <span className='text-primary-text font-medium'>
                {t('thankYou')}
              </span>
            </div>
          </div>
        </div>

        {/* QR Code Modal */}
        {selectedMethod && (
          <QRCodeModal
            isOpen={qrModalOpen}
            onClose={() => {
              setQrModalOpen(false);
              setSelectedMethod(null);
            }}
            address={selectedMethod.address!}
            methodName={selectedMethod.name}
            onCopyAddress={address => {
              handleCopyAddress(address, selectedMethod.id);
              setQrModalOpen(false);
              setSelectedMethod(null);
            }}
          />
        )}
      </div>
    </>
  );
}

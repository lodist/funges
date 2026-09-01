import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy } from '@/lib/icons';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: string;
  methodName: string;
  onCopyAddress: (address: string) => void;
}

export default function QRCodeModal({
  isOpen,
  onClose,
  address,
  methodName,
  onCopyAddress,
}: QRCodeModalProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const { t } = useTranslation('support');

  useEffect(() => {
    if (isOpen && address) {
      QRCode.toDataURL(address, {
        width: 256,
        margin: 2,
        // Literal black/white, exempt from the warm-neutral palette: a QR code
        // needs maximum luminance contrast to scan reliably.
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })
        .then(url => {
          setQrCodeUrl(url);
        })
        .catch(err => {
          console.error('Error generating QR code:', err);
        });
    }
  }, [isOpen, address]);

  const handleCopy = () => {
    onCopyAddress(address);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center justify-between'>
            <span>
              {methodName} {t('qrCode')}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className='flex flex-col items-center space-y-4'>
          <div className='bg-white p-4 rounded-lg border'>
            {qrCodeUrl && (
              <img
                src={qrCodeUrl}
                alt={t('qrCode')}
                width={256}
                height={256}
                className='block'
                style={{ imageRendering: 'pixelated' }}
              />
            )}
          </div>

          <div className='w-full space-y-3'>
            <div className='text-sm'>
              <p className='font-medium text-foreground mb-1'>
                {t('address')}:
              </p>
              <p className='text-xs font-mono bg-muted p-2 rounded break-all'>
                {address}
              </p>
            </div>

            <div className='flex gap-2'>
              <Button onClick={handleCopy} variant='outline' className='flex-1'>
                <Copy className='h-4 w-4 mr-2' />
                {t('copyAddress')}
              </Button>
              <Button onClick={onClose} variant='outline' className='flex-1'>
                {t('close')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

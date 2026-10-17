import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setHtmlLanguage } from '@/lib/html-localization';
import { BAND_BUTTON_CLASS } from '@/lib/band-surface';
import { LANGUAGES, resolveLanguage } from '@/lib/languages';
import { cn } from '@/lib/utils';

/** `onBand`: over the map the pill wears the green of the map's other chrome. */
const FloatingLanguageSwitcher: React.FC<{ onBand?: boolean }> = ({
  onBand = false,
}) => {
  const { t, i18n } = useTranslation('common');
  const currentLanguage = resolveLanguage(i18n.language);

  const handleLanguageChange = (languageCode: string) => {
    setHtmlLanguage(languageCode);
    localStorage.setItem('language', languageCode);
  };

  return (
    <div className='fixed bottom-4 right-4 z-10'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='enhanced-outline'
            className={cn(
              'flex items-center gap-2',
              onBand && BAND_BUTTON_CLASS
            )}
            aria-label={`${t('common.language')}: ${currentLanguage.name}`}
          >
            <span className='type-micro'>{currentLanguage.code}</span>
            <span className='hidden sm:inline'>{currentLanguage.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='mb-2'>
          <DropdownMenuRadioGroup
            value={currentLanguage.code}
            onValueChange={handleLanguageChange}
          >
            {LANGUAGES.map(language => (
              <DropdownMenuRadioItem key={language.code} value={language.code}>
                <span className='type-micro w-6'>{language.code}</span>
                <span>{language.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default FloatingLanguageSwitcher;

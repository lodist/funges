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
import { LANGUAGES, resolveLanguage } from '@/lib/languages';

const LanguageSwitcher: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const currentLanguage = resolveLanguage(i18n.language);

  const handleLanguageChange = (languageCode: string) => {
    setHtmlLanguage(languageCode);
    localStorage.setItem('language', languageCode);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='flex items-center gap-2'
          aria-label={`${t('common.language')}: ${currentLanguage.name}`}
        >
          <span className='type-micro'>{currentLanguage.code}</span>
          <span>{currentLanguage.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='center'>
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
  );
};

export default LanguageSwitcher;

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setHtmlLanguage } from '@/lib/html-localization';

const FloatingLanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'pt', name: 'Português', flag: '🇵🇹' },
  ];

  const currentLanguage =
    languages.find(lang => lang.code === i18n.language) || languages[0];

  const handleLanguageChange = (languageCode: string) => {
    setHtmlLanguage(languageCode);
    localStorage.setItem('language', languageCode);
  };

  return (
    <div className='fixed bottom-4 right-4 z-10'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='outline'
            size='sm'
            className='flex items-center gap-2 shadow-[0_2px_10px_rgba(0,0,0,0.18)]'
          >
            <span className='text-lg'>{currentLanguage.flag}</span>
            <span className='hidden sm:inline'>{currentLanguage.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='mb-2'>
          {languages.map(language => (
            <DropdownMenuItem
              key={language.code}
              onClick={() => handleLanguageChange(language.code)}
              className={`flex items-center gap-2 ${
                i18n.language === language.code
                  ? 'bg-[var(--happy-100)] text-[var(--happy-900)] font-semibold'
                  : ''
              }`}
            >
              <span className='text-lg'>{language.flag}</span>
              <span>{language.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default FloatingLanguageSwitcher;

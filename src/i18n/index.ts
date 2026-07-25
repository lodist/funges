import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files from language-specific folders
import enCommon from './locales/en/common.json';
import enSpecies from './locales/en/species.json';
import enRecipes from './locales/en/recipes.json';
import enImpressum from './locales/en/impressum.json';
import enPrivacy from './locales/en/privacy.json';
import enTerms from './locales/en/terms.json';
import enSupport from './locales/en/support.json';
import enInstructions from './locales/en/instructions.json';
import enSidebar from './locales/en/sidebar.json';
import enMap from './locales/en/map.json';
import enSettings from './locales/en/settings.json';
import enOffline from './locales/en/offline.json';
import enIdentify from './locales/en/identify.json';
import itCommon from './locales/it/common.json';
import itSpecies from './locales/it/species.json';
import itRecipes from './locales/it/recipes.json';
import itImpressum from './locales/it/impressum.json';
import itPrivacy from './locales/it/privacy.json';
import itTerms from './locales/it/terms.json';
import itSupport from './locales/it/support.json';
import itInstructions from './locales/it/instructions.json';
import itSidebar from './locales/it/sidebar.json';
import itMap from './locales/it/map.json';
import itSettings from './locales/it/settings.json';
import itOffline from './locales/it/offline.json';
import frCommon from './locales/fr/common.json';
import frSpecies from './locales/fr/species.json';
import frRecipes from './locales/fr/recipes.json';
import frImpressum from './locales/fr/impressum.json';
import frPrivacy from './locales/fr/privacy.json';
import frTerms from './locales/fr/terms.json';
import frSupport from './locales/fr/support.json';
import frInstructions from './locales/fr/instructions.json';
import frSidebar from './locales/fr/sidebar.json';
import frMap from './locales/fr/map.json';
import frSettings from './locales/fr/settings.json';
import frOffline from './locales/fr/offline.json';
import deCommon from './locales/de/common.json';
import deSpecies from './locales/de/species.json';
import deRecipes from './locales/de/recipes.json';
import deImpressum from './locales/de/impressum.json';
import dePrivacy from './locales/de/privacy.json';
import deTerms from './locales/de/terms.json';
import deSupport from './locales/de/support.json';
import deInstructions from './locales/de/instructions.json';
import deSidebar from './locales/de/sidebar.json';
import deMap from './locales/de/map.json';
import deSettings from './locales/de/settings.json';
import deOffline from './locales/de/offline.json';
import esCommon from './locales/es/common.json';
import esSpecies from './locales/es/species.json';
import esRecipes from './locales/es/recipes.json';
import esImpressum from './locales/es/impressum.json';
import esPrivacy from './locales/es/privacy.json';
import esTerms from './locales/es/terms.json';
import esSupport from './locales/es/support.json';
import esInstructions from './locales/es/instructions.json';
import esSidebar from './locales/es/sidebar.json';
import esMap from './locales/es/map.json';
import esSettings from './locales/es/settings.json';
import esOffline from './locales/es/offline.json';
import ptCommon from './locales/pt/common.json';
import ptSpecies from './locales/pt/species.json';
import ptRecipes from './locales/pt/recipes.json';
import ptImpressum from './locales/pt/impressum.json';
import ptPrivacy from './locales/pt/privacy.json';
import ptTerms from './locales/pt/terms.json';
import ptSupport from './locales/pt/support.json';
import ptInstructions from './locales/pt/instructions.json';
import ptSidebar from './locales/pt/sidebar.json';
import ptMap from './locales/pt/map.json';
import ptSettings from './locales/pt/settings.json';
import ptOffline from './locales/pt/offline.json';

const resources = {
  en: {
    common: enCommon,
    species: enSpecies,
    recipes: enRecipes,
    impressum: enImpressum,
    privacy: enPrivacy,
    terms: enTerms,
    support: enSupport,
    instructions: enInstructions,
    sidebar: enSidebar,
    map: enMap,
    settings: enSettings,
    offline: enOffline,
    // English only for now. The other five languages fall back to en via
    // fallbackLng, which is deliberate: this namespace carries safety copy
    // ("contains amatoxins — often fatal", "do not eat") and a machine
    // translation reviewed by nobody is worse than English a reader can
    // recognise as untranslated. Needs a human translator.
    identify: enIdentify,
  },
  it: {
    common: itCommon,
    species: itSpecies,
    recipes: itRecipes,
    impressum: itImpressum,
    privacy: itPrivacy,
    terms: itTerms,
    support: itSupport,
    instructions: itInstructions,
    sidebar: itSidebar,
    map: itMap,
    settings: itSettings,
    offline: itOffline,
  },
  fr: {
    common: frCommon,
    species: frSpecies,
    recipes: frRecipes,
    impressum: frImpressum,
    privacy: frPrivacy,
    terms: frTerms,
    support: frSupport,
    instructions: frInstructions,
    sidebar: frSidebar,
    map: frMap,
    settings: frSettings,
    offline: frOffline,
  },
  de: {
    common: deCommon,
    species: deSpecies,
    recipes: deRecipes,
    impressum: deImpressum,
    privacy: dePrivacy,
    terms: deTerms,
    support: deSupport,
    instructions: deInstructions,
    sidebar: deSidebar,
    map: deMap,
    settings: deSettings,
    offline: deOffline,
  },
  es: {
    common: esCommon,
    species: esSpecies,
    recipes: esRecipes,
    impressum: esImpressum,
    privacy: esPrivacy,
    terms: esTerms,
    support: esSupport,
    instructions: esInstructions,
    sidebar: esSidebar,
    map: esMap,
    settings: esSettings,
    offline: esOffline,
  },
  pt: {
    common: ptCommon,
    species: ptSpecies,
    recipes: ptRecipes,
    impressum: ptImpressum,
    privacy: ptPrivacy,
    terms: ptTerms,
    support: ptSupport,
    instructions: ptInstructions,
    sidebar: ptSidebar,
    map: ptMap,
    settings: ptSettings,
    offline: ptOffline,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

export default i18n;

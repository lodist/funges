import { useTranslation } from 'react-i18next';

export interface Species {
  id: string;
  nameKey: string;
  scientificName: string;
  category: 'mushroom' | 'plant' | 'berry' | 'nut' | 'flower';
  emoji: string;
  descriptionKey: string;
  howToKey: string;
  season?: string;
  habitat?: string;
  showOnMap?: boolean;
}

export interface SpeciesOption {
  code: string;
  emoji: string;
  category: Species['category'];
}

export interface SpeciesWithTranslations
  extends Omit<Species, 'nameKey' | 'descriptionKey' | 'howToKey'> {
  name: string;
  description: string;
  howTo: string;
}

// Base species data without translations
export const SPECIES_DATA: Species[] = [
  {
    id: 'chant',
    nameKey: 'chant.name',
    scientificName: 'Cantharellus cibarius',
    category: 'mushroom',
    emoji: '🍄‍🟫',
    descriptionKey: 'chant.description',
    howToKey: 'chant.howTo',
    season: 'summer-fall',
    habitat: 'forest',
    showOnMap: true,
  },
  {
    id: 'mushroom',
    nameKey: 'mushroom.name',
    scientificName: 'Boletus edulis',
    category: 'mushroom',
    emoji: '🍄‍🟫',
    descriptionKey: 'mushroom.description',
    howToKey: 'mushroom.howTo',
    season: 'fall',
    habitat: 'forest',
    showOnMap: true,
  },
  {
    id: 'morel',
    nameKey: 'morel.name',
    scientificName: 'Morchella esculenta',
    category: 'mushroom',
    emoji: '🍄‍🟫',
    descriptionKey: 'morel.description',
    howToKey: 'morel.howTo',
    season: 'spring',
    habitat: 'forest',
    showOnMap: true,
  },
  {
    id: 'blackberry',
    nameKey: 'blackberry.name',
    scientificName: 'Rubus fruticosus',
    category: 'berry',
    emoji: '🫐',
    descriptionKey: 'blackberry.description',
    howToKey: 'blackberry.howTo',
    season: 'summer-fall',
    habitat: 'hedgerow',
  },
  {
    id: 'elderberry',
    nameKey: 'elderberry.name',
    scientificName: 'Sambucus nigra',
    category: 'berry',
    emoji: '🫐',
    descriptionKey: 'elderberry.description',
    howToKey: 'elderberry.howTo',
    season: 'fall',
    habitat: 'hedgerow',
  },
  {
    id: 'nettle',
    nameKey: 'nettle.name',
    scientificName: 'Urtica dioica',
    category: 'plant',
    emoji: '🌿',
    descriptionKey: 'nettle.description',
    howToKey: 'nettle.howTo',
    season: 'spring-summer',
    habitat: 'meadow',
    showOnMap: true,
  },
  {
    id: 'dandelion',
    nameKey: 'dandelion.name',
    scientificName: 'Taraxacum officinale',
    category: 'flower',
    emoji: '🌸',
    descriptionKey: 'dandelion.description',
    howToKey: 'dandelion.howTo',
    season: 'spring-summer',
    habitat: 'meadow',
    showOnMap: true,
  },
  {
    id: 'hazelnut',
    nameKey: 'hazelnut.name',
    scientificName: 'Corylus avellana',
    category: 'nut',
    emoji: '🌰',
    descriptionKey: 'hazelnut.description',
    howToKey: 'hazelnut.howTo',
    season: 'fall',
    habitat: 'forest',
  },
  {
    id: 'garlic',
    nameKey: 'garlic.name',
    scientificName: 'Allium ursinum',
    category: 'plant',
    emoji: '🧄',
    descriptionKey: 'garlic.description',
    howToKey: 'garlic.howTo',
    season: 'spring',
    habitat: 'forest',
    showOnMap: true,
  },
  {
    id: 'chicken-of-the-woods',
    nameKey: 'chickenOfTheWoods.name',
    scientificName: 'Laetiporus sulphureus',
    category: 'mushroom',
    emoji: '🍄',
    descriptionKey: 'chickenOfTheWoods.description',
    howToKey: 'chickenOfTheWoods.howTo',
    season: 'summer-fall',
    habitat: 'forest',
  },
  {
    id: 'oyster-mushroom',
    nameKey: 'oysterMushroom.name',
    scientificName: 'Pleurotus ostreatus',
    category: 'mushroom',
    emoji: '🍄',
    descriptionKey: 'oysterMushroom.description',
    howToKey: 'oysterMushroom.howTo',
    season: 'fall-winter',
    habitat: 'forest',
  },
  {
    id: 'shiitake',
    nameKey: 'shiitake.name',
    scientificName: 'Lentinula edodes',
    category: 'mushroom',
    emoji: '🍄',
    descriptionKey: 'shiitake.description',
    howToKey: 'shiitake.howTo',
    season: 'spring-fall',
    habitat: 'forest',
  },
  {
    id: 'raspberry',
    nameKey: 'raspberry.name',
    scientificName: 'Rubus idaeus',
    category: 'berry',
    emoji: '🫐',
    descriptionKey: 'raspberry.description',
    howToKey: 'raspberry.howTo',
    season: 'summer',
    habitat: 'hedgerow',
    showOnMap: true,
  },
  {
    id: 'blueberry',
    nameKey: 'blueberry.name',
    scientificName: 'Vaccinium myrtillus',
    category: 'berry',
    emoji: '🫐',
    descriptionKey: 'blueberry.description',
    howToKey: 'blueberry.howTo',
    season: 'summer-fall',
    habitat: 'forest',
  },
  {
    id: 'strawberry',
    nameKey: 'strawberry.name',
    scientificName: 'Fragaria vesca',
    category: 'berry',
    emoji: '🍓',
    descriptionKey: 'strawberry.description',
    howToKey: 'strawberry.howTo',
    season: 'spring-summer',
    habitat: 'meadow',
    showOnMap: true,
  },
  {
    id: 'wild-mint',
    nameKey: 'wildMint.name',
    scientificName: 'Mentha arvensis',
    category: 'plant',
    emoji: '🌿',
    descriptionKey: 'wildMint.description',
    howToKey: 'wildMint.howTo',
    season: 'spring-summer',
    habitat: 'meadow',
  },
  {
    id: 'chickweed',
    nameKey: 'chickweed.name',
    scientificName: 'Stellaria media',
    category: 'plant',
    emoji: '🌿',
    descriptionKey: 'chickweed.description',
    howToKey: 'chickweed.howTo',
    season: 'spring-fall',
    habitat: 'meadow',
    showOnMap: true,
  },
  {
    id: 'plantain',
    nameKey: 'plantain.name',
    scientificName: 'Plantago major',
    category: 'plant',
    emoji: '🌿',
    descriptionKey: 'plantain.description',
    howToKey: 'plantain.howTo',
    season: 'spring-fall',
    habitat: 'meadow',
  },
  {
    id: 'walnut',
    nameKey: 'walnut.name',
    scientificName: 'Juglans regia',
    category: 'nut',
    emoji: '🌰',
    descriptionKey: 'walnut.description',
    howToKey: 'walnut.howTo',
    season: 'fall',
    habitat: 'forest',
    showOnMap: true,
  },
  {
    id: 'chestnut',
    nameKey: 'chestnut.name',
    scientificName: 'Castanea sativa',
    category: 'nut',
    emoji: '🌰',
    descriptionKey: 'chestnut.description',
    howToKey: 'chestnut.howTo',
    season: 'fall',
    habitat: 'forest',
    showOnMap: true,
  },
  {
    id: 'elderflower',
    nameKey: 'elderflower.name',
    scientificName: 'Sambucus nigra',
    category: 'flower',
    emoji: '🌸',
    descriptionKey: 'elderflower.description',
    howToKey: 'elderflower.howTo',
    season: 'spring-summer',
    habitat: 'hedgerow',
  },
  {
    id: 'daisy',
    nameKey: 'daisy.name',
    scientificName: 'Bellis perennis',
    category: 'flower',
    emoji: '🌸',
    descriptionKey: 'daisy.description',
    howToKey: 'daisy.howTo',
    season: 'spring-summer',
    habitat: 'meadow',
  },
  {
    id: 'violets',
    nameKey: 'violets.name',
    scientificName: 'Viola odorata',
    category: 'flower',
    emoji: '🌸',
    descriptionKey: 'violets.description',
    howToKey: 'violets.howTo',
    season: 'spring',
    habitat: 'meadow',
  },
  {
    id: 'amaranth',
    nameKey: 'amaranth.name',
    scientificName: 'Amaranthus retroflexus',
    category: 'plant',
    emoji: '🌿',
    descriptionKey: 'amaranth.description',
    howToKey: 'amaranth.howTo',
    season: 'spring-fall',
    habitat: 'meadow',
    showOnMap: true,
  },
  {
    id: 'artichoke',
    nameKey: 'artichoke.name',
    scientificName: 'Cynara cardunculus',
    category: 'plant',
    emoji: '🌿',
    descriptionKey: 'artichoke.description',
    howToKey: 'artichoke.howTo',
    season: 'spring-summer',
    habitat: 'meadow',
    showOnMap: true,
  },
  {
    id: 'asparagus',
    nameKey: 'asparagus.name',
    scientificName: 'Asparagus acutifolius',
    category: 'plant',
    emoji: '🌿',
    descriptionKey: 'asparagus.description',
    howToKey: 'asparagus.howTo',
    season: 'spring',
    habitat: 'hedgerow',
    showOnMap: true,
  },
  {
    id: 'black_chant',
    nameKey: 'black_chant.name',
    scientificName: 'Craterellus cornucopioides',
    category: 'mushroom',
    emoji: '🍄‍🟫',
    descriptionKey: 'black_chant.description',
    howToKey: 'black_chant.howTo',
    season: 'fall',
    habitat: 'forest',
    showOnMap: true,
  },
  {
    id: 'lingonb',
    nameKey: 'lingonb.name',
    scientificName: 'Vaccinium vitis-idaea',
    category: 'berry',
    emoji: '🫐',
    descriptionKey: 'lingonb.description',
    howToKey: 'lingonb.howTo',
    season: 'summer-fall',
    habitat: 'forest',
    showOnMap: true,
  },
  {
    id: 'masterwort',
    nameKey: 'masterwort.name',
    scientificName: 'Peucedanum ostruthium',
    category: 'plant',
    emoji: '🌿',
    descriptionKey: 'masterwort.description',
    howToKey: 'masterwort.howTo',
    season: 'summer',
    habitat: 'meadow',
    showOnMap: true,
  },
  {
    id: 'parasol',
    nameKey: 'parasol.name',
    scientificName: 'Macrolepiota procera',
    category: 'mushroom',
    emoji: '🍄‍🟫',
    descriptionKey: 'parasol.description',
    howToKey: 'parasol.howTo',
    season: 'summer-fall',
    habitat: 'meadow',
    showOnMap: true,
  },
  {
    id: 'sorrel',
    nameKey: 'sorrel.name',
    scientificName: 'Rumex acetosa',
    category: 'plant',
    emoji: '🌿',
    descriptionKey: 'sorrel.description',
    howToKey: 'sorrel.howTo',
    season: 'spring-summer',
    habitat: 'meadow',
    showOnMap: true,
  },
  {
    id: 'st_george',
    nameKey: 'st_george.name',
    scientificName: 'Calocybe gambosa',
    category: 'mushroom',
    emoji: '🍄‍🟫',
    descriptionKey: 'st_george.description',
    howToKey: 'st_george.howTo',
    season: 'spring',
    habitat: 'meadow',
    showOnMap: true,
  },
  {
    id: 'truffle_b',
    nameKey: 'truffle_b.name',
    scientificName: 'Tuber melanosporum',
    category: 'mushroom',
    emoji: '🍄‍🟫',
    descriptionKey: 'truffle_b.description',
    howToKey: 'truffle_b.howTo',
    season: 'winter',
    habitat: 'forest',
    showOnMap: true,
  },
];

// Hook for React components
export const useSpeciesData = (): SpeciesWithTranslations[] => {
  const { t } = useTranslation('species', { keyPrefix: 'list_of_species' });

  return SPECIES_DATA.map(species => ({
    ...species,
    name: t(species.nameKey),
    description: t(species.descriptionKey),
    howTo: t(species.howToKey),
  }));
};

// Utility functions for non-React usage
export const getSpeciesById = (id: string): Species | undefined => {
  return SPECIES_DATA.find(species => species.id === id);
};

export const getSpeciesByCategory = (
  category: Species['category']
): Species[] => {
  return SPECIES_DATA.filter(species => species.category === category);
};

export const getAllSpecies = (): Species[] => {
  return SPECIES_DATA;
};

export const getSpeciesOptions = (): SpeciesOption[] => {
  return SPECIES_DATA.filter(({ showOnMap }) => showOnMap).map(
    ({ id, emoji, category }) => ({
      code: id,
      emoji,
      category,
    })
  );
};

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GENERATED_SPECIES_DATA } from '@/generated/species-catalog';

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
  forecastRegions?: readonly ForecastRegion[];
}

export type ForecastRegion = 'NE' | 'SE' | 'USE' | 'USW';

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

export const SPECIES_DATA: Species[] = GENERATED_SPECIES_DATA;

export const useSpeciesData = (): SpeciesWithTranslations[] => {
  const { t } = useTranslation('species', { keyPrefix: 'list_of_species' });

  return useMemo(
    () =>
      SPECIES_DATA.map(species => ({
        ...species,
        name: t(species.nameKey),
        description: t(species.descriptionKey),
        howTo: t(species.howToKey),
      })),
    [t]
  );
};

export const getSpeciesById = (id: string): Species | undefined =>
  SPECIES_DATA.find(species => species.id === id);

export const getSpeciesByCategory = (
  category: Species['category']
): Species[] => SPECIES_DATA.filter(species => species.category === category);

export const getAllSpecies = (): Species[] => SPECIES_DATA;

export const getSpeciesOptions = (region?: ForecastRegion): SpeciesOption[] =>
  SPECIES_DATA.filter(
    ({ showOnMap, forecastRegions }) =>
      showOnMap && (!region || forecastRegions?.includes(region))
  ).map(({ id, emoji, category }) => ({ code: id, emoji, category }));

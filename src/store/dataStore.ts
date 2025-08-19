import { create } from 'zustand';

export interface Species {
  id: string;
  name: string;
  scientificName: string;
  type: 'mushroom' | 'plant' | 'berry' | 'herb';
  description: string;
  habitat: string;
  season: string[];
  edibility: 'edible' | 'inedible' | 'poisonous' | 'unknown';
  cookingNotes?: string;
  warnings?: string;
  imageUrl?: string;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: string[];
  instructions: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  prepTime: number; // in minutes
  cookTime: number; // in minutes
  servings: number;
  tags: string[];
  warnings?: string;
}

export interface WeatherData {
  temperature: number;
  humidity: number;
  precipitation: number;
  windSpeed: number;
  timestamp: number;
  location: {
    latitude: number;
    longitude: number;
  };
}

export interface DataState {
  // Cached data
  species: Record<string, Species>;
  recipes: Record<string, Recipe>;
  weatherData: Record<string, WeatherData>;

  // Loading states
  isLoadingSpecies: boolean;
  isLoadingRecipes: boolean;
  isLoadingWeather: boolean;

  // Cache timestamps
  lastSpeciesUpdate: number;
  lastRecipesUpdate: number;
  lastWeatherUpdate: number;

  // Actions
  setSpecies: (species: Species[]) => void;
  addSpecies: (species: Species) => void;
  getSpecies: (id: string) => Species | null;
  setRecipes: (recipes: Recipe[]) => void;
  addRecipe: (recipe: Recipe) => void;
  getRecipe: (id: string) => Recipe | null;
  setWeatherData: (location: string, data: WeatherData) => void;
  getWeatherData: (location: string) => WeatherData | null;
  setLoadingSpecies: (loading: boolean) => void;
  setLoadingRecipes: (loading: boolean) => void;
  setLoadingWeather: (loading: boolean) => void;
  clearCache: () => void;
}

export const useDataStore = create<DataState>((set, get) => ({
  // Initial state
  species: {},
  recipes: {},
  weatherData: {},
  isLoadingSpecies: false,
  isLoadingRecipes: false,
  isLoadingWeather: false,
  lastSpeciesUpdate: 0,
  lastRecipesUpdate: 0,
  lastWeatherUpdate: 0,

  // Actions
  setSpecies: (speciesList: Species[]) => {
    const speciesMap = speciesList.reduce(
      (acc, species) => {
        acc[species.id] = species;
        return acc;
      },
      {} as Record<string, Species>
    );

    set({
      species: speciesMap,
      lastSpeciesUpdate: Date.now(),
    });
  },

  addSpecies: (species: Species) =>
    set(state => ({
      species: { ...state.species, [species.id]: species },
    })),

  getSpecies: (id: string) => {
    const state = get();
    return state.species[id] || null;
  },

  setRecipes: (recipesList: Recipe[]) => {
    const recipesMap = recipesList.reduce(
      (acc, recipe) => {
        acc[recipe.id] = recipe;
        return acc;
      },
      {} as Record<string, Recipe>
    );

    set({
      recipes: recipesMap,
      lastRecipesUpdate: Date.now(),
    });
  },

  addRecipe: (recipe: Recipe) =>
    set(state => ({
      recipes: { ...state.recipes, [recipe.id]: recipe },
    })),

  getRecipe: (id: string) => {
    const state = get();
    return state.recipes[id] || null;
  },

  setWeatherData: (location: string, data: WeatherData) =>
    set(state => ({
      weatherData: { ...state.weatherData, [location]: data },
      lastWeatherUpdate: Date.now(),
    })),

  getWeatherData: (location: string) => {
    const state = get();
    return state.weatherData[location] || null;
  },

  setLoadingSpecies: (loading: boolean) => set({ isLoadingSpecies: loading }),
  setLoadingRecipes: (loading: boolean) => set({ isLoadingRecipes: loading }),
  setLoadingWeather: (loading: boolean) => set({ isLoadingWeather: loading }),

  clearCache: () =>
    set({
      species: {},
      recipes: {},
      weatherData: {},
      lastSpeciesUpdate: 0,
      lastRecipesUpdate: 0,
      lastWeatherUpdate: 0,
    }),
}));

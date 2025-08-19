// API base URL and configuration
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'https://api.fung.es';

// Common API response types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface Species {
  id: string;
  name: string;
  scientificName: string;
  type: 'mushroom' | 'plant' | 'berry' | 'nut' | 'flower';
  description: string;
  edible: boolean;
  poisonous: boolean;
  season: string[];
  region: string[];
  imageUrl?: string;
  cookingTips?: string[];
  safetyNotes?: string[];
  habitat?: string;
  identification?: string[];
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: string[];
  instructions: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  prepTime: number;
  cookTime: number;
  servings: number;
  imageUrl?: string;
  tags?: string[];
  warnings?: string[];
  nutritionInfo?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
}

export interface MapRegion {
  id: string;
  name: string;
  coordinates: [number, number];
  weatherData: {
    temperature: number;
    humidity: number;
    precipitation: number;
    forecast: Array<{
      date: string;
      temperature: number;
      humidity: number;
      precipitation: number;
    }>;
  };
  soilData: {
    ph: number;
    moisture: number;
    type: string;
    nutrients: {
      nitrogen: number;
      phosphorus: number;
      potassium: number;
    };
  };
}

export interface ForagingSpot {
  id: string;
  name: string;
  coordinates: [number, number];
  regionId: string;
  species: string[];
  seasonality: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  images?: string[];
  userReports: Array<{
    userId: string;
    date: string;
    found: boolean;
    quantity?: number;
    notes?: string;
  }>;
}

export interface User {
  id: string;
  email: string;
  username: string;
  preferences: {
    region: string;
    notifications: boolean;
    language: 'en' | 'it';
    theme: 'light' | 'dark';
  };
  foragingHistory: Array<{
    speciesId: string;
    date: string;
    location: [number, number];
    quantity: number;
    notes?: string;
  }>;
  favorites: {
    species: string[];
    recipes: string[];
    spots: string[];
  };
}

export interface ClassificationResult {
  species: string;
  confidence: number;
  alternatives: Array<{
    species: string;
    confidence: number;
  }>;
  warnings?: string[];
  recommendations?: string[];
}

export interface DonationInfo {
  bitcoin: {
    address: string;
    qrCode: string;
  };
  ethereum: {
    address: string;
    qrCode: string;
  };
  iota: {
    address: string;
    qrCode: string;
  };
  patreon: {
    url: string;
    qrCode: string;
  };
  buymeacoffee: {
    url: string;
    qrCode: string;
  };
}

export interface WeatherForecast {
  location: string;
  coordinates: [number, number];
  current: {
    temperature: number;
    humidity: number;
    precipitation: number;
    windSpeed: number;
    description: string;
  };
  forecast: Array<{
    date: string;
    temperature: {
      min: number;
      max: number;
    };
    humidity: number;
    precipitation: number;
    description: string;
  }>;
}

import {
  API_BASE_URL,
  type Species,
  type Recipe,
  type MapRegion,
  type ForagingSpot,
  type User,
  type ClassificationResult,
  type DonationInfo,
  type WeatherForecast,
} from '@/types/api';

// API functions
export const api = {
  // Species API
  species: {
    async getAll(): Promise<Species[]> {
      const response = await fetch(`${API_BASE_URL}/species`);
      if (!response.ok) {
        throw new Error('Failed to fetch species');
      }
      return response.json();
    },

    async getById(id: string): Promise<Species> {
      const response = await fetch(`${API_BASE_URL}/species/${id}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch species ${id}`);
      }
      return response.json();
    },

    async search(query: string): Promise<Species[]> {
      const response = await fetch(
        `${API_BASE_URL}/species/search?q=${encodeURIComponent(query)}`
      );
      if (!response.ok) {
        throw new Error('Failed to search species');
      }
      return response.json();
    },

    async getByType(type: Species['type']): Promise<Species[]> {
      const response = await fetch(`${API_BASE_URL}/species/type/${type}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch species by type ${type}`);
      }
      return response.json();
    },

    async getByRegion(region: string): Promise<Species[]> {
      const response = await fetch(
        `${API_BASE_URL}/species/region/${encodeURIComponent(region)}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch species by region ${region}`);
      }
      return response.json();
    },

    async getBySeason(season: string): Promise<Species[]> {
      const response = await fetch(
        `${API_BASE_URL}/species/season/${encodeURIComponent(season)}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch species by season ${season}`);
      }
      return response.json();
    },
  },

  // Recipes API
  recipes: {
    async getAll(): Promise<Recipe[]> {
      const response = await fetch(`${API_BASE_URL}/recipes`);
      if (!response.ok) {
        throw new Error('Failed to fetch recipes');
      }
      return response.json();
    },

    async getById(id: string): Promise<Recipe> {
      const response = await fetch(`${API_BASE_URL}/recipes/${id}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch recipe ${id}`);
      }
      return response.json();
    },

    async getByIngredient(ingredient: string): Promise<Recipe[]> {
      const response = await fetch(
        `${API_BASE_URL}/recipes/by-ingredient/${encodeURIComponent(ingredient)}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch recipes by ingredient');
      }
      return response.json();
    },

    async getByDifficulty(difficulty: Recipe['difficulty']): Promise<Recipe[]> {
      const response = await fetch(
        `${API_BASE_URL}/recipes/difficulty/${difficulty}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch recipes by difficulty ${difficulty}`);
      }
      return response.json();
    },

    async search(query: string): Promise<Recipe[]> {
      const response = await fetch(
        `${API_BASE_URL}/recipes/search?q=${encodeURIComponent(query)}`
      );
      if (!response.ok) {
        throw new Error('Failed to search recipes');
      }
      return response.json();
    },

    async getSuggested(speciesId: string): Promise<Recipe[]> {
      const response = await fetch(
        `${API_BASE_URL}/recipes/suggested/${speciesId}`
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch suggested recipes for species ${speciesId}`
        );
      }
      return response.json();
    },
  },

  // Map API
  map: {
    async getRegions(): Promise<MapRegion[]> {
      const response = await fetch(`${API_BASE_URL}/map/regions`);
      if (!response.ok) {
        throw new Error('Failed to fetch map regions');
      }
      return response.json();
    },

    async getWeather(regionId: string): Promise<MapRegion['weatherData']> {
      const response = await fetch(`${API_BASE_URL}/map/weather/${regionId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch weather for region ${regionId}`);
      }
      return response.json();
    },

    async getSoil(regionId: string): Promise<MapRegion['soilData']> {
      const response = await fetch(`${API_BASE_URL}/map/soil/${regionId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch soil data for region ${regionId}`);
      }
      return response.json();
    },

    async getForagingSpots(regionId?: string): Promise<ForagingSpot[]> {
      const url = regionId
        ? `${API_BASE_URL}/map/spots?regionId=${regionId}`
        : `${API_BASE_URL}/map/spots`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch foraging spots');
      }
      return response.json();
    },

    async getNearbySpots(
      coordinates: [number, number],
      radius: number = 10
    ): Promise<ForagingSpot[]> {
      const [lat, lng] = coordinates;
      const response = await fetch(
        `${API_BASE_URL}/map/spots/nearby?lat=${lat}&lng=${lng}&radius=${radius}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch nearby foraging spots');
      }
      return response.json();
    },

    async addSpot(
      spot: Omit<ForagingSpot, 'id' | 'userReports'>
    ): Promise<ForagingSpot> {
      const response = await fetch(`${API_BASE_URL}/map/spots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(spot),
      });
      if (!response.ok) {
        throw new Error('Failed to add foraging spot');
      }
      return response.json();
    },

    async reportSpot(
      spotId: string,
      report: ForagingSpot['userReports'][0]
    ): Promise<void> {
      const response = await fetch(
        `${API_BASE_URL}/map/spots/${spotId}/reports`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(report),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to report foraging spot');
      }
    },
  },

  // AI Classification API
  classification: {
    async classifyImage(imageFile: File): Promise<ClassificationResult[]> {
      const formData = new FormData();
      formData.append('image', imageFile);

      const response = await fetch(`${API_BASE_URL}/classify`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to classify image');
      }

      return response.json();
    },

    async classifyMultiple(images: File[]): Promise<ClassificationResult[][]> {
      const formData = new FormData();
      images.forEach((image, index) => {
        formData.append(`image_${index}`, image);
      });

      const response = await fetch(`${API_BASE_URL}/classify/batch`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to classify images');
      }

      return response.json();
    },
  },

  // User API
  user: {
    async getProfile(): Promise<User> {
      const response = await fetch(`${API_BASE_URL}/user/profile`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }
      return response.json();
    },

    async updateProfile(updates: Partial<User>): Promise<User> {
      const response = await fetch(`${API_BASE_URL}/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        throw new Error('Failed to update user profile');
      }
      return response.json();
    },

    async addForagingRecord(record: User['foragingHistory'][0]): Promise<void> {
      const response = await fetch(`${API_BASE_URL}/user/foraging-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(record),
      });
      if (!response.ok) {
        throw new Error('Failed to add foraging record');
      }
    },

    async getForagingHistory(): Promise<User['foragingHistory']> {
      const response = await fetch(`${API_BASE_URL}/user/foraging-history`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch foraging history');
      }
      return response.json();
    },

    async toggleFavorite(
      type: 'species' | 'recipes' | 'spots',
      id: string
    ): Promise<void> {
      const response = await fetch(
        `${API_BASE_URL}/user/favorites/${type}/${id}`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to toggle favorite ${type}`);
      }
    },
  },

  // Weather API
  weather: {
    async getForecast(coordinates: [number, number]): Promise<WeatherForecast> {
      const [lat, lng] = coordinates;
      const response = await fetch(
        `${API_BASE_URL}/weather/forecast?lat=${lat}&lng=${lng}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch weather forecast');
      }
      return response.json();
    },

    async getCurrent(
      coordinates: [number, number]
    ): Promise<WeatherForecast['current']> {
      const [lat, lng] = coordinates;
      const response = await fetch(
        `${API_BASE_URL}/weather/current?lat=${lat}&lng=${lng}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch current weather');
      }
      return response.json();
    },
  },

  // Donations API
  donations: {
    async getInfo(): Promise<DonationInfo> {
      const response = await fetch(`${API_BASE_URL}/donations/info`);
      if (!response.ok) {
        throw new Error('Failed to fetch donation information');
      }
      return response.json();
    },
  },

  // Analytics API
  analytics: {
    async getSpeciesStats(): Promise<Record<string, number>> {
      const response = await fetch(`${API_BASE_URL}/analytics/species-stats`);
      if (!response.ok) {
        throw new Error('Failed to fetch species statistics');
      }
      return response.json();
    },

    async getRegionStats(): Promise<Record<string, number>> {
      const response = await fetch(`${API_BASE_URL}/analytics/region-stats`);
      if (!response.ok) {
        throw new Error('Failed to fetch region statistics');
      }
      return response.json();
    },

    async getSeasonalStats(): Promise<Record<string, number>> {
      const response = await fetch(`${API_BASE_URL}/analytics/seasonal-stats`);
      if (!response.ok) {
        throw new Error('Failed to fetch seasonal statistics');
      }
      return response.json();
    },
  },
};

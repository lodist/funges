import { createFileRoute, redirect } from '@tanstack/react-router';
import { useMapStore } from '@/store/mapStore';

// The atlas opens where the visitor's map is: porcini across Europe, morels
// across the United States.
export const Route = createFileRoute('/data_/seasons/')({
  beforeLoad: () => {
    const us = ['USE', 'USW'].includes(useMapStore.getState().forecastRegion);
    throw redirect({
      to: '/data/seasons/$place/$species',
      params: us
        ? { place: 'united-states', species: 'morel' }
        : { place: 'europe', species: 'porcini' },
      replace: true,
    });
  },
});

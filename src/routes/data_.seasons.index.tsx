import { createFileRoute, redirect } from '@tanstack/react-router';
import { useMapStore } from '@/store/mapStore';

// The atlas opens where the visitor's map is: porcini across Europe, morels
// across the United States, Australia and New Zealand's own (the page picks
// another of its species when porcini has no curve there).
const OPENS = {
  NE: { place: 'europe', species: 'porcini' },
  SE: { place: 'europe', species: 'porcini' },
  USE: { place: 'united-states', species: 'morel' },
  USW: { place: 'united-states', species: 'morel' },
  ANZ: { place: 'australia-and-new-zealand', species: 'porcini' },
} as const;

export const Route = createFileRoute('/data_/seasons/')({
  beforeLoad: () => {
    throw redirect({
      to: '/data/seasons/$place/$species',
      params: OPENS[useMapStore.getState().forecastRegion],
      replace: true,
    });
  },
});

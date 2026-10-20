/**
 * Huerta, the garden space: what to sow or plant this week at a place, from
 * the nightly forecast, the place's frost history and the crop table. The
 * advice is computed offline; the app only shows it.
 */

/** Why a crop is or is not for this week. */
export type CropStatus =
  | 'now'
  | 'wait_frost'
  | 'wait_soil'
  | 'wait_warm'
  | 'too_warm'
  | 'too_late'
  | 'not_here';

export type CropKind = 'vegetable' | 'herb' | 'flower';

export interface Crop {
  id: string;
  /** Sown as seed in the bed, or planted out as a plant, set or clove. */
  how: 'sow' | 'plant';
  kind: CropKind;
}

/** The crops the advice covers, in the order the page lists them. */
export const CROPS: Crop[] = [
  { id: 'garlic', how: 'plant', kind: 'vegetable' },
  { id: 'broad_beans', how: 'sow', kind: 'vegetable' },
  { id: 'lettuce', how: 'sow', kind: 'vegetable' },
  { id: 'spinach', how: 'sow', kind: 'vegetable' },
  { id: 'peas', how: 'sow', kind: 'vegetable' },
  { id: 'radish', how: 'sow', kind: 'vegetable' },
  { id: 'carrot', how: 'sow', kind: 'vegetable' },
  { id: 'beetroot', how: 'sow', kind: 'vegetable' },
  { id: 'chard', how: 'sow', kind: 'vegetable' },
  { id: 'kale', how: 'plant', kind: 'vegetable' },
  { id: 'cabbage', how: 'plant', kind: 'vegetable' },
  { id: 'broccoli', how: 'plant', kind: 'vegetable' },
  { id: 'onion_sets', how: 'plant', kind: 'vegetable' },
  { id: 'potato', how: 'plant', kind: 'vegetable' },
  { id: 'tomato', how: 'plant', kind: 'vegetable' },
  { id: 'pepper', how: 'plant', kind: 'vegetable' },
  { id: 'aubergine', how: 'plant', kind: 'vegetable' },
  { id: 'cucumber', how: 'sow', kind: 'vegetable' },
  { id: 'courgette', how: 'sow', kind: 'vegetable' },
  { id: 'pumpkin', how: 'sow', kind: 'vegetable' },
  { id: 'melon', how: 'plant', kind: 'vegetable' },
  { id: 'green_beans', how: 'sow', kind: 'vegetable' },
  { id: 'sweetcorn', how: 'sow', kind: 'vegetable' },
  { id: 'basil', how: 'plant', kind: 'herb' },
  { id: 'parsley', how: 'sow', kind: 'herb' },
  { id: 'coriander', how: 'sow', kind: 'herb' },
  { id: 'sunflower', how: 'sow', kind: 'flower' },
  { id: 'marigold', how: 'sow', kind: 'flower' },
  { id: 'sweet_pea', how: 'sow', kind: 'flower' },
];

/** This week at one place. */
export interface PlaceAdvice {
  place: string;
  /** The day the advice is for, YYYY-MM-DD. */
  day: string;
  /** The coldest hour of the next three days: ≤ 0 °C frost, ≤ 2 °C ground frost. */
  frost: 'none' | 'ground_frost' | 'frost';
  /** Mean soil temperature at 6 cm over the next three days, °C (null: no reading). */
  soil: number | null;
  /** The week's mean night (daily minimum), °C. */
  nights: number | null;
  /** The week's rain, mm. */
  rain: number | null;
  /** What the week's evaporation takes that its rain does not give back, mm. */
  water: number | null;
  crops: Record<string, CropStatus>;
}

const NOW = [
  'garlic',
  'broad_beans',
  'lettuce',
  'spinach',
  'peas',
  'radish',
  'carrot',
  'beetroot',
  'chard',
  'kale',
  'cabbage',
  'broccoli',
  'onion_sets',
  'parsley',
  'coriander',
  'sweet_pea',
];

/** Madrid on 19 October 2026, from the first run of the advice: a sample to
 *  show the page until each place's own advice is served. */
export const SAMPLE_ADVICE: PlaceAdvice = {
  place: 'Madrid',
  day: '2026-10-19',
  frost: 'none',
  soil: 13.4,
  nights: 8.5,
  rain: 4,
  water: 10,
  crops: Object.fromEntries(
    CROPS.map(({ id }) => [id, NOW.includes(id) ? 'now' : 'too_late'])
  ),
};

export const cropsWith = (advice: PlaceAdvice, statuses: CropStatus[]) =>
  CROPS.filter(crop => statuses.includes(advice.crops[crop.id]));

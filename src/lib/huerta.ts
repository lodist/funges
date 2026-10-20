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
  | 'not_here'
  /** Goes in only in autumn (bulbs, winter rye), or only in spring (asparagus). */
  | 'wait_autumn'
  | 'wait_spring';

export type CropKind = 'vegetable' | 'fruit' | 'herb' | 'flower' | 'cover';

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
  { id: 'lambs_lettuce', how: 'sow', kind: 'vegetable' },
  { id: 'rocket', how: 'sow', kind: 'vegetable' },
  { id: 'spinach', how: 'sow', kind: 'vegetable' },
  { id: 'peas', how: 'sow', kind: 'vegetable' },
  { id: 'radish', how: 'sow', kind: 'vegetable' },
  { id: 'carrot', how: 'sow', kind: 'vegetable' },
  { id: 'parsnip', how: 'sow', kind: 'vegetable' },
  { id: 'beetroot', how: 'sow', kind: 'vegetable' },
  { id: 'turnip', how: 'sow', kind: 'vegetable' },
  { id: 'chard', how: 'sow', kind: 'vegetable' },
  { id: 'chicory', how: 'sow', kind: 'vegetable' },
  { id: 'kale', how: 'plant', kind: 'vegetable' },
  { id: 'cabbage', how: 'plant', kind: 'vegetable' },
  { id: 'cauliflower', how: 'plant', kind: 'vegetable' },
  { id: 'broccoli', how: 'plant', kind: 'vegetable' },
  { id: 'brussels_sprouts', how: 'plant', kind: 'vegetable' },
  { id: 'kohlrabi', how: 'sow', kind: 'vegetable' },
  { id: 'onion_sets', how: 'plant', kind: 'vegetable' },
  { id: 'onion', how: 'sow', kind: 'vegetable' },
  { id: 'leek', how: 'sow', kind: 'vegetable' },
  { id: 'celery', how: 'plant', kind: 'vegetable' },
  { id: 'fennel', how: 'sow', kind: 'vegetable' },
  { id: 'potato', how: 'plant', kind: 'vegetable' },
  { id: 'asparagus', how: 'plant', kind: 'vegetable' },
  { id: 'rhubarb', how: 'plant', kind: 'vegetable' },
  { id: 'artichoke', how: 'plant', kind: 'vegetable' },
  { id: 'tomato', how: 'plant', kind: 'vegetable' },
  { id: 'pepper', how: 'plant', kind: 'vegetable' },
  { id: 'chilli', how: 'plant', kind: 'vegetable' },
  { id: 'aubergine', how: 'plant', kind: 'vegetable' },
  { id: 'cucumber', how: 'sow', kind: 'vegetable' },
  { id: 'courgette', how: 'sow', kind: 'vegetable' },
  { id: 'pumpkin', how: 'sow', kind: 'vegetable' },
  { id: 'winter_squash', how: 'sow', kind: 'vegetable' },
  { id: 'green_beans', how: 'sow', kind: 'vegetable' },
  { id: 'sweetcorn', how: 'sow', kind: 'vegetable' },
  { id: 'strawberry', how: 'plant', kind: 'fruit' },
  { id: 'melon', how: 'plant', kind: 'fruit' },
  { id: 'watermelon', how: 'plant', kind: 'fruit' },
  { id: 'basil', how: 'plant', kind: 'herb' },
  { id: 'parsley', how: 'sow', kind: 'herb' },
  { id: 'coriander', how: 'sow', kind: 'herb' },
  { id: 'dill', how: 'sow', kind: 'herb' },
  { id: 'chervil', how: 'sow', kind: 'herb' },
  { id: 'chives', how: 'plant', kind: 'herb' },
  { id: 'thyme', how: 'plant', kind: 'herb' },
  { id: 'rosemary', how: 'plant', kind: 'herb' },
  { id: 'oregano', how: 'plant', kind: 'herb' },
  { id: 'sage', how: 'plant', kind: 'herb' },
  { id: 'mint', how: 'plant', kind: 'herb' },
  { id: 'tulip', how: 'plant', kind: 'flower' },
  { id: 'daffodil', how: 'plant', kind: 'flower' },
  { id: 'crocus', how: 'plant', kind: 'flower' },
  { id: 'sunflower', how: 'sow', kind: 'flower' },
  { id: 'marigold', how: 'sow', kind: 'flower' },
  { id: 'calendula', how: 'sow', kind: 'flower' },
  { id: 'nasturtium', how: 'sow', kind: 'flower' },
  { id: 'zinnia', how: 'sow', kind: 'flower' },
  { id: 'cosmos', how: 'sow', kind: 'flower' },
  { id: 'sweet_pea', how: 'sow', kind: 'flower' },
  { id: 'lavender', how: 'plant', kind: 'flower' },
  { id: 'field_beans', how: 'sow', kind: 'cover' },
  { id: 'winter_rye', how: 'sow', kind: 'cover' },
  { id: 'crimson_clover', how: 'sow', kind: 'cover' },
  { id: 'phacelia', how: 'sow', kind: 'cover' },
  { id: 'white_mustard', how: 'sow', kind: 'cover' },
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

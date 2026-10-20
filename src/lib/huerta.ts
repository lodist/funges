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
  /** The species; its variety where cards share one (the cabbage family, chard);
   *  the genus for a group (tulips, mint, chillies). */
  scientific: string;
}

/** The crops the advice covers, in the order the page lists them. */
export const CROPS: Crop[] = [
  {
    id: 'garlic',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Allium sativum',
  },
  {
    id: 'broad_beans',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Vicia faba',
  },
  {
    id: 'lettuce',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Lactuca sativa',
  },
  {
    id: 'lambs_lettuce',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Valerianella locusta',
  },
  {
    id: 'rocket',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Eruca vesicaria',
  },
  {
    id: 'spinach',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Spinacia oleracea',
  },
  { id: 'peas', how: 'sow', kind: 'vegetable', scientific: 'Pisum sativum' },
  {
    id: 'radish',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Raphanus sativus',
  },
  { id: 'carrot', how: 'sow', kind: 'vegetable', scientific: 'Daucus carota' },
  {
    id: 'parsnip',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Pastinaca sativa',
  },
  {
    id: 'beetroot',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Beta vulgaris',
  },
  { id: 'turnip', how: 'sow', kind: 'vegetable', scientific: 'Brassica rapa' },
  {
    id: 'chard',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Beta vulgaris var. cicla',
  },
  { id: 'chicory', how: 'sow', kind: 'vegetable', scientific: 'Cichorium' },
  {
    id: 'kale',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. sabellica',
  },
  {
    id: 'cabbage',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. capitata',
  },
  {
    id: 'cauliflower',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. botrytis',
  },
  {
    id: 'broccoli',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. italica',
  },
  {
    id: 'brussels_sprouts',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. gemmifera',
  },
  {
    id: 'kohlrabi',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. gongylodes',
  },
  {
    id: 'onion_sets',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Allium cepa',
  },
  { id: 'onion', how: 'sow', kind: 'vegetable', scientific: 'Allium cepa' },
  { id: 'leek', how: 'sow', kind: 'vegetable', scientific: 'Allium porrum' },
  {
    id: 'celery',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Apium graveolens',
  },
  {
    id: 'fennel',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Foeniculum vulgare',
  },
  {
    id: 'potato',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Solanum tuberosum',
  },
  {
    id: 'asparagus',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Asparagus officinalis',
  },
  {
    id: 'rhubarb',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Rheum × hybridum',
  },
  {
    id: 'artichoke',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Cynara cardunculus var. scolymus',
  },
  {
    id: 'tomato',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Solanum lycopersicum',
  },
  {
    id: 'pepper',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Capsicum annuum',
  },
  { id: 'chilli', how: 'plant', kind: 'vegetable', scientific: 'Capsicum' },
  {
    id: 'aubergine',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Solanum melongena',
  },
  {
    id: 'cucumber',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Cucumis sativus',
  },
  {
    id: 'courgette',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Cucurbita pepo',
  },
  { id: 'pumpkin', how: 'sow', kind: 'vegetable', scientific: 'Cucurbita' },
  {
    id: 'winter_squash',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Cucurbita',
  },
  {
    id: 'green_beans',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Phaseolus vulgaris',
  },
  { id: 'sweetcorn', how: 'sow', kind: 'vegetable', scientific: 'Zea mays' },
  {
    id: 'strawberry',
    how: 'plant',
    kind: 'fruit',
    scientific: 'Fragaria × ananassa',
  },
  { id: 'melon', how: 'plant', kind: 'fruit', scientific: 'Cucumis melo' },
  {
    id: 'watermelon',
    how: 'plant',
    kind: 'fruit',
    scientific: 'Citrullus lanatus',
  },
  { id: 'basil', how: 'plant', kind: 'herb', scientific: 'Ocimum basilicum' },
  {
    id: 'parsley',
    how: 'sow',
    kind: 'herb',
    scientific: 'Petroselinum crispum',
  },
  {
    id: 'coriander',
    how: 'sow',
    kind: 'herb',
    scientific: 'Coriandrum sativum',
  },
  { id: 'dill', how: 'sow', kind: 'herb', scientific: 'Anethum graveolens' },
  {
    id: 'chervil',
    how: 'sow',
    kind: 'herb',
    scientific: 'Anthriscus cerefolium',
  },
  {
    id: 'chives',
    how: 'plant',
    kind: 'herb',
    scientific: 'Allium schoenoprasum',
  },
  { id: 'thyme', how: 'plant', kind: 'herb', scientific: 'Thymus vulgaris' },
  {
    id: 'rosemary',
    how: 'plant',
    kind: 'herb',
    scientific: 'Salvia rosmarinus',
  },
  { id: 'oregano', how: 'plant', kind: 'herb', scientific: 'Origanum vulgare' },
  { id: 'sage', how: 'plant', kind: 'herb', scientific: 'Salvia officinalis' },
  { id: 'mint', how: 'plant', kind: 'herb', scientific: 'Mentha' },
  { id: 'tulip', how: 'plant', kind: 'flower', scientific: 'Tulipa' },
  { id: 'daffodil', how: 'plant', kind: 'flower', scientific: 'Narcissus' },
  { id: 'crocus', how: 'plant', kind: 'flower', scientific: 'Crocus' },
  {
    id: 'sunflower',
    how: 'sow',
    kind: 'flower',
    scientific: 'Helianthus annuus',
  },
  { id: 'marigold', how: 'sow', kind: 'flower', scientific: 'Tagetes' },
  {
    id: 'calendula',
    how: 'sow',
    kind: 'flower',
    scientific: 'Calendula officinalis',
  },
  {
    id: 'nasturtium',
    how: 'sow',
    kind: 'flower',
    scientific: 'Tropaeolum majus',
  },
  { id: 'zinnia', how: 'sow', kind: 'flower', scientific: 'Zinnia elegans' },
  { id: 'cosmos', how: 'sow', kind: 'flower', scientific: 'Cosmos bipinnatus' },
  {
    id: 'sweet_pea',
    how: 'sow',
    kind: 'flower',
    scientific: 'Lathyrus odoratus',
  },
  {
    id: 'lavender',
    how: 'plant',
    kind: 'flower',
    scientific: 'Lavandula angustifolia',
  },
  { id: 'field_beans', how: 'sow', kind: 'cover', scientific: 'Vicia faba' },
  { id: 'winter_rye', how: 'sow', kind: 'cover', scientific: 'Secale cereale' },
  {
    id: 'crimson_clover',
    how: 'sow',
    kind: 'cover',
    scientific: 'Trifolium incarnatum',
  },
  {
    id: 'phacelia',
    how: 'sow',
    kind: 'cover',
    scientific: 'Phacelia tanacetifolia',
  },
  {
    id: 'white_mustard',
    how: 'sow',
    kind: 'cover',
    scientific: 'Sinapis alba',
  },
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

/** Too late for these in Madrid on 20 October 2026; asparagus waits for
 *  spring; everything else goes in now. */
const SAMPLE_TOO_LATE = [
  'potato',
  'tomato',
  'pepper',
  'chilli',
  'aubergine',
  'cucumber',
  'courgette',
  'pumpkin',
  'winter_squash',
  'green_beans',
  'sweetcorn',
  'melon',
  'watermelon',
  'basil',
  'sunflower',
  'marigold',
  'nasturtium',
  'zinnia',
  'cosmos',
];

/** Madrid on 20 October 2026, from that night's advice: a sample to show the
 *  page until each place's own advice is served. */
export const SAMPLE_ADVICE: PlaceAdvice = {
  place: 'Madrid',
  day: '2026-10-20',
  frost: 'none',
  soil: 13.2,
  nights: 8.4,
  rain: 0.1,
  water: 16,
  crops: Object.fromEntries(
    CROPS.map(({ id }) => [
      id,
      SAMPLE_TOO_LATE.includes(id)
        ? 'too_late'
        : id === 'asparagus'
          ? 'wait_spring'
          : 'now',
    ])
  ),
};

export const cropsWith = (advice: PlaceAdvice, statuses: CropStatus[]) =>
  CROPS.filter(crop => statuses.includes(advice.crops[crop.id]));

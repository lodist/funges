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
  /** Sowing or planting depth, cm; null: as deep as it sat in its pot. */
  depth: number | null;
  /** Between plants, cm; null: scattered thinly (green manures). */
  spacing: number | null;
  /** Between rows, cm; null: no rows (bulbs in groups, scattered seed). */
  rows: number | null;
  sun: 'full' | 'part';
  /** When it gives its first harvest, where that is not a matter of weeks. */
  note?:
    | 'spring_flowers'
    | 'next_year'
    | 'second_year'
    | 'third_year'
    | 'perennial';
}

/** The crops the advice covers, in the order the page lists them. */
export const CROPS: Crop[] = [
  {
    id: 'garlic',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Allium sativum',
    depth: 3,
    spacing: 15,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'broad_beans',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Vicia faba',
    depth: 5,
    spacing: 20,
    rows: 45,
    sun: 'full',
  },
  {
    id: 'lettuce',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Lactuca sativa',
    depth: 1,
    spacing: 25,
    rows: 30,
    sun: 'part',
  },
  {
    id: 'lambs_lettuce',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Valerianella locusta',
    depth: 1,
    spacing: 10,
    rows: 15,
    sun: 'part',
  },
  {
    id: 'rocket',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Eruca vesicaria',
    depth: 1,
    spacing: 15,
    rows: 30,
    sun: 'part',
  },
  {
    id: 'spinach',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Spinacia oleracea',
    depth: 2,
    spacing: 15,
    rows: 30,
    sun: 'part',
  },
  {
    id: 'peas',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Pisum sativum',
    depth: 4,
    spacing: 8,
    rows: 60,
    sun: 'full',
  },
  {
    id: 'radish',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Raphanus sativus',
    depth: 1,
    spacing: 3,
    rows: 15,
    sun: 'full',
  },
  {
    id: 'carrot',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Daucus carota',
    depth: 1,
    spacing: 5,
    rows: 20,
    sun: 'full',
  },
  {
    id: 'parsnip',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Pastinaca sativa',
    depth: 2,
    spacing: 15,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'beetroot',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Beta vulgaris',
    depth: 2,
    spacing: 10,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'turnip',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Brassica rapa',
    depth: 1,
    spacing: 15,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'chard',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Beta vulgaris var. cicla',
    depth: 2,
    spacing: 30,
    rows: 40,
    sun: 'part',
  },
  {
    id: 'chicory',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Cichorium',
    depth: 1,
    spacing: 30,
    rows: 40,
    sun: 'full',
  },
  {
    id: 'kale',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. sabellica',
    depth: null,
    spacing: 45,
    rows: 60,
    sun: 'full',
  },
  {
    id: 'cabbage',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. capitata',
    depth: null,
    spacing: 45,
    rows: 60,
    sun: 'full',
  },
  {
    id: 'cauliflower',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. botrytis',
    depth: null,
    spacing: 60,
    rows: 60,
    sun: 'full',
  },
  {
    id: 'broccoli',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. italica',
    depth: null,
    spacing: 45,
    rows: 60,
    sun: 'full',
  },
  {
    id: 'brussels_sprouts',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. gemmifera',
    depth: null,
    spacing: 60,
    rows: 75,
    sun: 'full',
  },
  {
    id: 'kohlrabi',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Brassica oleracea var. gongylodes',
    depth: 1,
    spacing: 25,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'onion_sets',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Allium cepa',
    depth: 2,
    spacing: 10,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'onion',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Allium cepa',
    depth: 1,
    spacing: 10,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'leek',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Allium porrum',
    depth: 1,
    spacing: 15,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'celery',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Apium graveolens',
    depth: null,
    spacing: 30,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'fennel',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Foeniculum vulgare',
    depth: 1,
    spacing: 30,
    rows: 45,
    sun: 'full',
  },
  {
    id: 'potato',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Solanum tuberosum',
    depth: 12,
    spacing: 30,
    rows: 75,
    sun: 'full',
  },
  {
    id: 'asparagus',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Asparagus officinalis',
    depth: 20,
    spacing: 40,
    rows: 90,
    sun: 'full',
    note: 'third_year',
  },
  {
    id: 'rhubarb',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Rheum × hybridum',
    depth: null,
    spacing: 90,
    rows: 90,
    sun: 'full',
    note: 'second_year',
  },
  {
    id: 'artichoke',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Cynara cardunculus var. scolymus',
    depth: null,
    spacing: 90,
    rows: 90,
    sun: 'full',
    note: 'next_year',
  },
  {
    id: 'tomato',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Solanum lycopersicum',
    depth: null,
    spacing: 50,
    rows: 75,
    sun: 'full',
  },
  {
    id: 'pepper',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Capsicum annuum',
    depth: null,
    spacing: 45,
    rows: 60,
    sun: 'full',
  },
  {
    id: 'chilli',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Capsicum',
    depth: null,
    spacing: 45,
    rows: 60,
    sun: 'full',
  },
  {
    id: 'aubergine',
    how: 'plant',
    kind: 'vegetable',
    scientific: 'Solanum melongena',
    depth: null,
    spacing: 60,
    rows: 75,
    sun: 'full',
  },
  {
    id: 'cucumber',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Cucumis sativus',
    depth: 2,
    spacing: 45,
    rows: 90,
    sun: 'full',
  },
  {
    id: 'courgette',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Cucurbita pepo',
    depth: 2,
    spacing: 90,
    rows: 90,
    sun: 'full',
  },
  {
    id: 'pumpkin',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Cucurbita',
    depth: 3,
    spacing: 150,
    rows: 180,
    sun: 'full',
  },
  {
    id: 'winter_squash',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Cucurbita',
    depth: 3,
    spacing: 100,
    rows: 150,
    sun: 'full',
  },
  {
    id: 'green_beans',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Phaseolus vulgaris',
    depth: 4,
    spacing: 15,
    rows: 45,
    sun: 'full',
  },
  {
    id: 'sweetcorn',
    how: 'sow',
    kind: 'vegetable',
    scientific: 'Zea mays',
    depth: 4,
    spacing: 35,
    rows: 60,
    sun: 'full',
  },
  {
    id: 'strawberry',
    how: 'plant',
    kind: 'fruit',
    scientific: 'Fragaria × ananassa',
    depth: null,
    spacing: 35,
    rows: 75,
    sun: 'full',
    note: 'next_year',
  },
  {
    id: 'melon',
    how: 'plant',
    kind: 'fruit',
    scientific: 'Cucumis melo',
    depth: null,
    spacing: 90,
    rows: 150,
    sun: 'full',
  },
  {
    id: 'watermelon',
    how: 'plant',
    kind: 'fruit',
    scientific: 'Citrullus lanatus',
    depth: null,
    spacing: 100,
    rows: 180,
    sun: 'full',
  },
  {
    id: 'basil',
    how: 'plant',
    kind: 'herb',
    scientific: 'Ocimum basilicum',
    depth: null,
    spacing: 25,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'parsley',
    how: 'sow',
    kind: 'herb',
    scientific: 'Petroselinum crispum',
    depth: 1,
    spacing: 20,
    rows: 30,
    sun: 'part',
  },
  {
    id: 'coriander',
    how: 'sow',
    kind: 'herb',
    scientific: 'Coriandrum sativum',
    depth: 1,
    spacing: 15,
    rows: 30,
    sun: 'part',
  },
  {
    id: 'dill',
    how: 'sow',
    kind: 'herb',
    scientific: 'Anethum graveolens',
    depth: 1,
    spacing: 25,
    rows: 40,
    sun: 'full',
  },
  {
    id: 'chervil',
    how: 'sow',
    kind: 'herb',
    scientific: 'Anthriscus cerefolium',
    depth: 1,
    spacing: 20,
    rows: 30,
    sun: 'part',
  },
  {
    id: 'chives',
    how: 'plant',
    kind: 'herb',
    scientific: 'Allium schoenoprasum',
    depth: null,
    spacing: 25,
    rows: 30,
    sun: 'full',
    note: 'perennial',
  },
  {
    id: 'thyme',
    how: 'plant',
    kind: 'herb',
    scientific: 'Thymus vulgaris',
    depth: null,
    spacing: 30,
    rows: 40,
    sun: 'full',
    note: 'perennial',
  },
  {
    id: 'rosemary',
    how: 'plant',
    kind: 'herb',
    scientific: 'Salvia rosmarinus',
    depth: null,
    spacing: 60,
    rows: 90,
    sun: 'full',
    note: 'perennial',
  },
  {
    id: 'oregano',
    how: 'plant',
    kind: 'herb',
    scientific: 'Origanum vulgare',
    depth: null,
    spacing: 30,
    rows: 40,
    sun: 'full',
    note: 'perennial',
  },
  {
    id: 'sage',
    how: 'plant',
    kind: 'herb',
    scientific: 'Salvia officinalis',
    depth: null,
    spacing: 45,
    rows: 60,
    sun: 'full',
    note: 'perennial',
  },
  {
    id: 'mint',
    how: 'plant',
    kind: 'herb',
    scientific: 'Mentha',
    depth: null,
    spacing: 45,
    rows: 60,
    sun: 'part',
    note: 'perennial',
  },
  {
    id: 'tulip',
    how: 'plant',
    kind: 'flower',
    scientific: 'Tulipa',
    depth: 15,
    spacing: 10,
    rows: null,
    sun: 'full',
    note: 'spring_flowers',
  },
  {
    id: 'daffodil',
    how: 'plant',
    kind: 'flower',
    scientific: 'Narcissus',
    depth: 15,
    spacing: 10,
    rows: null,
    sun: 'full',
    note: 'spring_flowers',
  },
  {
    id: 'crocus',
    how: 'plant',
    kind: 'flower',
    scientific: 'Crocus',
    depth: 8,
    spacing: 8,
    rows: null,
    sun: 'full',
    note: 'spring_flowers',
  },
  {
    id: 'sunflower',
    how: 'sow',
    kind: 'flower',
    scientific: 'Helianthus annuus',
    depth: 3,
    spacing: 45,
    rows: 60,
    sun: 'full',
  },
  {
    id: 'marigold',
    how: 'sow',
    kind: 'flower',
    scientific: 'Tagetes',
    depth: 1,
    spacing: 25,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'calendula',
    how: 'sow',
    kind: 'flower',
    scientific: 'Calendula officinalis',
    depth: 1,
    spacing: 30,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'nasturtium',
    how: 'sow',
    kind: 'flower',
    scientific: 'Tropaeolum majus',
    depth: 2,
    spacing: 30,
    rows: 45,
    sun: 'full',
  },
  {
    id: 'zinnia',
    how: 'sow',
    kind: 'flower',
    scientific: 'Zinnia elegans',
    depth: 1,
    spacing: 30,
    rows: 30,
    sun: 'full',
  },
  {
    id: 'cosmos',
    how: 'sow',
    kind: 'flower',
    scientific: 'Cosmos bipinnatus',
    depth: 1,
    spacing: 40,
    rows: 45,
    sun: 'full',
  },
  {
    id: 'sweet_pea',
    how: 'sow',
    kind: 'flower',
    scientific: 'Lathyrus odoratus',
    depth: 3,
    spacing: 15,
    rows: null,
    sun: 'full',
  },
  {
    id: 'lavender',
    how: 'plant',
    kind: 'flower',
    scientific: 'Lavandula angustifolia',
    depth: null,
    spacing: 60,
    rows: 90,
    sun: 'full',
    note: 'perennial',
  },
  {
    id: 'field_beans',
    how: 'sow',
    kind: 'cover',
    scientific: 'Vicia faba',
    depth: 5,
    spacing: 15,
    rows: 20,
    sun: 'full',
  },
  {
    id: 'winter_rye',
    how: 'sow',
    kind: 'cover',
    scientific: 'Secale cereale',
    depth: 3,
    spacing: null,
    rows: null,
    sun: 'full',
  },
  {
    id: 'crimson_clover',
    how: 'sow',
    kind: 'cover',
    scientific: 'Trifolium incarnatum',
    depth: 1,
    spacing: null,
    rows: null,
    sun: 'full',
  },
  {
    id: 'phacelia',
    how: 'sow',
    kind: 'cover',
    scientific: 'Phacelia tanacetifolia',
    depth: 1,
    spacing: null,
    rows: null,
    sun: 'full',
  },
  {
    id: 'white_mustard',
    how: 'sow',
    kind: 'cover',
    scientific: 'Sinapis alba',
    depth: 1,
    spacing: null,
    rows: null,
    sun: 'full',
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
  /** This place's typical last spring and first autumn frost, day of the
   *  year; null where a typical year has none, absent when not known. */
  lastFrost?: number | null;
  firstFrost?: number | null;
  /** Frost on days 4-7 of the forecast, less certain than the next 3 days;
   *  absent when not known. */
  laterFrost?: 'none' | 'ground_frost' | 'frost';
  /** The first night of it, YYYY-MM-DD (the evening it begins). */
  laterNight?: string | null;
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
  lastFrost: 81,
  firstFrost: 361,
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

/** A night's date (YYYY-MM-DD, the evening it begins) as its weekday. */
export const weekday = (date: string, language: string) =>
  new Intl.DateTimeFormat(language, { weekday: 'long' }).format(
    new Date(`${date}T12:00:00`)
  );

export const cropsWith = (advice: PlaceAdvice, statuses: CropStatus[]) =>
  CROPS.filter(crop => statuses.includes(advice.crops[crop.id]));

/** What a crop needs, to say why it is or isn't for this week. */
export interface CropNeeds {
  frost: 'tender' | 'half_hardy' | 'hardy';
  /** Soil at 6 cm, °C: the lowest and highest it goes in at (null: no limit). */
  soil: [number | null, number | null];
  /** The warm nights it needs, °C (null: none). */
  night: number | null;
  /** Days from sowing or planting to the first harvest. */
  days: number | null;
}

/** One line of a crop's "this week": a translation key under `sheet.why`,
 *  its numbers, and whether it speaks for or against. */
export interface Reason {
  ok: boolean;
  key: string;
  values?: Record<string, number | string>;
}

const STATUS_REASON: Partial<Record<CropStatus, string>> = {
  wait_frost: 'frost',
  too_late: 'late',
  not_here: 'notHere',
  wait_autumn: 'autumn',
  wait_spring: 'spring',
};

/** Why a crop is or isn't for this week, in the place's own conditions:
 *  the soil and the nights against its needs, then what its status adds. */
export function cropReasons(
  status: CropStatus,
  advice: PlaceAdvice,
  need?: CropNeeds
): Reason[] {
  const out: Reason[] = [];
  const soil = advice.soil === null ? null : Math.round(advice.soil);
  const nights = advice.nights === null ? null : Math.round(advice.nights);
  if (need && soil !== null) {
    const [min, max] = need.soil;
    if (min !== null && soil < min)
      out.push({ ok: false, key: 'soilLow', values: { soil, min } });
    else if (max !== null && soil > max)
      out.push({ ok: false, key: 'soilHigh', values: { soil, max } });
    else if (min !== null && max !== null)
      out.push({ ok: true, key: 'soilRange', values: { soil, min, max } });
    else if (min !== null)
      out.push({ ok: true, key: 'soilFrom', values: { soil, min } });
  }
  if (need?.night != null && nights !== null)
    out.push({
      ok: nights >= need.night,
      key: 'nights',
      values: { nights, night: need.night },
    });
  const said = STATUS_REASON[status];
  // Waiting for frost: the forecast's own frost first, then the place's frost climate.
  if (status === 'wait_frost' && advice.frost !== 'none')
    out.push({ ok: false, key: 'frostSoon' });
  else if (
    status === 'wait_frost' &&
    advice.laterFrost === 'frost' &&
    advice.laterNight
  )
    out.push({
      ok: false,
      key: 'frostLater',
      values: { night: advice.laterNight },
    });
  else if (said) out.push({ ok: false, key: said });
  else if (status === 'wait_warm' && out.every(reason => reason.ok))
    out.push({ ok: false, key: 'warmSeason' });
  else if (status === 'now' && need)
    out.push({
      ok: true,
      key: need.frost === 'tender' ? 'noFrost' : 'hardy',
    });
  return out;
}

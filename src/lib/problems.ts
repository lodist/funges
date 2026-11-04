/** Each crop's problems (grow.<crop>.problems, in that order) as one id each,
 *  the same in every language, so a warning, a loss and a photo can name the
 *  same problem. A pest the weather times keeps its PestId (src/lib/pests.ts). */
export const PROBLEMS: Record<string, readonly string[]> = {
  garlic: ['rust', 'white_rot', 'bulbs_without_cloves'],
  broad_beans: ['blackfly', 'chocolate_spot', 'mice'],
  lettuce: ['slugs', 'bolting', 'downy_mildew'],
  lambs_lettuce: ['slugs', 'aphids', 'seeds_not_coming_up'],
  rocket: ['flea_beetle', 'bolting', 'slugs'],
  spinach: ['bolting', 'downy_mildew', 'slugs'],
  peas: ['pea_moth', 'powdery_mildew', 'birds_mice'],
  radish: ['flea_beetle', 'bolting', 'split_or_woody_roots'],
  carrot: ['carrot_fly', 'forked_roots', 'split_roots'],
  parsnip: ['canker', 'carrot_fly', 'gaps_in_the_row'],
  beetroot: ['bolting', 'leaf_miner', 'downy_mildew'],
  turnip: ['cabbage_root_fly', 'clubroot', 'slugs'],
  chard: ['leaf_miner', 'slugs', 'downy_mildew'],
  chicory: ['bolting', 'slugs', 'rot_under_the_cover'],
  kale: ['caterpillars', 'cabbage_aphids', 'pigeons'],
  cabbage: ['caterpillars', 'cabbage_root_fly', 'clubroot'],
  cauliflower: ['tiny_heads', 'clubroot', 'caterpillars'],
  broccoli: ['early_flowering', 'caterpillars', 'pigeons'],
  brussels_sprouts: ['loose_sprouts', 'cabbage_aphids', 'clubroot'],
  kohlrabi: ['caterpillars', 'flea_beetle', 'woody_bulbs'],
  onion_sets: ['bolting', 'white_rot', 'onion_fly'],
  onion: ['downy_mildew', 'onion_fly', 'weeds'],
  leek: ['rust', 'allium_leaf_miner', 'leek_moth'],
  celery: ['celery_leaf_miner', 'leaf_spot', 'slugs'],
  fennel: ['bolting', 'slugs'],
  potato: ['blight', 'scab', 'green_potatoes'],
  asparagus: ['asparagus_beetle', 'slugs', 'root_rot'],
  rhubarb: ['crown_rot', 'flower_stalks', 'slugs'],
  artichoke: ['aphids', 'slugs', 'dying_in_winter'],
  tomato: ['blight', 'blossom_end_rot', 'split_fruit'],
  pepper: ['aphids', 'blossom_end_rot', 'flowers_dropping'],
  chilli: ['aphids', 'red_spider_mite', 'too_much_heat'],
  aubergine: ['few_or_no_fruits', 'red_spider_mite', 'aphids'],
  cucumber: ['powdery_mildew', 'mosaic_virus', 'slugs'],
  courgette: ['powdery_mildew', 'slugs', 'fruit_rotting_or_not_forming'],
  pumpkin: ['fruit_rot', 'powdery_mildew', 'slugs'],
  winter_squash: ['powdery_mildew', 'slugs', 'small_fruits_shrivel'],
  green_beans: ['slugs', 'blackfly', 'flowers_dropping'],
  sweetcorn: ['gappy_cobs', 'birds_mice', 'smut'],
  strawberry: ['grey_mould', 'birds', 'vine_weevil'],
  melon: ['no_fruit_forming', 'powdery_mildew', 'red_spider_mite'],
  watermelon: ['picked_too_early', 'powdery_mildew', 'slugs'],
  basil: ['downy_mildew', 'cold_damage', 'slugs'],
  parsley: ['carrot_fly', 'celery_leaf_miner', 'slow_to_come_up'],
  coriander: ['bolting', 'slugs', 'aphids'],
  dill: ['bolting', 'aphids', 'slugs'],
  chervil: ['bolting', 'aphids'],
  chives: ['rust', 'aphids'],
  thyme: ['root_rot', 'bare_woody_plant', 'rosemary_beetle'],
  rosemary: ['rosemary_beetle', 'frost_and_wet_damage', 'cuckoo_spit'],
  oregano: ['mint_rust', 'leafhoppers', 'mint_moth'],
  sage: ['rosemary_beetle', 'leafhoppers', 'woody_straggly_plant'],
  mint: ['mint_rust', 'spreading_everywhere', 'mint_beetle'],
  tulip: ['tulip_fire', 'squirrels_and_mice', 'few_flowers'],
  daffodil: ['blind', 'bulb_fly', 'rotting_bulbs'],
  crocus: ['squirrels_and_mice', 'birds_pecking_flowers', 'few_flowers'],
  sunflower: ['slugs', 'birds', 'falling_over'],
  marigold: ['slugs', 'grey_mould', 'red_spider_mite'],
  calendula: ['powdery_mildew', 'blackfly', 'slugs'],
  nasturtium: ['blackfly', 'caterpillars', 'all_leaves_few_flowers'],
  zinnia: ['powdery_mildew', 'leaf_spots', 'slugs'],
  cosmos: ['slugs', 'all_leaves_few_flowers', 'falling_over'],
  sweet_pea: ['aphids', 'powdery_mildew', 'buds_falling_off'],
  lavender: ['root_rot', 'straggly_woody_plant', 'rosemary_beetle'],
  field_beans: ['blackfly', 'slugs'],
  winter_rye: ['small_seeds_won_t_come_up', 'cut_too_late'],
  crimson_clover: ['clover_seeding_itself', 'slugs'],
  phacelia: ['seedlings_everywhere', 'itchy_skin'],
  white_mustard: ['clubroot', 'going_to_seed'],
};

/** What a problem looks like: public/huerta/problems/<file>.webp (768 px at
 *  most), credited as its licence asks. Real photos of the damage on the crop
 *  under a free licence (CC0, CC BY, public domain), whole: a CC BY one is not
 *  cropped, the page shows its centre. Where no such photo exists, a generated
 *  picture, shown without a credit (no `by`). A crop's own photo is keyed
 *  `<crop>.<problem>`. */
export interface ProblemPhoto {
  file: string;
  by?: string;
  licence?: string;
  source?: string;
}

const bugwood = (by: string, image: number, site = 'ipmimages') => ({
  by: `${by}, Bugwood.org`,
  licence: 'CC BY 3.0 US',
  source: `https://www.${site}.org/browse/image/${image}`,
});
const inat = (by: string, photo: number, licence: 'CC0' | 'CC BY') => ({
  by,
  licence,
  source: `https://www.inaturalist.org/photos/${photo}`,
});

export const PROBLEM_PHOTOS: Record<string, ProblemPhoto> = {
  slugs: {
    file: 'slugs',
    by: 'Josef Schlaghecken',
    licence: 'CC BY 4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Endivien-Schnecken-Josef_Schlaghecken.jpg',
  },
  blight: {
    file: 'blight',
    by: 'Howard F. Schwartz, Colorado State University',
    licence: 'CC BY 3.0 US',
    source:
      'https://commons.wikimedia.org/wiki/File:Late_blight_on_potato_leaf_2.jpg',
  },
  'tomato.blight': {
    file: 'blight-tomato',
    by: 'Natalka Ukraine',
    licence: 'CC BY 4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Phytophthora_infestans_on_Solanum_lycopersicum_in_Dnipro_by_baby-bear.org.jpg',
  },
  caterpillars: {
    file: 'caterpillars',
    by: 'Claudia Schipp',
    licence: 'CC0',
    source: 'https://www.inaturalist.org/observations/80999244',
  },
  aphids: { file: 'aphids', ...inat('Jesse Rorabaugh', 6539703, 'CC0') },
  blackfly: {
    file: 'blackfly',
    by: 'Rob Hille',
    licence: 'Public domain',
    source:
      'https://commons.wikimedia.org/wiki/File:Aphis_fabae_Scopoli_RH_(3).jpg',
  },
  cabbage_aphids: {
    file: 'cabbage-aphids',
    ...inat('Lee Cain', 93974340, 'CC BY'),
  },
  powdery_mildew: {
    file: 'powdery-mildew',
    ...inat('Tyler McBeth', 490478896, 'CC0'),
  },
  downy_mildew: {
    file: 'downy-mildew',
    ...inat('peakaytea', 132213373, 'CC0'),
  },
  'lettuce.downy_mildew': {
    file: 'downy-lettuce',
    ...bugwood('Metin GULESCI, Leaf Tobacco', 5636878),
  },
  'onion.downy_mildew': {
    file: 'downy-onion',
    ...bugwood('Howard F. Schwartz, Colorado State University', 5361481),
  },
  clubroot: { file: 'clubroot', ...inat('DeeF', 171466541, 'CC BY') },
  rust: {
    file: 'rust',
    ...bugwood('Metin GULESCI, Leaf Tobacco', 5635181),
  },
  mint_rust: { file: 'mint-rust', ...inat('yellowplant', 735509434, 'CC BY') },
  red_spider_mite: {
    file: 'red-spider-mite',
    ...bugwood('Whitney Cranshaw, Colorado State University', 5369738),
  },
  flea_beetle: {
    file: 'flea-beetle',
    ...bugwood(
      'Whitney Cranshaw, Colorado State University',
      2200092,
      'insectimages'
    ),
  },
  leaf_miner: {
    file: 'leaf-miner',
    ...inat('Stephen James McWilliam', 720055317, 'CC0'),
  },
  celery_leaf_miner: {
    file: 'celery-leaf-miner',
    ...inat('Stephen James McWilliam', 521504956, 'CC0'),
  },
  cabbage_root_fly: {
    file: 'cabbage-root-fly',
    by: 'Josef Schlaghecken',
    licence: 'CC BY 4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Kohlrabi_Kohlfliegen-Maden_im_Strunk--Josef_Schlaghecken.jpg',
  },
  // No free photo of the damage exists: generated (Codex), checked against
  // the descriptions of carrot fly tunnels.
  carrot_fly: { file: 'carrot-fly' },
  onion_fly: {
    file: 'onion-fly',
    ...inat('Michael Bomford', 702536197, 'CC0'),
  },
};

export const problemPhoto = (crop: string, problem: string | undefined) =>
  problem === undefined
    ? undefined
    : (PROBLEM_PHOTOS[`${crop}.${problem}`] ?? PROBLEM_PHOTOS[problem]);

/** Each crop's problems (grow.<crop>.problems, in that order) as one id each,
 *  the same in every language, so a warning, a loss and a photo can name the
 *  same problem. A pest the weather times keeps its PestId (src/lib/pests.ts). */
export const PROBLEMS: Record<string, readonly string[]> = {
  garlic: ['rust', 'white_rot', 'bulbs_without_cloves'],
  broad_beans: ['aphids', 'chocolate_spot', 'mice'],
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
  kale: ['caterpillars', 'aphids', 'pigeons'],
  cabbage: ['caterpillars', 'cabbage_root_fly', 'clubroot'],
  cauliflower: ['tiny_heads', 'clubroot', 'caterpillars'],
  broccoli: ['early_flowering', 'caterpillars', 'pigeons'],
  brussels_sprouts: ['loose_sprouts', 'aphids', 'clubroot'],
  kohlrabi: ['caterpillars', 'flea_beetle', 'woody_bulbs'],
  onion_sets: ['bolting', 'white_rot', 'onion_fly'],
  onion: ['downy_mildew', 'onion_fly', 'weeds'],
  leek: ['rust', 'allium_leaf_miner', 'leek_moth'],
  celery: ['leaf_miner', 'leaf_spot', 'slugs'],
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
  green_beans: ['slugs', 'aphids', 'flowers_dropping'],
  sweetcorn: ['gappy_cobs', 'birds_mice', 'smut'],
  strawberry: ['grey_mould', 'birds', 'vine_weevil'],
  melon: ['no_fruit_forming', 'powdery_mildew', 'red_spider_mite'],
  watermelon: ['picked_too_early', 'powdery_mildew', 'slugs'],
  basil: ['downy_mildew', 'cold_damage', 'slugs'],
  parsley: ['carrot_fly', 'leaf_miner', 'slow_to_come_up'],
  coriander: ['bolting', 'slugs', 'aphids'],
  dill: ['bolting', 'aphids', 'slugs'],
  chervil: ['bolting', 'aphids'],
  chives: ['rust', 'aphids'],
  thyme: ['root_rot', 'bare_woody_plant', 'rosemary_beetle'],
  rosemary: ['rosemary_beetle', 'frost_and_wet_damage', 'cuckoo_spit'],
  oregano: ['rust', 'leafhoppers', 'mint_moth'],
  sage: ['rosemary_beetle', 'leafhoppers', 'woody_straggly_plant'],
  mint: ['rust', 'spreading_everywhere', 'mint_beetle'],
  tulip: ['tulip_fire', 'squirrels_and_mice', 'few_flowers'],
  daffodil: ['blind', 'bulb_fly', 'rotting_bulbs'],
  crocus: ['squirrels_and_mice', 'birds_pecking_flowers', 'few_flowers'],
  sunflower: ['slugs', 'birds', 'falling_over'],
  marigold: ['slugs', 'grey_mould', 'red_spider_mite'],
  calendula: ['powdery_mildew', 'aphids', 'slugs'],
  nasturtium: ['aphids', 'caterpillars', 'all_leaves_few_flowers'],
  zinnia: ['powdery_mildew', 'leaf_spots', 'slugs'],
  cosmos: ['slugs', 'all_leaves_few_flowers', 'falling_over'],
  sweet_pea: ['aphids', 'powdery_mildew', 'buds_falling_off'],
  lavender: ['root_rot', 'straggly_woody_plant', 'rosemary_beetle'],
  field_beans: ['aphids', 'slugs'],
  winter_rye: ['small_seeds_won_t_come_up', 'cut_too_late'],
  crimson_clover: ['clover_seeding_itself', 'slugs'],
  phacelia: ['seedlings_everywhere', 'itchy_skin'],
  white_mustard: ['clubroot', 'going_to_seed'],
};

/** What a problem looks like: public/huerta/problems/<file>.webp (768 px at
 *  most), credited as its licence asks. Free licences only (CC0, CC BY), real
 *  photos of the damage on the crop. A crop's own photo is keyed
 *  `<crop>.<problem>`. */
export interface ProblemPhoto {
  file: string;
  by: string;
  licence: string;
  source: string;
}

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
};

export const problemPhoto = (crop: string, problem: string | undefined) =>
  problem === undefined
    ? undefined
    : (PROBLEM_PHOTOS[`${crop}.${problem}`] ?? PROBLEM_PHOTOS[problem]);

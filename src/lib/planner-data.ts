/**
 * How each crop looks in the garden planner's model, and its plant family
 * (for rotation and neighbours). Shapes are simple architectural forms; the
 * height is the grown plant's, in metres.
 */
export type PlantHabit =
  | 'spikes'
  | 'rosette'
  | 'root'
  | 'ball'
  | 'column'
  | 'climber'
  | 'sprawl'
  | 'flower'
  | 'carpet';

export type PlantFamily =
  | 'allium'
  | 'legume'
  | 'brassica'
  | 'nightshade'
  | 'cucurbit'
  | 'umbellifer'
  | 'beet'
  | 'daisy'
  | 'mint'
  | 'grass'
  | 'other';

export interface PlantLook {
  family: PlantFamily;
  habit: PlantHabit;
  height: number;
  leaf: string;
  /** Fruit, flower or root colour, where the plant shows one. */
  accent?: string;
}

export const PLANT_LOOK: Record<string, PlantLook> = {
  garlic: {
    family: 'allium',
    habit: 'spikes',
    height: 0.45,
    leaf: '#9db58a',
    accent: '#f2efe6',
  },
  broad_beans: {
    family: 'legume',
    habit: 'column',
    height: 0.9,
    leaf: '#7f9a7a',
    accent: '#f2efe6',
  },
  lettuce: { family: 'daisy', habit: 'rosette', height: 0.2, leaf: '#9cc06f' },
  lambs_lettuce: {
    family: 'other',
    habit: 'rosette',
    height: 0.1,
    leaf: '#4f7f45',
  },
  rocket: {
    family: 'brassica',
    habit: 'rosette',
    height: 0.2,
    leaf: '#6f9a52',
  },
  spinach: { family: 'beet', habit: 'rosette', height: 0.2, leaf: '#5f8f4e' },
  peas: { family: 'legume', habit: 'climber', height: 1.5, leaf: '#8ab86a' },
  radish: {
    family: 'brassica',
    habit: 'root',
    height: 0.15,
    leaf: '#7aa65a',
    accent: '#d8455a',
  },
  carrot: {
    family: 'umbellifer',
    habit: 'root',
    height: 0.3,
    leaf: '#7aa65a',
    accent: '#e8892a',
  },
  parsnip: {
    family: 'umbellifer',
    habit: 'root',
    height: 0.4,
    leaf: '#7aa65a',
    accent: '#efe3c4',
  },
  beetroot: {
    family: 'beet',
    habit: 'root',
    height: 0.3,
    leaf: '#5d7a4c',
    accent: '#8a2846',
  },
  turnip: {
    family: 'brassica',
    habit: 'root',
    height: 0.25,
    leaf: '#7aa65a',
    accent: '#b9a0c8',
  },
  chard: {
    family: 'beet',
    habit: 'rosette',
    height: 0.4,
    leaf: '#5d8a4c',
    accent: '#c43a5a',
  },
  chicory: {
    family: 'daisy',
    habit: 'rosette',
    height: 0.25,
    leaf: '#7f9a6a',
    accent: '#8a2040',
  },
  kale: { family: 'brassica', habit: 'ball', height: 0.6, leaf: '#6f8f86' },
  cabbage: {
    family: 'brassica',
    habit: 'ball',
    height: 0.35,
    leaf: '#86a39a',
    accent: '#c8dcb0',
  },
  cauliflower: {
    family: 'brassica',
    habit: 'ball',
    height: 0.4,
    leaf: '#86a39a',
    accent: '#f2ecdc',
  },
  broccoli: {
    family: 'brassica',
    habit: 'ball',
    height: 0.5,
    leaf: '#86a39a',
    accent: '#3f5d3a',
  },
  brussels_sprouts: {
    family: 'brassica',
    habit: 'column',
    height: 0.8,
    leaf: '#86a39a',
  },
  kohlrabi: {
    family: 'brassica',
    habit: 'ball',
    height: 0.3,
    leaf: '#8fae8a',
    accent: '#c8dca0',
  },
  onion_sets: {
    family: 'allium',
    habit: 'spikes',
    height: 0.4,
    leaf: '#8fb07a',
    accent: '#c8a36a',
  },
  onion: {
    family: 'allium',
    habit: 'spikes',
    height: 0.45,
    leaf: '#8fb07a',
    accent: '#a24a68',
  },
  leek: { family: 'allium', habit: 'spikes', height: 0.55, leaf: '#7f9f8a' },
  celery: {
    family: 'umbellifer',
    habit: 'rosette',
    height: 0.45,
    leaf: '#a8c880',
  },
  fennel: {
    family: 'umbellifer',
    habit: 'ball',
    height: 0.5,
    leaf: '#9bc07a',
    accent: '#f0efe0',
  },
  potato: { family: 'nightshade', habit: 'ball', height: 0.6, leaf: '#6f8f4a' },
  asparagus: { family: 'other', habit: 'column', height: 0.3, leaf: '#7aa65a' },
  rhubarb: {
    family: 'other',
    habit: 'ball',
    height: 0.7,
    leaf: '#6f9a4a',
    accent: '#b8283a',
  },
  artichoke: {
    family: 'daisy',
    habit: 'ball',
    height: 1.0,
    leaf: '#9aa8a0',
    accent: '#7a6a8a',
  },
  tomato: {
    family: 'nightshade',
    habit: 'column',
    height: 1.5,
    leaf: '#5f8a42',
    accent: '#d24b3a',
  },
  pepper: {
    family: 'nightshade',
    habit: 'column',
    height: 0.6,
    leaf: '#4f7a3a',
    accent: '#c9382e',
  },
  chilli: {
    family: 'nightshade',
    habit: 'column',
    height: 0.6,
    leaf: '#4f7a3a',
    accent: '#c62f2b',
  },
  aubergine: {
    family: 'nightshade',
    habit: 'column',
    height: 0.8,
    leaf: '#7f8f7a',
    accent: '#4b2a5a',
  },
  cucumber: {
    family: 'cucurbit',
    habit: 'climber',
    height: 1.6,
    leaf: '#5f8a42',
  },
  courgette: {
    family: 'cucurbit',
    habit: 'sprawl',
    height: 0.5,
    leaf: '#6f9a4a',
    accent: '#2f4f25',
  },
  pumpkin: {
    family: 'cucurbit',
    habit: 'sprawl',
    height: 0.4,
    leaf: '#7aa65a',
    accent: '#e07b2c',
  },
  winter_squash: {
    family: 'cucurbit',
    habit: 'sprawl',
    height: 0.4,
    leaf: '#7aa65a',
    accent: '#d9a066',
  },
  green_beans: {
    family: 'legume',
    habit: 'climber',
    height: 1.8,
    leaf: '#6f9a4a',
  },
  sweetcorn: {
    family: 'grass',
    habit: 'column',
    height: 1.8,
    leaf: '#7aa64a',
    accent: '#f0d050',
  },
  strawberry: {
    family: 'other',
    habit: 'sprawl',
    height: 0.2,
    leaf: '#5f8a42',
    accent: '#d23b3b',
  },
  melon: {
    family: 'cucurbit',
    habit: 'sprawl',
    height: 0.3,
    leaf: '#7aa65a',
    accent: '#cdbb7a',
  },
  watermelon: {
    family: 'cucurbit',
    habit: 'sprawl',
    height: 0.3,
    leaf: '#7aa65a',
    accent: '#2f5a2a',
  },
  basil: { family: 'mint', habit: 'ball', height: 0.35, leaf: '#5f9a45' },
  parsley: {
    family: 'umbellifer',
    habit: 'rosette',
    height: 0.25,
    leaf: '#4f8f3e',
  },
  coriander: {
    family: 'umbellifer',
    habit: 'rosette',
    height: 0.3,
    leaf: '#6fa050',
  },
  dill: {
    family: 'umbellifer',
    habit: 'flower',
    height: 0.9,
    leaf: '#9bb070',
    accent: '#e8d23a',
  },
  chervil: {
    family: 'umbellifer',
    habit: 'rosette',
    height: 0.3,
    leaf: '#8fbf6f',
  },
  chives: {
    family: 'allium',
    habit: 'spikes',
    height: 0.3,
    leaf: '#6f9a52',
    accent: '#b38ac8',
  },
  thyme: {
    family: 'mint',
    habit: 'ball',
    height: 0.2,
    leaf: '#8a9a7a',
    accent: '#c8a8d0',
  },
  rosemary: {
    family: 'mint',
    habit: 'ball',
    height: 0.7,
    leaf: '#5f7a5a',
    accent: '#9ab0d8',
  },
  oregano: {
    family: 'mint',
    habit: 'ball',
    height: 0.3,
    leaf: '#7a9a5a',
    accent: '#c88ab8',
  },
  sage: { family: 'mint', habit: 'ball', height: 0.45, leaf: '#9aaa94' },
  mint: { family: 'mint', habit: 'ball', height: 0.4, leaf: '#5fae5a' },
  tulip: {
    family: 'other',
    habit: 'flower',
    height: 0.45,
    leaf: '#7f9a7a',
    accent: '#d8342c',
  },
  daffodil: {
    family: 'other',
    habit: 'flower',
    height: 0.4,
    leaf: '#6f9a5a',
    accent: '#f2c230',
  },
  crocus: {
    family: 'other',
    habit: 'flower',
    height: 0.12,
    leaf: '#6f9a5a',
    accent: '#8a5ab8',
  },
  sunflower: {
    family: 'daisy',
    habit: 'flower',
    height: 2.0,
    leaf: '#6f9a4a',
    accent: '#f0b62c',
  },
  marigold: {
    family: 'daisy',
    habit: 'flower',
    height: 0.3,
    leaf: '#4f7a3a',
    accent: '#e8892a',
  },
  calendula: {
    family: 'daisy',
    habit: 'flower',
    height: 0.4,
    leaf: '#7aa65a',
    accent: '#f0a020',
  },
  nasturtium: {
    family: 'other',
    habit: 'sprawl',
    height: 0.25,
    leaf: '#7f9a6a',
    accent: '#ef6a24',
  },
  zinnia: {
    family: 'daisy',
    habit: 'flower',
    height: 0.6,
    leaf: '#5f8a42',
    accent: '#e0457b',
  },
  cosmos: {
    family: 'daisy',
    habit: 'flower',
    height: 1.0,
    leaf: '#7aa65a',
    accent: '#e58bb8',
  },
  sweet_pea: {
    family: 'legume',
    habit: 'climber',
    height: 1.8,
    leaf: '#7f9a6a',
    accent: '#d888b8',
  },
  lavender: {
    family: 'mint',
    habit: 'ball',
    height: 0.5,
    leaf: '#9aa794',
    accent: '#8d7bc4',
  },
  field_beans: {
    family: 'legume',
    habit: 'column',
    height: 0.8,
    leaf: '#7f9a7a',
    accent: '#f2efe6',
  },
  winter_rye: {
    family: 'grass',
    habit: 'carpet',
    height: 0.5,
    leaf: '#a9b46a',
  },
  crimson_clover: {
    family: 'legume',
    habit: 'carpet',
    height: 0.3,
    leaf: '#6f9a4a',
    accent: '#b8283a',
  },
  phacelia: {
    family: 'other',
    habit: 'carpet',
    height: 0.5,
    leaf: '#7aa65a',
    accent: '#8e86c8',
  },
  white_mustard: {
    family: 'brassica',
    habit: 'carpet',
    height: 0.5,
    leaf: '#7aa65a',
    accent: '#e8d23a',
  },
};

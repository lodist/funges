/*
 * The run, stage by stage: from Scandinavia over the fjords, through
 * Europe's cities and highlands, then across America to the Grand Canyon,
 * and round again, faster. A stage's art lives in src/assets/game/<id>/
 * under the names used here. Sizes are hitboxes in game pixels (the screen
 * is 480×270); a sprite may be drawn a little larger than its box.
 */

export interface Trap {
  id: string;
  w: number;
  h: number;
  /** Flies, low (jump it or slide under it) or high (run under it). */
  fly?: true;
  /** Leaps aside from a ride instead of bursting. */
  animal?: true;
  /** Comes at the squirrel faster than the ground, px per tick. */
  speed?: number;
}

export interface Stage {
  id: string;
  length: number;
  /** How much the land rolls: 1 is the norm, the Alps steep, a city's
   *  streets gentle. */
  hills: number;
  traps: Trap[];
  /** A common and a rare pickup. */
  pickups?: [common: string, rare: string];
  gaps?: true;
  /** What the golden acorn lets the squirrel ride. */
  ride?: string;
  /** Once per stage, up in the air: something local that is a life back. */
  egg: string;
}

export const STAGES: Stage[] = [
  {
    id: 'scandinavia',
    length: 15000,
    hills: 1.0,
    traps: [
      { id: 'moose', w: 20, h: 21, animal: true },
      { id: 'boulder', w: 16, h: 12 },
      { id: 'birch', w: 30, h: 9 },
    ],
    pickups: ['chanterelle', 'cloudberry'],
    ride: 'longship',
    egg: 'bun',
  },
  {
    id: 'fjords',
    length: 15000,
    hills: 0.9,
    traps: [
      { id: 'seal', w: 17, h: 7, animal: true },
      { id: 'rock', w: 13, h: 10 },
      { id: 'gull', w: 11, h: 7, fly: true, animal: true },
    ],
    pickups: ['dulse', 'sea-kale'],
    gaps: true,
    ride: 'reindeer',
    egg: 'waffle',
  },
  {
    id: 'copenhagen',
    length: 15000,
    hills: 0.4,
    traps: [
      { id: 'bollard', w: 8, h: 12 },
      { id: 'duck', w: 11, h: 9, animal: true },
      { id: 'swan', w: 14, h: 8, fly: true, animal: true },
    ],
    pickups: ['wood-sorrel', 'sea-buckthorn'],
    ride: 'cargobike',
    egg: 'danish',
  },
  {
    id: 'highlands',
    length: 15000,
    hills: 1.1,
    traps: [
      { id: 'highland-cow', w: 22, h: 17, animal: true },
      { id: 'standing-stone', w: 7, h: 15 },
      { id: 'grouse', w: 11, h: 7, fly: true, animal: true },
    ],
    pickups: ['bramble', 'hedgehog'],
    ride: 'steamtrain',
    egg: 'shortbread',
  },
  {
    id: 'paris',
    length: 15000,
    hills: 0.5,
    traps: [
      { id: 'cafe', w: 22, h: 12 },
      { id: 'pigeon', w: 10, h: 8, fly: true, animal: true },
      { id: 'bike', w: 22, h: 16, speed: 0.8 },
    ],
    pickups: ['parasol', 'truffle'],
    ride: 'littlecar',
    egg: 'croissant',
  },
  {
    id: 'barcelona',
    length: 15000,
    hills: 0.6,
    traps: [
      { id: 'drac', w: 22, h: 10 },
      { id: 'football', w: 8, h: 8, speed: 1.2 },
      { id: 'parakeet', w: 10, h: 7, fly: true, animal: true },
    ],
    pickups: ['asparagus', 'milkcap'],
    ride: 'skateboard',
    egg: 'churro',
  },
  {
    id: 'rome',
    length: 15000,
    hills: 0.8,
    traps: [
      { id: 'column', w: 12, h: 16 },
      { id: 'parked-scooter', w: 16, h: 14 },
    ],
    pickups: ['chestnut', 'bronze-bolete'],
    gaps: true,
    ride: 'scooter',
    egg: 'gelato',
  },
  {
    id: 'alps',
    length: 15000,
    hills: 1.4,
    traps: [
      { id: 'cow', w: 22, h: 16, animal: true },
      { id: 'snowball', w: 12, h: 12, speed: 1 },
    ],
    pickups: ['bilberry', 'pine-bolete'],
    gaps: true,
    ride: 'postbus',
    egg: 'cheese',
  },
  {
    id: 'newyork',
    length: 15000,
    hills: 0.5,
    traps: [
      { id: 'steam', w: 9, h: 16 },
      { id: 'hotdog', w: 16, h: 16 },
      { id: 'pigeon', w: 10, h: 8, fly: true, animal: true },
    ],
    pickups: ['ramps', 'hen-of-the-woods'],
    ride: 'cab',
    egg: 'apple',
  },
  {
    id: 'neworleans',
    length: 15000,
    hills: 0.35,
    traps: [
      { id: 'alligator', w: 26, h: 7, animal: true },
      { id: 'crawfish', w: 10, h: 6, animal: true },
      { id: 'pelican', w: 14, h: 8, fly: true, animal: true },
    ],
    pickups: ['muscadine', 'chicken-of-the-woods'],
    ride: 'streetcar',
    egg: 'beignet',
  },
  {
    id: 'yosemite',
    length: 15000,
    hills: 1.2,
    traps: [
      { id: 'granite', w: 15, h: 11 },
      { id: 'coyote', w: 18, h: 13, animal: true },
      { id: 'jay', w: 10, h: 7, fly: true, animal: true },
    ],
    pickups: ['miners-lettuce', 'morel'],
    gaps: true,
    ride: 'mule',
    egg: 'cocoa',
  },
  {
    id: 'sequoia',
    length: 15000,
    hills: 1.0,
    traps: [
      { id: 'log', w: 22, h: 9 },
      { id: 'stump', w: 14, h: 14 },
      { id: 'bear', w: 21, h: 18, animal: true },
      { id: 'marmot', w: 10, h: 14, animal: true },
    ],
    pickups: ['huckleberry', 'pacific-chanterelle'],
    ride: 'bigfoot',
    egg: 'marshmallow',
  },
  {
    id: 'canyon',
    length: 15000,
    hills: 1.2,
    traps: [
      { id: 'bighorn', w: 17, h: 16, animal: true },
      { id: 'tumbleweed', w: 12, h: 12, speed: 1.2 },
      { id: 'rattlesnake', w: 9, h: 6, animal: true },
    ],
    pickups: ['elderberry', 'king-bolete'],
    gaps: true,
    ride: 'chopper',
    egg: 'canteen',
  },
];

/** One lap, Scandinavia to the canyon, in world pixels. */
export const LAP = STAGES.reduce((sum, stage) => sum + stage.length, 0);

/** The classic route: the stages in the order above. */
export const CLASSIC: readonly number[] = STAGES.map((_, i) => i);

/** Where a world distance falls on a route (the stages' indices in the order
 *  run): the stage, its leg of the route, the lap and the stage's start. */
export function stageAt(dist: number, route = CLASSIC) {
  const lap = Math.floor(dist / LAP);
  let start = lap * LAP;
  let leg = 0;
  while (leg < route.length - 1 && dist >= start + STAGES[route[leg]].length) {
    start += STAGES[route[leg]].length;
    leg++;
  }
  return { index: route[leg], leg, lap, start };
}

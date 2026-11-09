/*
 * The run, stage by stage: Scandinavia to the Grand Canyon, then again,
 * faster. A stage's art lives in src/assets/game/<id>/ under the names used
 * here. Sizes are hitboxes in game pixels (the screen is 480×270); a
 * sprite may be drawn a little larger than its box.
 */

export interface Trap {
  id: string;
  w: number;
  h: number;
  /** Flies, low (jump it) or high (run under it). */
  fly?: true;
  /** Leaps aside from a ride instead of bursting. */
  animal?: true;
  /** Comes at the squirrel faster than the ground, px per tick. */
  speed?: number;
}

export interface Stage {
  id: string;
  length: number;
  /** How much the land rolls: 1 is the norm, the Alps steep, a ship's deck
   *  a gentle swell. */
  hills: number;
  traps: Trap[];
  /** A common and a rare pickup; none at sea. */
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
    id: 'atlantic',
    length: 7200,
    hills: 0.25,
    traps: [
      { id: 'crate', w: 14, h: 14 },
      { id: 'rope', w: 12, h: 8 },
    ],
    egg: 'lifebuoy',
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
    id: 'sequoia',
    length: 15000,
    hills: 1.0,
    traps: [
      { id: 'log', w: 22, h: 9 },
      { id: 'stump', w: 14, h: 14 },
      { id: 'bear', w: 21, h: 18, animal: true },
      { id: 'slug', w: 10, h: 4, animal: true },
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
      { id: 'cactus', w: 10, h: 18 },
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

/** Where a world distance falls: the stage, the lap and the stage's start. */
export function stageAt(dist: number) {
  const lap = Math.floor(dist / LAP);
  let start = lap * LAP;
  let index = 0;
  while (index < STAGES.length - 1 && dist >= start + STAGES[index].length) {
    start += STAGES[index].length;
    index++;
  }
  return { index, lap, start };
}

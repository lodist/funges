/*
 * The run, stage by stage: Scandinavia to the Grand Canyon, then again,
 * faster. A stage's art lives in src/assets/game/<id>/ under the names used
 * here. Sizes are hitboxes in game pixels (the screen is 320×180, 10 px =
 * 1 m); a sprite may be drawn a little larger than its box.
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
  traps: Trap[];
  /** A common and a rare pickup; none at sea. */
  pickups?: [common: string, rare: string];
  gaps?: true;
  /** What the golden acorn lets the squirrel ride. */
  ride?: string;
  /** Once per stage: the Trevi coin (points) or the beret (worn). */
  egg?: { id: string; points: number };
}

export const STAGES: Stage[] = [
  {
    id: 'scandinavia',
    length: 5000,
    traps: [
      { id: 'moose', w: 26, h: 28, animal: true },
      { id: 'boulder', w: 22, h: 16 },
      { id: 'birch', w: 40, h: 12 },
    ],
    pickups: ['chanterelle', 'cloudberry'],
    ride: 'longship',
  },
  {
    id: 'paris',
    length: 5000,
    traps: [
      { id: 'chairs', w: 20, h: 16 },
      { id: 'pigeon', w: 11, h: 9, fly: true, animal: true },
      { id: 'bike', w: 30, h: 22, speed: 0.8 },
    ],
    pickups: ['parasol', 'truffle'],
    ride: 'littlecar',
    egg: { id: 'beret', points: 0 },
  },
  {
    id: 'rome',
    length: 5000,
    traps: [
      { id: 'column', w: 16, h: 22 },
      { id: 'parked-scooter', w: 22, h: 18 },
    ],
    pickups: ['chestnut', 'bronze-bolete'],
    gaps: true,
    ride: 'scooter',
    egg: { id: 'coin', points: 100 },
  },
  {
    id: 'alps',
    length: 5000,
    traps: [
      { id: 'cow', w: 30, h: 22, animal: true },
      { id: 'snowball', w: 16, h: 16, speed: 1 },
    ],
    pickups: ['bilberry', 'pine-bolete'],
    gaps: true,
    ride: 'postbus',
  },
  {
    id: 'atlantic',
    length: 2400,
    traps: [
      { id: 'crate', w: 18, h: 18 },
      { id: 'rope', w: 12, h: 10 },
    ],
  },
  {
    id: 'newyork',
    length: 5000,
    traps: [
      { id: 'steam', w: 12, h: 22 },
      { id: 'hotdog', w: 22, h: 22 },
      { id: 'pigeon', w: 11, h: 9, fly: true, animal: true },
    ],
    pickups: ['ramps', 'hen-of-the-woods'],
    ride: 'cab',
  },
  {
    id: 'redwoods',
    length: 5000,
    traps: [
      { id: 'log', w: 30, h: 12 },
      { id: 'stump', w: 18, h: 18 },
      { id: 'bear', w: 28, h: 24, animal: true },
      { id: 'slug', w: 14, h: 6, animal: true },
    ],
    pickups: ['huckleberry', 'pacific-chanterelle'],
    ride: 'bigfoot',
  },
  {
    id: 'canyon',
    length: 5000,
    traps: [
      { id: 'cactus', w: 14, h: 24 },
      { id: 'tumbleweed', w: 16, h: 16, speed: 1.2 },
      { id: 'rattlesnake', w: 12, h: 8, animal: true },
    ],
    pickups: ['elderberry', 'king-bolete'],
    gaps: true,
    ride: 'chopper',
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

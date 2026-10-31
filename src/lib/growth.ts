/**
 * A planted crop's growth, by the calendar's own model (the windows builder,
 * data_tools/build_huerta_windows.py: its growth and harvest_span for one
 * sowing), fed by the warmth the crop actually had where the place's daily
 * means are known (`warm`, the night's observed days and this week's
 * forecast), else by the place's typical year. In a typical year a crop is
 * ready on the day the calendar's harvest starts and picked until its end.
 *
 * Days count as the builder's: a 365-day year (29 February is the 28th), from
 * 1 January of the year the crop went in, over four years.
 */
import type { PlaceYear } from '@/lib/huerta-wire';

/** What the model needs of a crop (the year files' `bio`, bio_rows). */
export interface Bio {
  /** Base temperature, C: no growth below it. */
  tb: number;
  /** Its class's optimum, low and high, and its maximum, C. */
  tlo: number;
  thi: number;
  tmax: number;
  /** Days to harvest where seed firms time it. */
  days: number;
  /** What frost does: tender, semi-hardy (a hard frost ends it), hardy. */
  kill: 't' | 's' | 'h';
  /** What ends its harvest with the season. */
  end: 'frost' | 'growth' | 'hold' | 'winter' | 'bulb';
  /** Weeks it is picked once ready. */
  pick: number;
  /** Heat stops it (it bolts or drops its flowers). */
  strict: boolean;
  /** The lowest temperature it lives through, C; null: none (tender). */
  hardy: number | null;
  /** It needs warm nights (chilling-sensitive). */
  night: boolean;
}

/** The place, as the model reads it. */
export interface GrowthPlace {
  lat: number;
  /** Monthly mean air (C) and sunshine (MJ m-2 day-1), January first. */
  temps: number[];
  sun: number[];
  /** Typical days of the year (1-based, 0: none): the first light (2 C),
   *  ground (0 C) and hard (-3 C) frost of autumn, and the end of the warm
   *  nights (10 C); the winter's usual low (C, null: not known). */
  light: number;
  first0: number;
  firstm3: number;
  warmEnd: number;
  low: number | null;
}

/** The place's daily mean air from a day: observed, then forecast. */
export interface Warm {
  start: string;
  t: (number | null)[];
}

export interface Growth {
  /** Share of the warmth it needs gathered by `day` (1: ready by warmth). */
  progress: (day: string) => number;
  /** The day it is first picked; null when not within two years. */
  ready: string | null;
  /** The last day it is picked; null with `ready`. */
  end: string | null;
}

const YEAR = 365;
const RUN = 4 * YEAR;
const NEVER = 1e6;
const R_SAT = 8; // MJ m-2 day-1: sun above which growth is not light-limited
const DORMANT = 0.1; // under this share of its pace a day, it stands still
const T_TRIAL = 19; // C: the summer mean of the seed firms' trials
const COOL_END = 30; // days tender crops still ripen after the warm nights end
const BOLT = 21; // days a crop that stood the winter is picked after it grows again
const GARLIC_GDD = 1400; // degree days above 0 C from the spring equinox to garlic's harvest
const EQUINOX = 78; // day index of 20 March
const AUTUMN = 182; // day index + 1 of 1 July
const ONIONS = new Set(['onion', 'onion_sets']);
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const MONTH_OF = Array.from({ length: YEAR }, (_, d) => {
  let m = 11;
  while (MONTH_START[m] > d) m--;
  return m;
});

/** Python's and numpy's rounding: halves to even. */
const round = (x: number) => {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
};
const mod = (x: number, n: number) => ((x % n) + n) % n;

/** A YYYY-MM-DD day's index in its 365-day year. */
export function dayIndex(day: string) {
  const [, m, d] = day.split('-').map(Number);
  return MONTH_START[m - 1] + Math.min(d, m === 2 ? 28 : 31) - 1;
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const between = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5
  );

/** Monthly means to the 365 days, each month's mean at its middle, straight
 *  lines between (the builder's `daily`). */
export function daily(monthly: number[]) {
  const mid = (m: number) => ((m + 0.5) * YEAR) / 12;
  return Array.from({ length: YEAR }, (_, d) => {
    const x = d + 0.5;
    const k = Math.floor(x / (YEAR / 12) - 0.5);
    const x0 = mid(k);
    const w = (x - x0) / (YEAR / 12);
    return (1 - w) * monthly[mod(k, 12)] + w * monthly[mod(k + 1, 12)];
  });
}

/** Hours from sunrise to sunset (Forsythe et al. 1995), day index d. */
function dayLength(lat: number, d: number) {
  const theta =
    0.2163108 + 2 * Math.atan(0.9671396 * Math.tan(0.0086 * (d + 1 - 186)));
  const phi = Math.asin(0.39795 * Math.cos(theta));
  const L = (lat * Math.PI) / 180;
  const x =
    (Math.sin((0.8333 * Math.PI) / 180) + Math.sin(L) * Math.sin(phi)) /
    (Math.cos(L) * Math.cos(phi));
  return 24 - (24 / Math.PI) * Math.acos(Math.min(1, Math.max(-1, x)));
}

/** The day onions start to bulb: when the days first reach the local type's
 *  length (short-day south of 30 N, intermediate to 36 N, long-day north). */
function bulbing(lat: number) {
  const length = lat < 30 ? 12 : lat < 36 ? 13.5 : 15;
  for (let d = 0; d < 182; d++) if (dayLength(lat, d) >= length) return d;
  return 171;
}

/** The first index at or after `i` where `test` holds over the run, else NEVER. */
const nextWhere = (mask: boolean[]) => {
  const next = new Array<number>(RUN + 1).fill(NEVER);
  for (let i = RUN - 1; i >= 0; i--) next[i] = mask[i] ? i : next[i + 1];
  return (i: number) => next[Math.min(Math.max(i, 0), RUN - 1)];
};

/** Index (in the run) of day of year day1 (1-based, 0: none) on or after h. */
const after = (day1: number, h: number) => {
  const d = day1 - 1;
  if (d < 0) return NEVER;
  const base = h - mod(h, YEAR);
  return mod(h, YEAR) <= d ? base + d : base + YEAR + d;
};

/** The place's model inputs from its year and garden place; null where the
 *  year files carry no sunshine (a year kept from before the model). */
export function growthPlace(
  year: PlaceYear | null | undefined,
  lat: number
): GrowthPlace | null {
  if (!year?.temps || !year.sun || !year.climate) return null;
  const c = year.climate;
  return {
    lat,
    temps: year.temps,
    sun: year.sun,
    light: c.light ?? 0,
    first0: c.frost?.[0] ?? 0,
    firstm3: c.hard?.[0] ?? 0,
    warmEnd: c.warm10?.[1] ?? 0,
    low: c.low,
  };
}

/** The growth of `crop` put in on `planted` at `place`; `shift` warms the
 *  spring months for a light soil (soilTemps). */
export function plantedGrowth(
  crop: string,
  bio: Bio,
  place: GrowthPlace,
  planted: string,
  warm?: Warm | null,
  shift = 0
): Growth {
  const s = dayIndex(planted);
  const dateAt = (i: number) => addDays(planted, i - s);
  const temps = place.temps.map((t, m) => (m < 6 ? t + shift : t));
  const normal = daily(temps);
  const sunny = daily(place.sun);
  const from = warm ? between(planted, warm.start) + s : 0;
  const air = Array.from({ length: RUN }, (_, i) => {
    const t = warm?.t[i - from];
    if (t === null || t === undefined) return normal[i % YEAR];
    return MONTH_OF[i % YEAR] < 6 ? t + shift : t;
  });

  const pace = Math.min((bio.tlo + bio.thi) / 2, T_TRIAL) - bio.tb;
  const need = bio.days * pace;
  const rate = air.map(
    (a, i) =>
      Math.max(0, Math.min(a, bio.thi) - bio.tb) *
      Math.min(1, sunny[i % YEAR] / R_SAT)
  );
  const cum = [0];
  for (let i = 0; i < RUN; i++) cum.push(cum[i] + rate[i]);
  const dormant = rate.map(r => r < DORMANT * pace);
  const rest = nextWhere(dormant);
  const grow = nextWhere(dormant.map(d => !d));

  // Garlic counts its warmth above 0 C from the spring equinox (or planting).
  const garlic = crop === 'garlic';
  const gdd = [0];
  if (garlic)
    for (let i = 0; i < RUN; i++) gdd.push(gdd[i] + Math.max(air[i], 0));
  const autumn = s >= AUTUMN - 1;
  const garlicFrom = autumn ? EQUINOX + YEAR : Math.max(s, EQUINOX);

  const progress = (day: string) => {
    const i = Math.min(Math.max(s + between(planted, day), 0), RUN);
    if (garlic)
      return i <= garlicFrom ? 0 : (gdd[i] - gdd[garlicFrom]) / GARLIC_GDD;
    return (cum[i] - cum[s]) / need;
  };

  let h: number;
  if (garlic) {
    const target = gdd[garlicFrom] + GARLIC_GDD;
    h = gdd.findIndex(g => g >= target);
    const season = autumn ? EQUINOX + YEAR : EQUINOX;
    if (h < 0 || h > season + 200) return { progress, ready: null, end: null };
  } else {
    const target = cum[s] + need;
    h = cum.findIndex(c => c >= target);
    if (h < 0 || h > 2 * YEAR) return { progress, ready: null, end: null };
    if (ONIONS.has(crop)) {
      const start = bulbing(place.lat) + 42;
      if (mod(h, YEAR) < start) h = h - mod(h, YEAR) + start;
    }
  }

  // harvest_span, for this one sowing.
  let H = h;
  let season = s;
  let slept = false;
  if (bio.end === 'growth' || bio.end === 'hold' || bio.end === 'winter') {
    for (let i = s; i < Math.min(H, RUN); i++) if (dormant[i]) slept = true;
  }
  if (bio.end === 'growth' || bio.end === 'hold') {
    const clip = Math.min(Math.max(H, 0), RUN - 1);
    if (slept && dormant[clip]) H = grow(clip);
    season = slept ? H : s;
  } else if (bio.end === 'winter') {
    const regrow = grow(rest(s));
    if (slept && H > regrow) H = regrow;
  }
  let E = H + round(7 * bio.pick);
  const lives = place.low !== null && place.low >= (bio.hardy ?? 99);
  if (bio.end === 'frost') {
    E = Math.min(E, after(place.light, s) - 1);
    E = Math.min(E, rest(H) - 1);
    if (bio.night) E = Math.min(E, after(place.warmEnd, s) + COOL_END);
  } else if (bio.end !== 'bulb') {
    const hard = lives
      ? NEVER
      : after(place.first0, bio.end === 'winter' ? H : season) - 1;
    if (bio.end === 'growth') {
      E = Math.min(E, rest(H) - 1);
      if (bio.kill !== 'h') E = Math.min(E, hard);
    } else if (bio.end === 'hold') {
      E = Math.min(E, hard);
    } else {
      // Its weeks of picking count growing days only; it ends in spring
      // three weeks after it grows again, or warms to its optimum, and bolts;
      // where the winter kills it, then.
      const grown = [0];
      for (let i = 0; i < RUN; i++) grown.push(grown[i] + (dormant[i] ? 0 : 1));
      const target = grown[Math.min(Math.max(H, 0), RUN)] + 7 * bio.pick;
      const at = grown.findIndex(g => g >= target);
      E = at < 0 ? RUN + 1 : at;
      const sleep = rest(s);
      let spring = sleep < NEVER ? grow(sleep) + BOLT : NEVER;
      const coldest = after(coldestMid(normal) + 1, s);
      const warmAgain = nextWhere(air.map(a => a >= bio.tlo))(coldest);
      spring = Math.min(spring, warmAgain + BOLT);
      E = lives
        ? Math.min(E, spring)
        : Math.min(E, winterKill(H, normal, place, bio.hardy ?? 99));
    }
    if (bio.end === 'growth' || bio.end === 'winter' || bio.strict) {
      const hot = nextWhere(air.map(a => a > bio.tmax));
      E = Math.min(E, hot(H) - 1);
    }
  }
  return { progress, ready: dateAt(H), end: dateAt(Math.max(E, H)) };
}

/** The day index of the middle of the coldest month. */
function coldestMid(normal: number[]) {
  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  normal.forEach((t, d) => {
    sums[MONTH_OF[d]] += t;
    counts[MONTH_OF[d]] += 1;
  });
  const means = sums.map((s, m) => s / counts[m]);
  return 14 + MONTH_START[means.indexOf(Math.min(...means))];
}

/** The day the winter after H kills a crop that takes `hardy` C at most:
 *  the first -3 C frost for one that takes no more, else as far on from it
 *  towards the middle of the coldest month as its limit is towards the low. */
function winterKill(
  H: number,
  normal: number[],
  place: GrowthPlace,
  hardy: number
) {
  const mid = coldestMid(normal) + 1;
  const low = place.low ?? NaN;
  const gap = place.firstm3 > 0 ? mod(mid - (place.firstm3 - 1), YEAR) : 0;
  const share =
    hardy < -3
      ? Math.min(1, Math.max(0, (-3 - hardy) / Math.max(-3 - low, 1e-6)))
      : 0;
  return after(mid + 1, H) - gap + round(share * gap);
}

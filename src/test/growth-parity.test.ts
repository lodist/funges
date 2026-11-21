import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Bio, type GrowthPlace, plantedGrowth } from '@/lib/growth';

/**
 * The planted-crop model against the calendar's windows builder, on cases it
 * writes locally (data_tools/growth_parity.py; the builder and its inputs are
 * not in this repo). Skipped unless GROWTH_PARITY names the case file.
 *
 * On the builder's own inputs a day may flip where a crop gathers its warmth
 * by a hair: the builder sums in 32-bit floats, this model in 64-bit (a parsnip
 * at Ames, 21 Nov 2026, ready 0.0003 of 1,505 degree days past its day). So
 * one day apart is let through for 1 sowing in 10,000; anything further, or
 * more often, is a model that differs.
 */
const file = process.env.GROWTH_PARITY;
const FLIPS = 1e-4;

interface Case {
  crop: string;
  bio: [
    number,
    number,
    number,
    number,
    number,
    Bio['kill'],
    Bio['end'],
    number,
    number,
    number | null,
    number,
    number?,
  ];
  sown: number;
  ready: number;
  end: number;
}

const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const dateOf = (index: number) => {
  let m = 11;
  while (MONTH_START[m] > index) m--;
  const d = new Date(Date.UTC(2027, m, index - MONTH_START[m] + 1, 12));
  return d.toISOString().slice(0, 10);
};
const between = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

describe.skipIf(!file)(
  'the planted-crop model against the calendar builder',
  () => {
    it.each(['exact', 'year'] as const)(
      'gives the builder’s days on %s inputs',
      which => {
        const data = JSON.parse(readFileSync(file!, 'utf8')) as {
          place: string;
          exact: GrowthPlace;
          year: GrowthPlace;
          crops: Case[];
        }[];
        let total = 0;
        const misses: string[] = [];
        const flips: string[] = [];
        for (const p of data)
          for (const c of p.crops) {
            const [
              tb,
              tlo,
              thi,
              tmax,
              days,
              kill,
              end,
              pick,
              strict,
              hardy,
              night,
              tmin,
            ] = c.bio;
            const bio: Bio = {
              tb,
              tlo,
              thi,
              tmax,
              days,
              kill,
              end,
              pick,
              strict: Boolean(strict),
              hardy,
              night: Boolean(night),
              ...(typeof tmin === 'number' ? { tmin } : {}),
            };
            const planted = dateOf(c.sown);
            const g = plantedGrowth(c.crop, bio, p[which], planted);
            const ready = g.ready && between(planted, g.ready);
            const last = g.end && between(planted, g.end);
            total++;
            if (ready !== c.ready || last !== c.end) {
              const text = `${p.place} ${c.crop} ${planted}: ${ready}/${last} vs ${c.ready}/${c.end}`;
              const apart =
                typeof ready === 'number' && typeof last === 'number'
                  ? Math.max(Math.abs(ready - c.ready), Math.abs(last - c.end))
                  : Infinity;
              (apart <= 1 ? flips : misses).push(text);
            }
          }
        const summary = `${which}: ${total - misses.length - flips.length} of ${total} agree, ${flips.length} a day apart\n${[...misses, ...flips].slice(0, 15).join('\n')}`;
        if (which === 'exact') {
          expect(misses, summary).toEqual([]);
          expect(flips.length / total, summary).toBeLessThanOrEqual(FLIPS);
        } else {
          console.info(summary);
          expect((misses.length + flips.length) / total, summary).toBeLessThan(
            0.02
          );
        }
      },
      120_000 // over 24,000 sowings: longer than vitest's 5 s
    );
  }
);

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Bio, type GrowthPlace, plantedGrowth } from '@/lib/growth';

/**
 * The planted-crop model against the calendar's windows builder, on cases it
 * writes locally (data_tools/growth_parity.py; the builder and its inputs are
 * not in this repo). Skipped unless GROWTH_PARITY names the case file.
 */
const file = process.env.GROWTH_PARITY;

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
            };
            const planted = dateOf(c.sown);
            const g = plantedGrowth(c.crop, bio, p[which], planted);
            const ready = g.ready && between(planted, g.ready);
            const last = g.end && between(planted, g.end);
            total++;
            if (ready !== c.ready || last !== c.end)
              misses.push(
                `${p.place} ${c.crop} ${planted}: ${ready}/${last} vs ${c.ready}/${c.end}`
              );
          }
        const summary = `${which}: ${total - misses.length} of ${total} agree\n${misses.slice(0, 15).join('\n')}`;
        if (which === 'exact') expect(misses, summary).toEqual([]);
        else {
          console.info(summary);
          expect(misses.length / total, summary).toBeLessThan(0.02);
        }
      }
    );
  }
);

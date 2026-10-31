import { describe, expect, it } from 'vitest';

import { cropReasons, SAMPLE_ADVICE, type CropNeeds } from '@/lib/huerta';

const garlic: CropNeeds = {
  frost: 'hardy',
  soil: [7, 15],
  night: null,
  days: 240,
};
const tomato: CropNeeds = {
  frost: 'tender',
  soil: [16, null],
  night: 10,
  days: 70,
};

describe("a crop's reasons for this week", () => {
  it('says the soil fits and that a hardy crop gets through the frosts', () => {
    expect(cropReasons('now', SAMPLE_ADVICE, garlic)).toEqual([
      { ok: true, key: 'soilRange', values: { soil: 13, min: 7, max: 15 } },
      { ok: true, key: 'hardy' },
    ]);
  });

  it("says what holds a crop back, in the place's numbers", () => {
    expect(cropReasons('too_late', SAMPLE_ADVICE, tomato)).toEqual([
      { ok: false, key: 'soilLow', values: { soil: 13, min: 16 } },
      { ok: false, key: 'nights', values: { nights: 8, night: 10 } },
      { ok: false, key: 'late' },
    ]);
    const warm = { ...SAMPLE_ADVICE, soil: 19 };
    expect(cropReasons('too_warm', warm, garlic)[0]).toMatchObject({
      ok: false,
      key: 'soilHigh',
    });
  });

  it("says the season's reason when this week's numbers do not hold it back", () => {
    // The sowing windows say no while this week's soil fits: the place's usual heat, cold or long days.
    expect(cropReasons('too_warm', SAMPLE_ADVICE, garlic).slice(-1)[0]).toEqual(
      {
        ok: false,
        key: 'heat',
      }
    );
    expect(
      cropReasons('wait_soil', SAMPLE_ADVICE, garlic).slice(-1)[0]
    ).toEqual({
      ok: false,
      key: 'coldSeason',
    });
    expect(
      cropReasons('wait_days', SAMPLE_ADVICE, garlic).slice(-1)[0]
    ).toEqual({
      ok: false,
      key: 'longDays',
    });
  });

  it('gives only the season when a crop has no needs to compare', () => {
    expect(cropReasons('wait_autumn', SAMPLE_ADVICE)).toEqual([
      { ok: false, key: 'autumn' },
    ]);
  });
  it("names the frost the forecast has, before the place's frost climate", () => {
    const tomato: CropNeeds = {
      frost: 'tender',
      soil: [16, null],
      night: 10,
      days: 70,
    };
    const soon = { ...SAMPLE_ADVICE, frost: 'frost' as const };
    expect(cropReasons('wait_frost', soon, tomato).slice(-1)[0]).toEqual({
      ok: false,
      key: 'frostSoon',
    });
    const later = {
      ...SAMPLE_ADVICE,
      laterFrost: 'frost' as const,
      laterNight: '2026-10-25',
    };
    expect(cropReasons('wait_frost', later, tomato).slice(-1)[0]).toEqual({
      ok: false,
      key: 'frostLater',
      values: { night: '2026-10-25' },
    });
    expect(
      cropReasons('wait_frost', SAMPLE_ADVICE, tomato).slice(-1)[0]
    ).toEqual({
      ok: false,
      key: 'frost',
    });
  });
});

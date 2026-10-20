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

  it('gives only the season when a crop has no needs to compare', () => {
    expect(cropReasons('wait_autumn', SAMPLE_ADVICE)).toEqual([
      { ok: false, key: 'autumn' },
    ]);
  });
});

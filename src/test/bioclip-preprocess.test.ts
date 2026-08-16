import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLIP_MEAN,
  CLIP_STD,
  preprocessToTensor,
  resizeTarget,
  TARGET_SIZE,
} from '@/lib/bioclip/preprocess';
import reference from './fixtures/preprocess-reference.json';

/**
 * Guards the browser image pipeline against the Python one the model was
 * evaluated with.
 *
 * This is the highest-risk code in the photo-ID feature: `preprocessToTensor`
 * reimplements Pillow's antialiased bicubic resample, and if it drifts, every
 * embedding shifts and accuracy degrades with NOTHING to signal it — no
 * exception, no visible defect, just worse answers.
 *
 * Inputs are deterministic LCG-generated pixels rather than photographs, so the
 * comparison isolates the resampling algorithm from browser-vs-PIL JPEG decode
 * differences (which we neither control nor can fix). Regenerate the references
 * with `python backend/tools/bioclip_export.py --stage parity-synthetic`.
 */

const FIXTURES = join(__dirname, 'fixtures');

/**
 * Same 32-bit LCG the Python generator uses. Must stay byte-identical.
 *
 * BigInt is required, not stylistic: `1103515245 * state` reaches ~2.4e18, well
 * past Number.MAX_SAFE_INTEGER, so plain arithmetic silently loses precision and
 * the sequence diverges from Python's at the THIRD value. Python's ints are
 * arbitrary-precision, so it never sees this.
 */
function synthRgba(width: number, height: number): Uint8ClampedArray {
  const mul = BigInt(reference.lcg.mul);
  const add = BigInt(reference.lcg.add);
  const mod = BigInt(reference.lcg.mod);
  const rgba = new Uint8ClampedArray(width * height * 4);
  let state = BigInt(reference.lcg.seed);
  for (let i = 0, px = 0; px < width * height; px++) {
    for (let c = 0; c < 3; c++) {
      state = (mul * state + add) % mod;
      rgba[i++] = Number((state >> 16n) & 0xffn);
    }
    rgba[i++] = 255;
  }
  return rgba;
}

function readF16(path: string): Float32Array {
  const buf = readFileSync(path);
  const out = new Float32Array(buf.length / 2);
  for (let i = 0; i < out.length; i++) {
    const h = buf.readUInt16LE(i * 2);
    const sign = h & 0x8000 ? -1 : 1;
    const exp = (h & 0x7c00) >> 10;
    const frac = h & 0x03ff;
    if (exp === 0) out[i] = sign * 2 ** -14 * (frac / 1024);
    else if (exp === 0x1f) out[i] = frac ? NaN : sign * Infinity;
    else out[i] = sign * 2 ** (exp - 15) * (1 + frac / 1024);
  }
  return out;
}

describe('resizeTarget', () => {
  // torchvision Resize(224) scales the SHORTEST side to 224 and truncates the
  // other. Getting this backwards would crop the wrong region entirely.
  it('scales the shortest side to 224', () => {
    expect(resizeTarget(500, 333)).toEqual({ width: 336, height: 224 });
    expect(resizeTarget(281, 500)).toEqual({ width: 224, height: 398 });
    expect(resizeTarget(500, 500)).toEqual({ width: 224, height: 224 });
  });

  it('upscales when the shortest side is below 224', () => {
    expect(resizeTarget(100, 140)).toEqual({ width: 224, height: 313 });
  });
});

describe('preprocessToTensor matches open_clip', () => {
  it('uses the checkpoint normalisation constants', () => {
    // Asserted Python-side too (`_describe_preprocess` in bioclip_spike.py).
    // If a future checkpoint differs, both must move together.
    expect(CLIP_MEAN).toEqual([0.48145466, 0.4578275, 0.40821073]);
    expect(CLIP_STD).toEqual([0.26862954, 0.26130258, 0.27577711]);
  });

  it.each(reference.cases)(
    'reproduces the reference tensor for $width x $height',
    ({ width, height, reference: refFile }) => {
      const got = preprocessToTensor({
        width,
        height,
        data: synthRgba(width, height),
      });
      const want = readF16(join(FIXTURES, refFile));

      expect(got.length).toBe(3 * TARGET_SIZE * TARGET_SIZE);
      expect(got.length).toBe(want.length);

      let maxAbs = 0;
      let differing = 0;
      for (let i = 0; i < got.length; i++) {
        const d = Math.abs(got[i] - want[i]);
        if (d > maxAbs) maxAbs = d;
        if (d > 1e-3) differing++;
      }

      // Tolerances are measured, not guessed. Pillow's 8-bit resample path uses
      // fixed-point integer weights; this port uses float64, so a handful of
      // pixels land one uint8 level (~0.015 in normalised space) apart. The
      // reference is also stored as float16, which contributes similarly.
      //
      // These bounds are tight enough to catch a real algorithm regression: the
      // round-half-to-even crop-offset bug this test was written against
      // produced maxAbs 1.79 and 30% of pixels differing.
      expect(maxAbs).toBeLessThan(0.05);
      expect(differing / got.length).toBeLessThan(0.02);
    }
  );

  it('rejects an empty image rather than emitting a garbage tensor', () => {
    expect(() =>
      preprocessToTensor({ width: 0, height: 0, data: new Uint8ClampedArray() })
    ).toThrow();
  });

  // The crop offset is where the one bug this test caught actually lived.
  // 219x500 resizes to 224x511, so the offset is (511-224)/2 = 143.5, and
  // Python's round-half-to-even gives 144 where Math.floor gives 143. Every
  // other tested size agrees between the two, so without this case the bug
  // would have shipped.
  it('covers the crop offset that distinguishes floor from round-half-to-even', () => {
    const sizes = reference.cases.map(c => `${c.width}x${c.height}`);
    expect(sizes).toContain('219x500');

    const { height } = resizeTarget(219, 500);
    expect(height).toBe(511);
    expect((height - TARGET_SIZE) / 2).toBe(143.5);
  });
});

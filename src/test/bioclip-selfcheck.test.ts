import { describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  SELFCHECK_MIN_COSINE,
  selfCheckInput,
} from '@/lib/bioclip/selfCheck';
import {
  SELFCHECK_EMBEDDING_BASE64,
  SELFCHECK_MODEL_VARIANT,
} from '@/data/bioclip-selfcheck';

/**
 * The self-check is what stands between a GPU that returns garbage and a user
 * reading species names computed from noise. Its own correctness therefore has
 * to be pinned, and the load-bearing part is that the synthetic input is
 * bit-identical to the one Python used to produce the reference embedding. If
 * the two inputs drift, every device fails the check and the feature bricks
 * itself — a false alarm here is as damaging as a missed one.
 *
 * Reference values come from:
 *   python -c "from bioclip_export import _selfcheck_input; ..."
 */

describe('selfCheckInput', () => {
  it('has the model input length', () => {
    expect(selfCheckInput()).toHaveLength(3 * 224 * 224);
  });

  // Straight from Python. Exact equality, not closeness: both sides do integer
  // arithmetic then one IEEE-754 double divide, so any difference means the
  // recipes have genuinely diverged rather than rounded differently.
  it('matches Python element for element at the start', () => {
    const input = selfCheckInput();
    const expected = [
      -1.0, -0.9372549057006836, -0.8745098114013672, -0.8117647171020508,
      -0.7490196228027344, -0.686274528503418, -0.6235294342041016,
      -0.5607843399047852,
    ];
    expected.forEach((value, i) => expect(input[i]).toBe(value));
  });

  it('matches Python at the end and in the middle', () => {
    const input = selfCheckInput();
    const n = input.length;
    expect(input[n - 3]).toBe(0.686274528503418);
    expect(input[n - 2]).toBe(0.7490196228027344);
    expect(input[n - 1]).toBe(0.8117647171020508);
    // A midpoint sample catches a divergence that only appears once the
    // modular arithmetic has wrapped many times.
    expect(input[100000]).toBeCloseTo(0.631372571, 9);
  });

  // A whole-array checksum. The spot checks above would pass even if a block in
  // the middle were wrong; this would not.
  it('matches the Python sum over every element', () => {
    const input = selfCheckInput();
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i];
    expect(sum).toBeCloseTo(-1795.694135, 3);
  });

  it('stays inside the normalised input range', () => {
    const input = selfCheckInput();
    for (let i = 0; i < input.length; i++) {
      expect(input[i]).toBeGreaterThanOrEqual(-1);
      expect(input[i]).toBeLessThanOrEqual(1);
    }
  });
});

describe('reference embedding', () => {
  it('decodes to a unit-norm vector of the model dimension', () => {
    const binary = atob(SELFCHECK_EMBEDDING_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const reference = new Float32Array(bytes.buffer);

    expect(reference).toHaveLength(768);
    // The graph bakes in L2 normalisation. A non-unit reference would mean the
    // artifact changed and this file was not regenerated.
    const norm = Math.sqrt(reference.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1, 4);
  });

  it('is generated from the variant served to WebGPU devices', () => {
    expect(SELFCHECK_MODEL_VARIANT).toBe('int4');
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    const a = new Float32Array([0.1, 0.2, 0.3]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 6);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(
      cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))
    ).toBeCloseTo(0, 6);
  });

  it('is scale invariant, so a differently scaled embedding still passes', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([2, 4, 6]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
  });

  // Guards the real failure shape: a backend returning zeros must score 0 and
  // therefore fail the gate, not divide by zero and yield NaN — NaN >= threshold
  // is false, but relying on that is accidental rather than intended.
  it('returns 0 rather than NaN for an all-zero embedding', () => {
    const zeros = new Float32Array(3);
    const a = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, zeros)).toBe(0);
    expect(cosineSimilarity(a, zeros)).toBeLessThan(SELFCHECK_MIN_COSINE);
  });

  it('returns 0 on a length mismatch instead of comparing partially', () => {
    expect(
      cosineSimilarity(new Float32Array([1, 2]), new Float32Array([1, 2, 3]))
    ).toBe(0);
  });

  // The threshold must sit in the empty band between GPU rounding drift and a
  // broken kernel. Too low and garbage passes; too high and ordinary fp
  // accumulation differences brick every device.
  it('sets a threshold that admits drift but rejects noise', () => {
    expect(SELFCHECK_MIN_COSINE).toBeGreaterThan(0.9);
    expect(SELFCHECK_MIN_COSINE).toBeLessThan(0.999);
  });
});

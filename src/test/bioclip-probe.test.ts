import { describe, expect, it } from 'vitest';
import {
  PROBE_MIN_COSINE,
  probeInput,
  probeReference,
} from '@/lib/bioclip/variant';
import { PROBE_K, PROBE_M } from '@/data/bioclip-probe';

/**
 * The probe decides which artifact a device downloads, so a wrong probe either
 * hands a broken GPU the 4-bit model (the bug this exists to prevent) or sends
 * every device to the 307MB one for no reason.
 *
 * As with the session self-check, the load-bearing property is that the input is
 * bit-identical to Python's `_probe_input` — a drift there makes every device
 * fail the comparison at once and quietly downgrades the whole user base.
 *
 * Reference values from:
 *   python -c "from bioclip_export import _probe_input; ..."
 */

describe('probeInput', () => {
  it('has the probe input length', () => {
    expect(probeInput()).toHaveLength(PROBE_M * PROBE_K);
    expect(PROBE_M * PROBE_K).toBe(8192);
  });

  it('matches Python element for element at the start', () => {
    const input = probeInput();
    const expected = [
      -1.0, -0.9372549057006836, -0.8745098114013672, -0.8117647171020508,
      -0.7490196228027344,
    ];
    expected.forEach((value, i) => expect(input[i]).toBe(value));
  });

  it('matches Python at the end', () => {
    const input = probeInput();
    expect(input[input.length - 2]).toBe(-0.2549019753932953);
    expect(input[input.length - 1]).toBe(-0.1921568661928177);
  });

  // Whole-array checksum: the spot checks above would still pass if a block in
  // the middle diverged.
  it('matches the Python sum over every element', () => {
    const input = probeInput();
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i];
    expect(sum).toBeCloseTo(-104.650982, 3);
  });
});

describe('probeReference', () => {
  it('decodes to the expected output shape', () => {
    // M x N, with N = 64 from the generator.
    expect(probeReference()).toHaveLength(PROBE_M * 64);
  });

  // A constant or all-zero reference would make the cosine comparison pass for
  // any backend at all, including one returning zeros — the exact failure this
  // is meant to catch. The generator asserts this too; asserted here so the
  // shipped artifact is checked, not just the moment it was produced.
  it('is not degenerate', () => {
    const reference = probeReference();
    let max = 0;
    let sum = 0;
    for (let i = 0; i < reference.length; i++) {
      max = Math.max(max, Math.abs(reference[i]));
      sum += reference[i];
    }
    const mean = sum / reference.length;
    let variance = 0;
    for (let i = 0; i < reference.length; i++) {
      variance += (reference[i] - mean) ** 2;
    }
    variance /= reference.length;

    expect(max).toBeGreaterThan(1e-6);
    expect(Math.sqrt(variance)).toBeGreaterThan(1e-6);
  });

  it('contains no NaN or Infinity', () => {
    const reference = probeReference();
    for (let i = 0; i < reference.length; i++) {
      expect(Number.isFinite(reference[i])).toBe(true);
    }
  });
});

describe('PROBE_MIN_COSINE', () => {
  // Must sit in the empty band between fp accumulation drift (0.999+) and a
  // broken kernel (near zero). Too high downgrades every device to 307MB.
  it('admits drift but rejects noise', () => {
    expect(PROBE_MIN_COSINE).toBeGreaterThan(0.9);
    expect(PROBE_MIN_COSINE).toBeLessThan(0.999);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BIOCLIP_EMBEDDING_DIM, BIOCLIP_LABELS } from '@/data/bioclip-labels';
import {
  averageEmbeddings,
  decodeFloat16,
  loadTextMatrix,
  rankPredictions,
  resetTextMatrix,
} from '@/lib/bioclip/classify';
import { resetTier2Vocabulary } from '@/lib/photo-id';

/**
 * The label matrix and the labels file are joined by ROW INDEX. A drift there
 * pairs every photo with the wrong species name, silently — a toxic species
 * could be presented under an edible name with nothing thrown anywhere. That is
 * the failure these tests exist for.
 */

beforeEach(() => {
  resetTextMatrix();
  resetTier2Vocabulary();
});

/** Build a matrix whose row `i` is a unit vector pointing at dimension `i`. */
function identityishMatrix(labelCount: number, dim: number): Float32Array {
  const m = new Float32Array(labelCount * dim);
  for (let row = 0; row < labelCount; row++) {
    m[row * dim + (row % dim)] = 1;
  }
  return m;
}

function unitVector(dim: number, at: number): Float32Array {
  const v = new Float32Array(dim);
  v[at] = 1;
  return v;
}

describe('decodeFloat16', () => {
  it('decodes the values Python wrote', () => {
    // Known half-float bit patterns, little-endian.
    const buf = new ArrayBuffer(10);
    const view = new DataView(buf);
    view.setUint16(0, 0x0000, true); // +0
    view.setUint16(2, 0x3c00, true); // 1
    view.setUint16(4, 0xbc00, true); // -1
    view.setUint16(6, 0x3555, true); // ~0.333
    view.setUint16(8, 0x7c00, true); // +Infinity

    const out = decodeFloat16(buf);

    expect(out[0]).toBe(0);
    expect(out[1]).toBe(1);
    expect(out[2]).toBe(-1);
    expect(out[3]).toBeCloseTo(0.3333, 3);
    expect(out[4]).toBe(Infinity);
  });

  it('decodes subnormals rather than flushing them to zero', () => {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setUint16(0, 0x0001, true); // smallest positive subnormal
    expect(decodeFloat16(buf)[0]).toBeGreaterThan(0);
  });
});

describe('loadTextMatrix', () => {
  // THE guard. A matrix of the wrong length means the row/label join is broken,
  // and every prediction is mislabelled with nothing to signal it.
  it('refuses a matrix whose length does not match the labels file', async () => {
    const wrongSize = new ArrayBuffer(BIOCLIP_EMBEDDING_DIM * 2 * 4); // 4 rows
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(wrongSize, { status: 200 })
      ) as unknown as typeof fetch;

    await expect(loadTextMatrix(fetchImpl)).rejects.toThrow(
      /expected .*labels x/
    );
  });

  it('accepts a matrix of exactly the right length', async () => {
    const bytes = new ArrayBuffer(
      BIOCLIP_LABELS.length * BIOCLIP_EMBEDDING_DIM * 2
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(bytes, { status: 200 })
      ) as unknown as typeof fetch;

    const matrix = await loadTextMatrix(fetchImpl);

    expect(matrix.length).toBe(BIOCLIP_LABELS.length * BIOCLIP_EMBEDDING_DIM);
  });

  it('surfaces a failed fetch instead of returning an empty matrix', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 404 })
      ) as unknown as typeof fetch;

    await expect(loadTextMatrix(fetchImpl)).rejects.toThrow(/404/);
  });

  it('registers the tier-2 vocabulary so those names are not "unknown"', async () => {
    const bytes = new ArrayBuffer(
      BIOCLIP_LABELS.length * BIOCLIP_EMBEDDING_DIM * 2
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(bytes, { status: 200 })
      ) as unknown as typeof fetch;

    await loadTextMatrix(fetchImpl);

    const { resolvePrediction } = await import('@/lib/photo-id');
    const tier2 = BIOCLIP_LABELS.find(l => l.kind === 'other');
    expect(tier2).toBeDefined();
    expect(
      resolvePrediction({ scientificName: tier2!.scientificName, score: 1 })
        .kind
    ).toBe('other');
  });
});

describe('rankPredictions', () => {
  const dim = BIOCLIP_EMBEDDING_DIM;

  it('ranks the label whose row matches the embedding first', () => {
    const matrix = identityishMatrix(BIOCLIP_LABELS.length, dim);
    // Row 5 points at dimension 5, so an embedding at dimension 5 must win.
    const got = rankPredictions(unitVector(dim, 5), matrix, 3);

    expect(got[0].scientificName).toBe(BIOCLIP_LABELS[5].scientificName);
  });

  it('returns exactly topK predictions in descending score order', () => {
    const matrix = identityishMatrix(BIOCLIP_LABELS.length, dim);
    const got = rankPredictions(unitVector(dim, 0), matrix, 3);

    expect(got).toHaveLength(3);
    expect(got[0].score).toBeGreaterThanOrEqual(got[1].score);
    expect(got[1].score).toBeGreaterThanOrEqual(got[2].score);
  });

  it('produces confidences in 0..1', () => {
    const matrix = identityishMatrix(BIOCLIP_LABELS.length, dim);
    const got = rankPredictions(unitVector(dim, 3), matrix, 5);

    for (const p of got) {
      expect(p.score).toBeGreaterThan(0);
      expect(p.score).toBeLessThanOrEqual(1);
    }
  });

  // Softmax must normalise over ALL labels. Normalising over the truncated top-k
  // would inflate every confidence the user sees — a systematic overstatement of
  // certainty in a safety context.
  //
  // Needs a GRADED matrix, not the orthogonal one: with a 100x logit scale, any
  // score gap above ~0.1 saturates softmax to 1.0 and the distinction between
  // full and truncated normalisation disappears. Scores are spaced 0.001 apart
  // here so the distribution stays non-degenerate.
  it('normalises over the whole label set, not just topK', () => {
    const graded = new Float32Array(BIOCLIP_LABELS.length * dim);
    for (let row = 0; row < BIOCLIP_LABELS.length; row++) {
      graded[row * dim] = 1 - row * 0.001;
    }
    const query = unitVector(dim, 0);

    const three = rankPredictions(query, graded, 3);
    const twenty = rankPredictions(query, graded, 20);

    // Same label, same confidence, regardless of how many are returned.
    expect(three[0].scientificName).toBe(twenty[0].scientificName);
    expect(three[0].score).toBeCloseTo(twenty[0].score, 12);

    // Truncated softmax would force the returned rows to sum to 1.
    const sumOfThree = three.reduce((s, p) => s + p.score, 0);
    expect(sumOfThree).toBeLessThan(0.99);
    expect(sumOfThree).toBeGreaterThan(0);
  });

  it('rejects an embedding of the wrong dimension', () => {
    const matrix = identityishMatrix(BIOCLIP_LABELS.length, dim);

    expect(() => rankPredictions(new Float32Array(10), matrix, 3)).toThrow(
      /expected/
    );
  });
});

describe('averageEmbeddings', () => {
  const dim = BIOCLIP_EMBEDDING_DIM;

  // The whole point is that the result can be scored against the label matrix.
  // The mean of two unit vectors is SHORTER than one, so skipping the renormalise
  // would scale every similarity down and flatten the softmax - the confidences a
  // user reads would be wrong in a way nothing throws on.
  it('returns a unit vector', () => {
    const combined = averageEmbeddings([
      unitVector(dim, 0),
      unitVector(dim, 1),
    ]);

    let norm = 0;
    for (const v of combined) norm += v * v;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 6);
  });

  it('points between its inputs', () => {
    const combined = averageEmbeddings([
      unitVector(dim, 0),
      unitVector(dim, 1),
    ]);

    // Equal contribution from both photos, at 1/sqrt(2) each.
    expect(combined[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(combined[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(combined[2]).toBe(0);
  });

  it('leaves a single embedding alone', () => {
    const one = unitVector(dim, 5);

    expect(Array.from(averageEmbeddings([one]))).toEqual(Array.from(one));
  });

  // A shorter embedding would average as implicit zeros and quietly rotate the
  // result toward the low dimensions - a wrong ranking with no error anywhere.
  it('rejects a mismatched dimension', () => {
    expect(() =>
      averageEmbeddings([unitVector(dim, 0), new Float32Array(10)])
    ).toThrow(/expected/);
  });

  it('refuses to score a zero vector', () => {
    const opposite = new Float32Array(dim);
    opposite[0] = -1;

    // Every label would tie, and an arbitrary top 3 would be presented as a
    // ranking.
    expect(() => averageEmbeddings([unitVector(dim, 0), opposite])).toThrow(
      /zero length/
    );
  });

  it('rejects an empty list', () => {
    expect(() => averageEmbeddings([])).toThrow();
  });
});

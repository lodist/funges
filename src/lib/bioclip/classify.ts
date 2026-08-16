import { BIOCLIP_EMBEDDING_DIM, BIOCLIP_LABELS } from '@/data/bioclip-labels';
import textMatrixUrl from '@/assets/bioclip_text_embeddings.f16.bin?url';
import { registerTier2Vocabulary, type Prediction } from '@/lib/photo-id';

/**
 * Turns an image embedding into ranked species predictions.
 *
 * The label side is precomputed: `bioclip_text_embeddings.f16.bin` holds one
 * L2-normalised row per label, index-aligned with `BIOCLIP_LABELS`. So the text
 * tower never ships, and classification is a matrix multiply.
 *
 * Scoring deliberately mirrors `_predictions` in backend/tools/bioclip_spike.py,
 * including the 100x logit scale before softmax. Diverging here would mean the
 * confidence a user sees is not the confidence the gate was measured against.
 */

/**
 * Imported as an asset, NOT served from public/, so Vite content-hashes the URL.
 *
 * This matters more than it looks. The matrix is cached CacheFirst for a year,
 * and at a stable filename (`/models/bioclip_text_embeddings.f16.bin`) adding a
 * single species would have served every existing user the OLD matrix against
 * the NEW labels file. The length guard below turns that into a thrown error
 * rather than silent mispairing — so the feature would have been dead for up to
 * a year instead of subtly wrong. A content hash makes new content a new URL, so
 * the stale copy is unreachable by construction.
 */

export const TEXT_MATRIX_URL = textMatrixUrl;

/** CLIP's logit scale. Same constant as the Python side. */
const LOGIT_SCALE = 100;

/**
 * Decode IEEE-754 half floats to float32.
 *
 * Hand-rolled because `Float16Array` and `DataView.getFloat16` are not available
 * across the browsers this PWA targets. Subnormals and infinities are handled
 * because a silently-wrong decode would corrupt whole label rows, and the
 * failure would look like the model being bad at those species.
 */
export function decodeFloat16(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const out = new Float32Array(buffer.byteLength / 2);
  for (let i = 0; i < out.length; i++) {
    const h = view.getUint16(i * 2, true);
    const sign = h & 0x8000 ? -1 : 1;
    const exponent = (h & 0x7c00) >> 10;
    const fraction = h & 0x03ff;
    if (exponent === 0) {
      out[i] = sign * 2 ** -14 * (fraction / 1024);
    } else if (exponent === 0x1f) {
      out[i] = fraction ? NaN : sign * Infinity;
    } else {
      out[i] = sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
    }
  }
  return out;
}

let textMatrix: Float32Array | null = null;

/**
 * Fetch and cache the label matrix. Idempotent; safe to call before every
 * identification.
 */
export async function loadTextMatrix(
  fetchImpl: typeof fetch = fetch
): Promise<Float32Array> {
  if (textMatrix) return textMatrix;

  const response = await fetchImpl(TEXT_MATRIX_URL);
  if (!response.ok) {
    throw new Error(`label matrix fetch failed: ${response.status}`);
  }
  const decoded = decodeFloat16(await response.arrayBuffer());

  // The matrix and the labels file are joined by ROW INDEX. If they ever drift,
  // every photo is paired with the wrong species name and nothing throws — so
  // refuse rather than serve confident nonsense.
  const expected = BIOCLIP_LABELS.length * BIOCLIP_EMBEDDING_DIM;
  if (decoded.length !== expected) {
    throw new Error(
      `label matrix is ${decoded.length} floats, expected ${expected} ` +
        `(${BIOCLIP_LABELS.length} labels x ${BIOCLIP_EMBEDDING_DIM}). ` +
        'Regenerate both with bioclip_export.py --stage text-matrix.'
    );
  }

  // Tier-2 names are only known from the generated labels file, so registering
  // here keeps the matcher's vocabulary in step with what the model can emit.
  registerTier2Vocabulary(
    BIOCLIP_LABELS.filter(l => l.kind === 'other').map(l => l.scientificName)
  );

  textMatrix = decoded;
  return textMatrix;
}

/** Test seam. */
export function resetTextMatrix(): void {
  textMatrix = null;
}

/**
 * Combine embeddings from several photos of one specimen into one.
 *
 * Mean, then renormalise. The renormalise is not optional: cosine similarity
 * depends only on direction, and the mean of unit vectors is shorter than one, so
 * without it every score would be scaled down and the softmax would flatten.
 *
 * Measured on the 333 iNaturalist test observations that have two or more photos,
 * paired so the only variable is how many were combined: two photos halved
 * false-edible@1 (1.35% -> 0.68%), took catalog top-1 from 79.5% to 85.4%, and
 * took "a toxic label is somewhere in the top 3" from 97.3% to 100%. A third
 * photo added ~1pp of top-1 and moved nothing else, so the second photo does
 * nearly all the work. Photos within one observation are not guaranteed to be
 * different angles, so that is a floor on what deliberate different views buy.
 */
export function averageEmbeddings(embeddings: Float32Array[]): Float32Array {
  const dim = BIOCLIP_EMBEDDING_DIM;
  if (embeddings.length === 0) {
    throw new Error('no embeddings to average');
  }

  const mean = new Float32Array(dim);
  for (const embedding of embeddings) {
    // A short embedding would otherwise average as implicit zeros and quietly
    // rotate the result toward the first dimensions.
    if (embedding.length !== dim) {
      throw new Error(
        `embedding is ${embedding.length} floats, expected ${dim}`
      );
    }
    for (let i = 0; i < dim; i++) mean[i] += embedding[i];
  }

  let norm = 0;
  for (let i = 0; i < dim; i++) norm += mean[i] * mean[i];
  norm = Math.sqrt(norm);
  // Only reachable if the inputs cancel out exactly. Scoring a zero vector gives
  // every label the same similarity, i.e. an arbitrary top 3 presented as a
  // ranking, so refuse instead.
  if (norm === 0) throw new Error('averaged embedding has zero length');

  for (let i = 0; i < dim; i++) mean[i] /= norm;
  return mean;
}

/**
 * Rank labels for one image embedding.
 *
 * `embedding` must be L2-normalised — the exported ONNX graph normalises its own
 * output, so this holds for anything coming out of the worker.
 */
export function rankPredictions(
  embedding: Float32Array,
  matrix: Float32Array,
  topK = 3
): Prediction[] {
  const dim = BIOCLIP_EMBEDDING_DIM;
  if (embedding.length !== dim) {
    throw new Error(`embedding is ${embedding.length} floats, expected ${dim}`);
  }

  const labelCount = BIOCLIP_LABELS.length;
  const scores = new Float32Array(labelCount);
  for (let row = 0; row < labelCount; row++) {
    let dot = 0;
    const base = row * dim;
    for (let i = 0; i < dim; i++) dot += matrix[base + i] * embedding[i];
    scores[row] = dot;
  }

  // Softmax over ALL labels, not just the top k — the probability of the best
  // label depends on the whole distribution, and normalising over a truncated
  // set would inflate every confidence shown to the user.
  let max = -Infinity;
  for (let i = 0; i < labelCount; i++) if (scores[i] > max) max = scores[i];
  let sum = 0;
  const exp = new Float64Array(labelCount);
  for (let i = 0; i < labelCount; i++) {
    exp[i] = Math.exp((scores[i] - max) * LOGIT_SCALE);
    sum += exp[i];
  }

  const order = Array.from({ length: labelCount }, (_, i) => i).sort(
    (a, b) => scores[b] - scores[a]
  );

  return order.slice(0, topK).map(index => ({
    scientificName: BIOCLIP_LABELS[index].scientificName,
    score: exp[index] / sum,
  }));
}

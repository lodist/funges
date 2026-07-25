import { BIOCLIP_EMBEDDING_DIM, BIOCLIP_LABELS } from '@/data/bioclip-labels';
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

/** Matches the `.bin` produced by `bioclip_export.py --stage text-matrix`. */
export const TEXT_MATRIX_URL = `${import.meta.env.BASE_URL}models/bioclip_text_embeddings.f16.bin`;

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

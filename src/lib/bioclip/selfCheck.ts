import {
  SELFCHECK_EMBEDDING_BASE64,
  SELFCHECK_MODEL_VARIANT,
} from '@/data/bioclip-selfcheck';
import { TARGET_SIZE } from './preprocess';
import type { BioclipSession } from './session';

/**
 * Verifies that the inference backend on THIS device returns correct numbers.
 *
 * Motivation, precisely: an Android phone ran the int4 artifact under
 * `engine: webgpu`, decoded a chanterelle photo correctly (sigma 61.3, thumbnail
 * visible), and produced Omphalotus illudens / Taxus baccata / Trametes aesculi
 * at 6/4/3% where desktop gave Cantharellus cibarius at 97%. ORT's WebGPU
 * MatMulNBits shader is simply wrong on that GPU.
 *
 * Nothing else in the app can detect that. A wrong embedding still yields a
 * plausible, confidently-formatted ranked list — and for a feature whose whole
 * purpose is flagging toxic look-alikes, silently ranking species from noise is
 * the most dangerous failure available. "Correct or refuse" is the only
 * acceptable behaviour, so this runs once per session and gates the feature.
 *
 * Cheap: one extra forward pass at session creation, not per photo.
 */

/**
 * Below this cosine the backend is not computing this model.
 *
 * fp32-vs-GPU accumulation differences land at 0.999+; a broken kernel lands
 * near zero. The threshold sits in the empty middle so it cannot false-positive
 * on ordinary numerical drift.
 */
export const SELFCHECK_MIN_COSINE = 0.99;

function referenceEmbedding(): Float32Array {
  const binary = atob(SELFCHECK_EMBEDDING_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/**
 * The same deterministic input `_selfcheck_input` builds in Python.
 *
 * Only small-integer arithmetic before one float divide, so the two languages
 * cannot disagree. An LCG would be the obvious choice and is a trap: the
 * multiplier exceeds 2^53 and JS silently diverges from Python.
 */
export function selfCheckInput(): Float32Array {
  const n = 3 * TARGET_SIZE * TARGET_SIZE;
  const input = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const raw = (((i % 251) * 7 + (i % 17)) % 256) / 255;
    input[i] = raw * 2 - 1;
  }
  return input;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

export interface SelfCheckResult {
  ok: boolean;
  cosine: number;
}

/**
 * Run the fixed input through `session` and compare against the baked reference.
 *
 * Only meaningful for the variant the reference was generated from; for any
 * other artifact it reports ok without measuring, because a mismatch would then
 * say nothing about the backend.
 */
export async function runSelfCheck(
  session: BioclipSession,
  variant: string
): Promise<SelfCheckResult> {
  if (variant !== SELFCHECK_MODEL_VARIANT) return { ok: true, cosine: 1 };

  const embedding = await session.embed(selfCheckInput(), [
    1,
    3,
    TARGET_SIZE,
    TARGET_SIZE,
  ]);
  const cosine = cosineSimilarity(embedding, referenceEmbedding());
  return { ok: cosine >= SELFCHECK_MIN_COSINE, cosine };
}

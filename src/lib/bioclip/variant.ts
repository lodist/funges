import { PROBE_K, PROBE_M, PROBE_OUTPUT_BASE64 } from '@/data/bioclip-probe';
import { cosineSimilarity } from './selfCheck';
import { BioclipSession } from './session';

/**
 * Which quantization of the image tower to fetch for this device.
 *
 * There is no single best artifact, which is why this file exists. Measured on
 * one machine, same worker code, median ms per photo:
 *
 *              WebGPU    WASM
 *   int8        3702     4876
 *   int4         768     6829
 *
 * int4 wins by 4.8x on WebGPU and loses by 40% on WASM. `MatMulInteger` (int8)
 * has no WebGPU kernel in onnxruntime-web at all, so the int8 graph runs its
 * matmuls on the CPU even when the session reports `webgpu` — that is why its
 * two columns are so close, and why the shipped int8 build measured 15-20s on a
 * phone. `MatMulNBits` (int4) does have a kernel, but its CPU kernel
 * dequantizes on the fly and loses to `MatMulInteger`.
 *
 * Both artifacts are inside the safety gate: at the 1058-label shipping
 * vocabulary both measure 1.06% false-edible@1 against fp32's 0.91%.
 */

const R2 = 'https://data.fung.es';

export type ModelVariant = 'int4' | 'int8';

export interface VariantSpec {
  variant: ModelVariant;
  /** Doubles as the IndexedDB cache key, so the two artifacts can never collide. */
  version: string;
  url: string;
  /** For UI copy before the download starts. The real size comes from the response. */
  approxBytes: number;
}

/**
 * Versions are per-variant rather than one shared version, so publishing int4
 * did not require re-uploading the already-published, already-verified int8
 * object to a new key. Bump a variant's version when its bytes change, and
 * publish under the new path — never overwrite, because the service worker
 * caches these CacheFirst for a year.
 */
export const MODEL_VARIANTS: Record<ModelVariant, VariantSpec> = {
  int4: {
    variant: 'int4',
    version: 'bioclip2-int4-2026-07',
    url: `${R2}/models/bioclip/bioclip2-int4-2026-07/image_tower_int4.onnx`,
    approxBytes: 280_000_000,
  },
  int8: {
    variant: 'int8',
    version: 'bioclip2-int8-2026-07',
    url: `${R2}/models/bioclip/bioclip2-int8-2026-07/image_tower_int8.onnx`,
    approxBytes: 307_000_000,
  },
};

export const VARIANT_BY_VERSION: Record<string, VariantSpec> =
  Object.fromEntries(
    Object.values(MODEL_VARIANTS).map(spec => [spec.version, spec])
  );

/**
 * A single MatMulNBits node with the real tower's inner dimension, ~40KB.
 *
 * NOT the old `tiny_matmul.onnx`: that is a plain MatMul, so it could only
 * answer "does a WebGPU session initialise", which was never the question. The
 * op that breaks is MatMulNBits, and a probe that never executes one cannot
 * detect a device that gets it wrong. That gap cost a 280MB download.
 */
const PROBE_URL = `${import.meta.env.BASE_URL}models/matmulnbits_probe.onnx`;

const UNTRUSTED_KEY = 'funges.bioclip.webgpuUntrusted';

/**
 * Record that this device's WebGPU backend returned wrong numbers for a variant.
 *
 * Set by the session self-check, read here. Without persisting it, a device with
 * a broken MatMulNBits shader would be handed int4 again on every future
 * download and fall back to the slow CPU path every session.
 */
export function markWebgpuUntrusted(variant: ModelVariant): void {
  try {
    localStorage.setItem(UNTRUSTED_KEY, variant);
  } catch {
    // Private-mode storage refusal is not worth failing over; the self-check
    // still protects correctness on every session, just without the shortcut.
  }
}

export function isWebgpuUntrusted(variant: ModelVariant): boolean {
  try {
    return localStorage.getItem(UNTRUSTED_KEY) === variant;
  } catch {
    return false;
  }
}

export interface VariantChoice {
  spec: VariantSpec;
  /** The provider the probe actually got: 'webgpu', 'wasm', or 'probe-failed'. */
  provider: string;
}

/**
 * Below this cosine the GPU is not computing MatMulNBits.
 *
 * Same reasoning as the session self-check: legitimate fp accumulation
 * differences land at 0.999+, a broken kernel lands near zero, so the threshold
 * sits in the empty band between them.
 */
export const PROBE_MIN_COSINE = 0.99;

/**
 * int4 is published, measured, and NOT offered. Deliberately.
 *
 * It is 4.8x faster on a GPU that computes MatMulNBits correctly (768ms vs
 * 3702ms, measured in a real browser). But of the two real devices tested, one
 * Android GPU returns garbage for it — and the probe below, which runs a
 * MatMulNBits node at K=1024/N=64/M=8, PASSED on that device. The real model
 * runs N up to 4096 and M=257, so the fault evidently lives in a code path
 * larger shapes reach and the probe does not.
 *
 * Enlarging the probe to those shapes costs ~1.5MB of bundled weights and is
 * still only a guess about which dimension matters. Until a probe exists that
 * demonstrably catches that device, offering int4 means some users download
 * 280MB and land on the slow CPU fallback — worse than never offering it.
 *
 * int8 is correct everywhere by construction: its matmuls have no WebGPU kernel
 * at all, so they run on the CPU on every device. 15-20s on a mid-range phone.
 *
 * To re-enable: set this true once the probe reproduces the failure. Everything
 * else — the artifact on R2, the selection, the cache keys, the self-check — is
 * already in place and tested.
 */
const INT4_ENABLED = false;

/**
 * The same integer-only recipe Python's `_probe_input` uses.
 *
 * Small integers before one IEEE-754 double divide, so the two languages cannot
 * disagree. An LCG is the trap here — its multiplier exceeds 2^53 and JS
 * silently diverges from Python.
 */
export function probeInput(): Float32Array {
  const n = PROBE_M * PROBE_K;
  const input = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    input[i] = ((((i % 251) * 7 + (i % 17)) % 256) / 255) * 2 - 1;
  }
  return input;
}

export function probeReference(): Float32Array {
  const binary = atob(PROBE_OUTPUT_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/**
 * Pick a variant by trying to build a real WebGPU session first.
 *
 * Deliberately not `navigator.gpu.requestAdapter()`: an adapter can exist while
 * ORT still fails to initialise its WebGPU backend (blocklisted drivers, missing
 * features). Choosing int4 on the strength of an adapter and then landing on the
 * WASM backend anyway is the single worst outcome available — 6829 ms, slower
 * than shipping nothing. So the probe runs the same code path as the real
 * session, through the same worker, and only the outcome decides.
 *
 * The probe then EXECUTES a MatMulNBits node and checks the numbers, rather than
 * stopping at "a session was created". An earlier version probed with a plain
 * MatMul and only checked initialisation, which is how an Android device with a
 * broken MatMulNBits shader was handed the 4-bit artifact and had to download
 * 280MB to discover it.
 *
 * The probe does not have to be perfectly representative to be safe: if a device
 * still slips through, the post-download session self-check refuses to show
 * results computed by a lying backend. The probe only saves bandwidth.
 */
export async function detectVariant(): Promise<VariantChoice> {
  // Short-circuits before fetching the probe or spinning up ORT, so the download
  // gate opens immediately instead of paying for a session init it cannot use.
  if (!INT4_ENABLED) {
    return { spec: MODEL_VARIANTS.int8, provider: 'wasm' };
  }
  // A device already caught returning wrong numbers for int4 gets int8 without
  // re-probing. Checked first because a GPU that fails the probe once will fail
  // it every time, and the probe costs a session init.
  if (isWebgpuUntrusted('int4')) {
    return { spec: MODEL_VARIANTS.int8, provider: 'wasm' };
  }
  let session: BioclipSession | null = null;
  try {
    const bytes = await (await fetch(PROBE_URL)).arrayBuffer();
    const created = await BioclipSession.create(bytes);
    session = created.session;

    // No WebGPU at all: int8 is the right artifact, since it is the faster of
    // the two on the CPU backend.
    if (created.info.provider !== 'webgpu') {
      return { spec: MODEL_VARIANTS.int8, provider: created.info.provider };
    }

    // WebGPU is present. Now the question that matters: does it compute
    // MatMulNBits correctly? Initialising and being correct are different
    // claims, and this device may be one where only the first is true.
    const output = await session.embed(probeInput(), [PROBE_M, PROBE_K]);
    const cosine = cosineSimilarity(output, probeReference());
    if (cosine < PROBE_MIN_COSINE) {
      markWebgpuUntrusted('int4');
      return { spec: MODEL_VARIANTS.int8, provider: 'wasm' };
    }
    return { spec: MODEL_VARIANTS.int4, provider: 'webgpu' };
  } catch {
    // A failed probe must not block the feature. int8 is the safe default: it is
    // the faster of the two on the WASM backend, which is where a device whose
    // probe just failed is most likely to end up.
    return { spec: MODEL_VARIANTS.int8, provider: 'probe-failed' };
  } finally {
    session?.dispose();
  }
}

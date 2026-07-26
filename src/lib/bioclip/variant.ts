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

const R2 = 'https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev';

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

/** 139 bytes, already in the repo for the e2e session smoke test. */
const PROBE_URL = `${import.meta.env.BASE_URL}models/tiny_matmul.onnx`;

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
 * Pick a variant by trying to build a real WebGPU session first.
 *
 * Deliberately not `navigator.gpu.requestAdapter()`: an adapter can exist while
 * ORT still fails to initialise its WebGPU backend (blocklisted drivers, missing
 * features). Choosing int4 on the strength of an adapter and then landing on the
 * WASM backend anyway is the single worst outcome available — 6829 ms, slower
 * than shipping nothing. So the probe runs the same code path as the real
 * session, through the same worker, and only the outcome decides.
 *
 * ponytail: the probe model is a plain MatMul, not a MatMulNBits. A device where
 * WebGPU MatMul works but WebGPU MatMulNBits does not would still be
 * mis-routed. Judged unlikely enough to not warrant a second artifact — the
 * kernel is present at the library level and is what on-device LLMs use. If it
 * ever bites, the upgrade is a ~200-byte probe model containing one MatMulNBits
 * node; `identify.provider` already surfaces the landed provider so the
 * mismatch is visible rather than silent.
 */
export async function detectVariant(): Promise<VariantChoice> {
  // A device already caught returning wrong numbers for int4 on its GPU gets
  // int8 instead, whose matmuls run on the CPU and so never touch the broken
  // kernel. Checked before the probe, because the probe would happily say
  // `webgpu` again — initialising is not the same as being correct.
  if (isWebgpuUntrusted('int4')) {
    return { spec: MODEL_VARIANTS.int8, provider: 'webgpu-untrusted' };
  }
  try {
    const bytes = await (await fetch(PROBE_URL)).arrayBuffer();
    const { session, info } = await BioclipSession.create(bytes);
    session.dispose();
    return {
      spec:
        info.provider === 'webgpu' ? MODEL_VARIANTS.int4 : MODEL_VARIANTS.int8,
      provider: info.provider,
    };
  } catch {
    // A failed probe must not block the feature. int8 is the safe default: it is
    // the faster of the two on the WASM backend, which is where a device whose
    // probe just failed is most likely to end up.
    return { spec: MODEL_VARIANTS.int8, provider: 'probe-failed' };
  }
}

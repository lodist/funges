/**
 * Reproduces open_clip's image preprocessing, faithfully enough that browser
 * embeddings match the Python ones the model was evaluated with.
 *
 * The pipeline is: resize the SHORTEST side to 224 with bicubic interpolation,
 * centre-crop 224x224, scale to 0..1, then normalise per channel.
 *
 * Why this is hand-written instead of using canvas `drawImage`:
 * `drawImage` downscaling is implementation-defined and is not Pillow's
 * antialiased bicubic. The two disagree by enough to shift embeddings, and
 * nothing would error — accuracy would just quietly drop. So this ports
 * Pillow's actual resample algorithm (`ImagingResample` in resample.c),
 * including the details that matter:
 *
 *   - the filter support is SCALED by the downscale factor (antialiasing);
 *     an unscaled 2px bicubic kernel aliases badly when shrinking 500px to 224
 *   - the two passes are separable, horizontal then vertical
 *   - the intermediate is rounded and clamped to uint8 between passes, because
 *     Pillow's 8-bit path does exactly that
 *
 * Verified against Python reference tensors by e2e/bioclip-parity.spec.ts.
 * Regenerate those with `bioclip_export.py --stage parity-fixtures`.
 */

export const TARGET_SIZE = 224;

/** open_clip / OpenAI CLIP normalisation. Asserted against the checkpoint by
 * `_describe_preprocess` in backend/tools/bioclip_spike.py — change both or
 * neither. */
export const CLIP_MEAN = [0.48145466, 0.4578275, 0.40821073] as const;
export const CLIP_STD = [0.26862954, 0.26130258, 0.27577711] as const;

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major — i.e. `CanvasRenderingContext2D.getImageData().data` */
  data: Uint8ClampedArray;
}

const BICUBIC_SUPPORT = 2.0;

/**
 * Pillow's bicubic kernel with a = -0.5 (Catmull-Rom).
 * Keep the constant at -0.5: OpenCV and some other libraries use -0.75, which
 * produces visibly different weights and would break parity.
 */
function bicubic(x: number): number {
  const a = -0.5;
  const t = Math.abs(x);
  if (t < 1.0) return ((a + 2.0) * t - (a + 3.0)) * t * t + 1.0;
  if (t < 2.0) return ((t - 5.0) * t + 8.0) * t * a - 4.0 * a;
  return 0.0;
}

interface Coeffs {
  /** For output index i: source range [starts[i], starts[i] + counts[i]). */
  starts: Int32Array;
  counts: Int32Array;
  /** Row-major weights, `maxCount` per output index. */
  weights: Float64Array;
  maxCount: number;
}

/**
 * Precompute filter taps for one axis, exactly as Pillow does.
 *
 * The `filterScale` term is the antialiasing: when shrinking, the kernel widens
 * in source space so every contributing source pixel is sampled, instead of
 * point-sampling a 2px neighbourhood and aliasing.
 */
function buildCoeffs(inSize: number, outSize: number): Coeffs {
  const scale = inSize / outSize;
  const filterScale = Math.max(1.0, scale);
  const support = BICUBIC_SUPPORT * filterScale;
  const maxCount = Math.ceil(support) * 2 + 1;

  const starts = new Int32Array(outSize);
  const counts = new Int32Array(outSize);
  const weights = new Float64Array(outSize * maxCount);

  for (let i = 0; i < outSize; i++) {
    const center = (i + 0.5) * scale;
    let start = Math.floor(center - support + 0.5);
    if (start < 0) start = 0;
    let end = Math.floor(center + support + 0.5);
    if (end > inSize) end = inSize;

    const count = end - start;
    starts[i] = start;
    counts[i] = count;

    let total = 0;
    const base = i * maxCount;
    for (let j = 0; j < count; j++) {
      const w = bicubic((start + j - center + 0.5) / filterScale);
      weights[base + j] = w;
      total += w;
    }
    // Pillow normalises the taps so each output pixel preserves brightness.
    if (total !== 0) {
      for (let j = 0; j < count; j++) weights[base + j] /= total;
    }
  }

  return { starts, counts, weights, maxCount };
}

/**
 * Round half to even, matching Python's built-in `round`.
 *
 * torchvision's CenterCrop computes its offset as `int(round((h - 224) / 2.0))`,
 * and Python rounds halves to the nearest EVEN integer — not up, and not down.
 * So 136.5 -> 136 but 143.5 -> 144.
 *
 * `Math.floor` agrees with this everywhere except when the remainder is exactly
 * .5 and the floor is odd, which is why only one fixture out of eight caught
 * this. The consequence there was a one-pixel crop shift and a cosine of 0.964
 * against the reference — a real accuracy loss with nothing to signal it.
 * `Math.round` would be wrong too: it always rounds .5 up, so it would break
 * the 136.5 case instead.
 */
function roundHalfToEven(v: number): number {
  const floor = Math.floor(v);
  const frac = v - floor;
  if (frac > 0.5) return floor + 1;
  if (frac < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Pillow clamps and rounds to uint8 between the two passes; so do we. */
function clamp8(v: number): number {
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return Math.round(v);
}

/**
 * Resize RGB (3 channels, interleaved) with Pillow-equivalent bicubic.
 * Separable: horizontal into a uint8 intermediate, then vertical.
 */
function resizeRgb(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8Array {
  const hc = buildCoeffs(srcW, dstW);
  const mid = new Uint8Array(dstW * srcH * 3);
  for (let y = 0; y < srcH; y++) {
    const srcRow = y * srcW * 3;
    const midRow = y * dstW * 3;
    for (let x = 0; x < dstW; x++) {
      const start = hc.starts[x];
      const count = hc.counts[x];
      const base = x * hc.maxCount;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < count; j++) {
        const w = hc.weights[base + j];
        const p = srcRow + (start + j) * 3;
        r += src[p] * w;
        g += src[p + 1] * w;
        b += src[p + 2] * w;
      }
      const o = midRow + x * 3;
      mid[o] = clamp8(r);
      mid[o + 1] = clamp8(g);
      mid[o + 2] = clamp8(b);
    }
  }

  const vc = buildCoeffs(srcH, dstH);
  const out = new Uint8Array(dstW * dstH * 3);
  for (let y = 0; y < dstH; y++) {
    const start = vc.starts[y];
    const count = vc.counts[y];
    const base = y * vc.maxCount;
    const outRow = y * dstW * 3;
    for (let x = 0; x < dstW; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < count; j++) {
        const w = vc.weights[base + j];
        const p = (start + j) * dstW * 3 + x * 3;
        r += mid[p] * w;
        g += mid[p + 1] * w;
        b += mid[p + 2] * w;
      }
      const o = outRow + x * 3;
      out[o] = clamp8(r);
      out[o + 1] = clamp8(g);
      out[o + 2] = clamp8(b);
    }
  }
  return out;
}

/**
 * Target size for `Resize(224)` on the SHORTEST side, matching torchvision:
 * the short side becomes exactly 224 and the long side is truncated (not
 * rounded) to preserve aspect ratio.
 */
export function resizeTarget(
  width: number,
  height: number,
  size = TARGET_SIZE
): { width: number; height: number } {
  if (width === height) return { width: size, height: size };
  if (width < height) {
    return { width: size, height: Math.trunc((size * height) / width) };
  }
  return { width: Math.trunc((size * width) / height), height: size };
}

/**
 * RGBA image -> normalised CHW Float32Array of length 3*224*224, ready to be
 * fed to the ONNX image tower as a (1, 3, 224, 224) tensor.
 */
export function preprocessToTensor(img: RgbaImage): Float32Array {
  const { width: srcW, height: srcH, data } = img;
  if (srcW === 0 || srcH === 0) {
    throw new Error(`cannot preprocess a ${srcW}x${srcH} image`);
  }

  // Drop alpha up front: open_clip converts to RGB before resizing, so any
  // resampling that mixed alpha in would diverge from the reference.
  const rgb = new Uint8Array(srcW * srcH * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }

  const target = resizeTarget(srcW, srcH);
  const resized = resizeRgb(rgb, srcW, srcH, target.width, target.height);

  // Centre crop, using torchvision's exact offset arithmetic:
  // int(round((size - 224) / 2.0)) with Python's round-half-to-even.
  const left = roundHalfToEven((target.width - TARGET_SIZE) / 2);
  const top = roundHalfToEven((target.height - TARGET_SIZE) / 2);

  const plane = TARGET_SIZE * TARGET_SIZE;
  const out = new Float32Array(plane * 3);
  for (let y = 0; y < TARGET_SIZE; y++) {
    const srcRow = (top + y) * target.width * 3;
    const dstRow = y * TARGET_SIZE;
    for (let x = 0; x < TARGET_SIZE; x++) {
      const p = srcRow + (left + x) * 3;
      const d = dstRow + x;
      out[d] = (resized[p] / 255 - CLIP_MEAN[0]) / CLIP_STD[0];
      out[plane + d] = (resized[p + 1] / 255 - CLIP_MEAN[1]) / CLIP_STD[1];
      out[2 * plane + d] = (resized[p + 2] / 255 - CLIP_MEAN[2]) / CLIP_STD[2];
    }
  }
  return out;
}

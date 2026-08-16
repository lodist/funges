import type { RgbaImage } from './preprocess';

/**
 * Turns a user-supplied photo into raw RGBA pixels for `preprocessToTensor`.
 *
 * Kept separate from the resampling code so the pixel maths stays testable
 * without a DOM, and so the browser-only parts (decode, canvas) are isolated in
 * one place.
 */

/** Cap on the long edge before preprocessing. */
export const MAX_LONG_EDGE = 1024;

/**
 * Below this standard deviation the decoded image carries no signal.
 *
 * A phone photo has a per-channel sigma in the tens; a blank canvas is exactly
 * 0. The gap is wide enough that any threshold in between works, so this is set
 * low deliberately — it exists to catch a failed decode, not to judge
 * low-contrast photographs.
 */
const MIN_PIXEL_STDDEV = 1.0;

export interface ImageStats {
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  mean: number;
  stddev: number;
}

export interface PreparedImage {
  rgba: RgbaImage;
  /** Object URL for the thumbnail shown beside results. Caller must revoke it. */
  previewUrl: string;
  stats: ImageStats;
}

export class BlankImageError extends Error {
  constructor(readonly stats: ImageStats) {
    super(
      `decoded image carries no signal (${stats.sourceWidth}x${stats.sourceHeight} ` +
        `-> ${stats.width}x${stats.height}, mean ${stats.mean.toFixed(1)}, ` +
        `stddev ${stats.stddev.toFixed(2)})`
    );
    this.name = 'BlankImageError';
  }
}

/**
 * Mean and standard deviation over the RGB channels, sampled.
 *
 * Sampled rather than exhaustive because this runs on every identification and
 * the point is only to distinguish "real photo" from "nothing decoded". Alpha is
 * skipped: a blank canvas is transparent black, so including alpha would make an
 * empty image look like it had variance.
 */
function pixelStats(data: Uint8ClampedArray): { mean: number; stddev: number } {
  // Stride over whole pixels (4 bytes) so the channel mix stays even.
  const pixels = data.length / 4;
  const step = Math.max(1, Math.floor(pixels / 4096));
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let p = 0; p < pixels; p += step) {
    const i = p * 4;
    for (let c = 0; c < 3; c++) {
      const v = data[i + c];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return { mean: 0, stddev: 0 };
  const mean = sum / n;
  // max(0, ...) because catastrophic cancellation can push this slightly
  // negative for a perfectly uniform image, and Math.sqrt would give NaN.
  const variance = Math.max(0, sumSq / n - mean * mean);
  return { mean, stddev: Math.sqrt(variance) };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve =>
    canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85)
  );
}

/**
 * Decode a photo, correcting orientation, and downscale it.
 *
 * `imageOrientation: 'from-image'` applies the EXIF rotation for free. Without
 * it, photos taken in portrait on a phone arrive rotated 90 degrees, and the
 * model would be classifying a sideways mushroom with no indication anything was
 * wrong. That is worth more than it looks: no dependency, one option.
 *
 * The downscale to a 1024px long edge is for memory and latency on a phone, not
 * accuracy — `preprocessToTensor` resizes to 224 anyway. Doing it here keeps a
 * 12-megapixel capture from being held as full-size RGBA (~48MB) alongside a
 * ~280MB model.
 *
 * Throws `BlankImageError` when the decode yielded no signal. That is not
 * defensive padding: an Android phone produced species rows with 6/5/3%
 * confidence for a photo whose thumbnail did not render, i.e. the model was
 * asked to classify pixels nobody had ever seen. Showing toxicity candidates for
 * an image the app failed to read is the worst failure this feature has.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });

  try {
    const scale = Math.min(
      1,
      MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height)
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('could not get a 2D canvas context');

    // Only used for the pre-224 downscale, where browser resampling is fine.
    // The accuracy-critical resize to 224 is done in preprocess.ts, which ports
    // Pillow's algorithm because canvas resampling does NOT match it.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const data = ctx.getImageData(0, 0, width, height);
    const { mean, stddev } = pixelStats(data.data);
    const stats: ImageStats = {
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
      width,
      height,
      mean,
      stddev,
    };

    if (stddev < MIN_PIXEL_STDDEV) throw new BlankImageError(stats);

    // The thumbnail comes from the DOWNSCALED canvas, not the original file.
    // `URL.createObjectURL(file)` hands the <img> the full-resolution capture,
    // which a phone browser can decline to render outright — that is why the
    // thumbnail was missing on Android while desktop was fine. A ~1024px JPEG
    // always renders, and it also proves the canvas holds what we think it does:
    // if the tensor is blank, so is the thumbnail.
    const previewBlob = await canvasToBlob(canvas);
    return {
      rgba: { width, height, data: data.data },
      previewUrl: URL.createObjectURL(previewBlob ?? file),
      stats,
    };
  } finally {
    bitmap.close();
  }
}

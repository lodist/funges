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

export interface PreparedImage {
  rgba: RgbaImage;
  /** Object URL for the thumbnail shown beside results. Caller must revoke it. */
  previewUrl: string;
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
 * 307MB model.
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
    return {
      rgba: { width, height, data: data.data },
      previewUrl: URL.createObjectURL(file),
    };
  } finally {
    bitmap.close();
  }
}

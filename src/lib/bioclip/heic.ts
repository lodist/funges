/**
 * HEIC/HEIF support for browsers whose native image decoder rejects the file.
 *
 * Kept behind a dynamic import because almost every photo reaches the native
 * decoder as JPEG/WebP. Those users should not initialise a codec they do not
 * need, while an HEIC photo must still stay on-device like every other input.
 */

const HEVC_HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
]);

const ascii = (bytes: Uint8Array, start: number) =>
  String.fromCharCode(...bytes.subarray(start, start + 4));

/**
 * Detect an HEVC-backed HEIF container from its ISO-BMFF `ftyp` brands.
 *
 * Do not depend on `File.type` or the extension: iOS/browser hand-offs often
 * leave the MIME type empty (the fixture from issue #189 does), and a renamed
 * file is not evidence that the bytes can be decoded. `mif1` by itself is also
 * insufficient because AVIF may use it as a compatible generic HEIF brand.
 */
export function isHeicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || ascii(bytes, 4) !== 'ftyp') return false;

  const boxSize = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  ).getUint32(0);
  const end = Math.min(bytes.length, boxSize || bytes.length);

  // Major brand at byte 8, then compatible brands from byte 16 onward.
  if (HEVC_HEIF_BRANDS.has(ascii(bytes, 8))) return true;
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    if (HEVC_HEIF_BRANDS.has(ascii(bytes, offset))) return true;
  }
  return false;
}

export async function isHeic(file: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 256).arrayBuffer());
  return isHeicBytes(bytes);
}

/** Decode the primary image in an HEIC/HEIF container to raw RGBA pixels. */
export async function decodeHeic(file: Blob): Promise<ImageData> {
  const [{ decode }, bytes] = await Promise.all([
    import('@discourse/heic'),
    file.arrayBuffer(),
  ]);
  return decode(bytes);
}

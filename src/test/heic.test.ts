import { describe, expect, it } from 'vitest';
import { isHeicBytes } from '@/lib/bioclip/heic';

function heifHeader(major: string, compatible: string[] = []): Uint8Array {
  const size = 16 + compatible.length * 4;
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, size);
  bytes.set(new TextEncoder().encode('ftyp'), 4);
  bytes.set(new TextEncoder().encode(major), 8);
  for (let i = 0; i < compatible.length; i++) {
    bytes.set(new TextEncoder().encode(compatible[i]), 16 + i * 4);
  }
  return bytes;
}

describe('isHeic', () => {
  it('recognises the HEIC major brand with no MIME type', () => {
    // Mirrors issue #189: Chrome reported `type: ""` for image1.heic.
    expect(isHeicBytes(heifHeader('heic', ['mif1', 'heic']))).toBe(true);
  });

  it('recognises an HEVC compatible brand', () => {
    expect(isHeicBytes(heifHeader('mif1', ['heix']))).toBe(true);
  });

  it('does not mistake a generic HEIF/AVIF brand for HEIC', () => {
    expect(isHeicBytes(heifHeader('avif', ['mif1']))).toBe(false);
  });

  it('rejects files without an ISO-BMFF file-type box', () => {
    expect(isHeicBytes(new Uint8Array(32))).toBe(false);
  });
});

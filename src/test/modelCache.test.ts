import { describe, expect, it, vi } from 'vitest';
import { readWithProgress } from '@/lib/modelCache';
import { MODEL_VARIANTS, VARIANT_BY_VERSION } from '@/lib/bioclip/variant';

/**
 * `readWithProgress` is the only non-trivial logic in modelCache, and at ~306MB
 * it is where a silent failure hurts most: a short read produces a corrupt ONNX
 * file, cached permanently, whose failure surfaces at session creation and looks
 * like a bad model rather than a bad download.
 *
 * The IndexedDB paths are not unit-tested — jsdom has no real IndexedDB, and
 * mocking it would test the mock. Those are exercised on a device via the
 * staging preview, which is also the only place the real 306MB behaviour
 * (memory pressure, iOS Safari quotas) can be observed at all.
 */

function streamResponse(
  chunks: Uint8Array[],
  contentLength: number | null
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(c => controller.enqueue(c));
      controller.close();
    },
  });
  const headers = new Headers();
  if (contentLength !== null) {
    headers.set('content-length', String(contentLength));
  }
  return new Response(stream, { headers });
}

const bytes = (...values: number[]) => new Uint8Array(values);

describe('readWithProgress', () => {
  it('assembles the streamed chunks into a complete blob', async () => {
    const blob = await readWithProgress(
      streamResponse([bytes(1, 2, 3), bytes(4, 5), bytes(6)], 6)
    );

    // Total length only. Reading the bytes back is not asserted because jsdom's
    // Blob does not round-trip faithfully (no arrayBuffer(), and reading via
    // Response yields 13 bytes for a blob whose size is correctly 6) — the test
    // would be measuring jsdom, not this code.
    //
    // Byte order needs no test regardless: chunks are pushed in read order and
    // `new Blob(parts)` concatenates in order by specification. There is no
    // index arithmetic or reordering here to get wrong. The failure modes that
    // ARE this code's responsibility — truncation and progress — are covered
    // below, and end-to-end integrity is proven on a device by whether ORT can
    // actually load the cached artifact.
    expect(blob.size).toBe(6);
  });

  it('reports monotonic progress that ends at exactly 1', async () => {
    const seen: Array<number | null> = [];
    await readWithProgress(
      streamResponse([bytes(1, 2, 3, 4), bytes(5, 6), bytes(7, 8, 9, 10)], 10),
      p => seen.push(p.fraction)
    );

    expect(seen).toEqual([0.4, 0.6, 1]);
    // A progress bar that goes backwards reads as a stall or a bug.
    const numeric = seen as number[];
    expect(numeric.every((v, i) => i === 0 || v >= numeric[i - 1])).toBe(true);
  });

  it('reports byte counts alongside the fraction', async () => {
    const seen: Array<{ receivedBytes: number; totalBytes: number | null }> =
      [];
    await readWithProgress(streamResponse([bytes(1, 2), bytes(3)], 3), p =>
      seen.push({ receivedBytes: p.receivedBytes, totalBytes: p.totalBytes })
    );

    expect(seen).toEqual([
      { receivedBytes: 2, totalBytes: 3 },
      { receivedBytes: 3, totalBytes: 3 },
    ]);
  });

  // THE important one. Without this check a truncated download is cached as a
  // corrupt model and every later session-creation attempt fails, pointing at
  // the wrong culprit.
  it('throws when the stream ends short of Content-Length', async () => {
    await expect(
      readWithProgress(streamResponse([bytes(1, 2, 3)], 10))
    ).rejects.toThrow(/truncated: got 3 of 10/);
  });

  it('throws when the stream delivers more than Content-Length', async () => {
    await expect(
      readWithProgress(streamResponse([bytes(1, 2, 3, 4, 5)], 3))
    ).rejects.toThrow(/truncated: got 5 of 3/);
  });

  it('still succeeds when the server sends no Content-Length', async () => {
    const seen: Array<number | null> = [];
    const blob = await readWithProgress(
      streamResponse([bytes(1, 2), bytes(3)], null),
      p => seen.push(p.fraction)
    );

    // Cannot verify completeness without a declared length, so it must not
    // invent one — but it must also not refuse the download.
    expect(blob.size).toBe(3);
    expect(seen).toEqual([null, null]);
  });

  it('falls back to a single read when the body is not streamable', async () => {
    const onProgress = vi.fn();
    const response = new Response('abcd', {
      headers: { 'content-length': '4' },
    });
    Object.defineProperty(response, 'body', { value: null });

    const blob = await readWithProgress(response, onProgress);

    expect(blob.size).toBe(4);
    expect(onProgress).toHaveBeenCalledWith({
      receivedBytes: 4,
      totalBytes: 4,
      fraction: 1,
    });
  });
});

describe('model variants', () => {
  const specs = Object.values(MODEL_VARIANTS);

  // The service worker caches these CacheFirst with a ~1 year TTL. At a stable
  // URL, anyone who already downloaded would keep the old model forever with
  // nothing to signal it, so the version MUST appear in the path.
  it.each(specs)('$variant carries its version in the path', spec => {
    expect(spec.url).toContain(spec.version);
    expect(spec.url).toMatch(/\/models\/bioclip\/[^/]+\/.+\.onnx$/);
  });

  it.each(specs)('$variant points at the R2 bucket over https', spec => {
    expect(spec.url.startsWith('https://')).toBe(true);
  });

  // The version doubles as the IndexedDB primary key. Two variants sharing one
  // would have the second download silently overwrite the first, and a device
  // could then run int4 bytes while believing it holds int8.
  it('gives every variant a distinct version key', () => {
    const versions = specs.map(s => s.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  // Each variant's URL must name its own quantization. A copy-paste that left
  // int4 pointing at the int8 object would serve the slow artifact to exactly
  // the devices the fast one was built for, with no error anywhere.
  it.each(specs)('$variant url names its own quantization', spec => {
    expect(spec.url).toContain(`image_tower_${spec.variant}.onnx`);
  });

  it('maps every version back to its spec', () => {
    for (const spec of specs) {
      expect(VARIANT_BY_VERSION[spec.version]).toBe(spec);
    }
  });
});

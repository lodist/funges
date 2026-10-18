/// <reference lib="webworker" />
// The `webgpu` entry, not the package root. The root still loads the JSEP build,
// whose WebGPU kernels ORT deprecated in 1.29; this entry runs ORT's native
// WebGPU engine, which is where MatMulNBits fixes land and which runs int4 about
// twice as fast as JSEP did on the same GPU (0.3-0.4s vs 0.7-0.8s per photo).
import * as ort from 'onnxruntime-web/webgpu';
// Let Vite own the runtime URLs via `?url` asset imports rather than copying the
// files into public/ ourselves.
//
// The obvious approach — copy them to public/ort/ and set a path prefix — fails
// in dev: ORT loads the glue with a dynamic import(), Vite appends `?import` to
// it, tries to transform an Emscripten CommonJS-ish file, and 500s with
// "require is not defined". The symptom surfaces as ORT's opaque
// "no available backend found", several layers from the cause.
//
// `?url` sidesteps that (Vite emits them as assets and hands back real URLs,
// correct in both dev and build), removes ~80MB from the build output, and
// removes a version-numbered directory that could silently drift from the
// installed ORT.
//
// The asyncify build is used for BOTH execution providers: it carries the native
// WebGPU engine and still runs the wasm EP — at the same CPU speed as the plain
// build, measured — so one 26.8MB pair covers both paths instead of shipping two.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';

/**
 * Owns the ONNX inference session for photo identification.
 *
 * Runs in a worker because a ViT forward pass takes long enough to visibly jank
 * the UI on the main thread. ORT's own `env.wasm.proxy` offload is not an option
 * here: it only covers the WASM backend, because a WebGPU GPU buffer is not
 * structure-clone-transferable. So both execution providers live in this one
 * worker instead of two divergent code paths.
 */

export type WorkerRequest =
  | { type: 'init'; modelBytes: ArrayBuffer; forceWasm?: boolean }
  | { type: 'infer'; requestId: number; tensor: Float32Array; dims: number[] }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'ready'; provider: string; inputName: string; outputName: string }
  | { type: 'result'; requestId: number; embedding: Float32Array }
  | { type: 'error'; requestId?: number; message: string };

let session: ort.InferenceSession | null = null;
let inputName = '';
let outputName = '';

function post(msg: WorkerResponse, transfer?: Transferable[]) {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
}

/**
 * ORT's glue module, as a blob URL built once.
 *
 * ORT starts its CPU threads as workers from the glue's own URL. In the
 * cross-origin-isolated /identify page a worker started from a URL needs COEP
 * on that asset's response, and only the page carries the headers — the
 * thread workers came back ERR_BLOCKED_BY_RESPONSE. Started from a blob, they
 * inherit the isolation the way this worker does.
 */
let glue: Promise<string> | null = null;
function glueBlobUrl(absolute: string): Promise<string> {
  glue ??= fetch(absolute)
    .then(response => {
      if (!response.ok) throw new Error(`ORT glue: HTTP ${response.status}`);
      return response.text();
    })
    .then(source =>
      URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    )
    .catch(err => {
      // Not cached, so the next session retries instead of inheriting it.
      glue = null;
      throw err;
    });
  return glue;
}

/**
 * Create a session, preferring WebGPU and falling back to WASM.
 *
 * The thread count is left to ORT: one thread unless the page is
 * cross-origin isolated (COOP/COEP headers, which Cloudflare adds in front of
 * GitHub Pages), then half the cores, at most 4. On a Snapdragon 778G phone
 * (4 big + 4 little cores) that is 4, and 4 measured fastest: int8 went from
 * 13 s per photo to 4.1-4.9 s, while 6 threads spilled onto the little cores
 * and lost (8-11 s). Same embedding at every thread count.
 */
async function createSession(
  modelBytes: ArrayBuffer,
  forceWasm = false
): Promise<string> {
  // Explicit per-file URLs, not a prefix. Same-origin by construction, because
  // the default is a CDN and the point of on-device inference is working with no
  // signal at all. Absolute, because this worker runs from a blob (see
  // lib/bioclip/session.ts), against which a root-relative path is invalid.
  ort.env.wasm.wasmPaths = {
    wasm: new URL(ortWasmUrl, import.meta.url).href,
    mjs: await glueBlobUrl(new URL(ortMjsUrl, import.meta.url).href),
  };

  const bytes = new Uint8Array(modelBytes);
  // Errors only (3). ORT logs warnings through console.error, so the expected
  // "some nodes were not assigned to the preferred execution providers" (shape
  // ops stay on the CPU) reads as a failure to anyone debugging a phone. It is a
  // session option because ORT-web pins the session logger at warning otherwise.
  const logSeverityLevel = 3;
  // forceWasm exists because "WebGPU initialised" and "WebGPU computes correct
  // numbers" are different claims. An Android GPU ran this graph and returned a
  // garbage embedding; the caller detects that with a reference comparison and
  // rebuilds the session on the CPU backend, which is slower but right.
  const webgpuAvailable =
    !forceWasm && typeof navigator !== 'undefined' && 'gpu' in navigator;

  if (webgpuAvailable) {
    try {
      session = await ort.InferenceSession.create(bytes, {
        executionProviders: ['webgpu'],
        logSeverityLevel,
      });
      return 'webgpu';
    } catch {
      // Fall through. WebGPU can be advertised but fail to initialise (old
      // drivers, blocklisted GPUs), so availability is not the same as working.
      session = null;
    }
  }

  session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'],
    logSeverityLevel,
  });
  return 'wasm';
}

/**
 * One forward pass at a time, in arrival order.
 *
 * `self.onmessage` is async, so two `infer` messages can both reach `session.run`
 * before either resolves — and one ORT session cannot run two graphs at once; it
 * reuses internal buffers between runs, which is why the result is copied out
 * below. The panel embeds each photo in the background while the user frames the
 * next one, so concurrent requests are the normal case now, not a corner.
 *
 * Serialised here rather than in the caller so the invariant holds for every
 * caller, including a future one that has not thought about it.
 */
let inferQueue: Promise<void> = Promise.resolve();

async function runInfer(
  msg: Extract<WorkerRequest, { type: 'infer' }>
): Promise<void> {
  try {
    if (!session) throw new Error('infer before init');
    const feeds: Record<string, ort.Tensor> = {
      [inputName]: new ort.Tensor('float32', msg.tensor, msg.dims),
    };
    const out = await session.run(feeds);
    const raw = out[outputName].data as Float32Array;
    // Copy out of ORT's buffer before transferring: the session may reuse it.
    const embedding = new Float32Array(raw);
    post({ type: 'result', requestId: msg.requestId, embedding }, [
      embedding.buffer,
    ]);
  } catch (err) {
    // Caught here, not by the queue: a rejected tail would silently swallow
    // every photo queued after a single bad one.
    post({
      type: 'error',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      const provider = await createSession(msg.modelBytes, msg.forceWasm);
      if (!session) throw new Error('session creation returned no session');
      inputName = session.inputNames[0];
      outputName = session.outputNames[0];
      post({ type: 'ready', provider, inputName, outputName });
      return;
    }

    if (msg.type === 'infer') {
      inferQueue = inferQueue.then(() => runInfer(msg));
      return;
    }

    if (msg.type === 'dispose') {
      await session?.release();
      session = null;
      return;
    }
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

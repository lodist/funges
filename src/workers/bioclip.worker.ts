/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web';
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
// The jsep build is used for BOTH execution providers: it carries WebGPU support
// and still runs the wasm EP, so one 26.8MB pair covers both paths instead of
// shipping two.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url';

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
 * Create a session, preferring WebGPU and falling back to single-threaded WASM.
 *
 * `numThreads = 1` is set explicitly rather than left to auto-detection:
 * multi-threaded WASM needs SharedArrayBuffer, which needs COOP/COEP response
 * headers, which GitHub Pages cannot serve. Letting ORT probe for threads there
 * produces a slower, more confusing failure than just asking for one thread.
 *
 * Note a deployment hazard this guards against: Netlify CAN send those headers,
 * so a Netlify preview could quietly enable threading that production never
 * gets. Pinning to 1 keeps the preview representative of production.
 */
async function createSession(
  modelBytes: ArrayBuffer,
  forceWasm = false
): Promise<string> {
  // Explicit per-file URLs, not a prefix. Same-origin by construction, because
  // the default is a CDN and the point of on-device inference is working with no
  // signal at all.
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortMjsUrl };
  ort.env.wasm.numThreads = 1;

  const bytes = new Uint8Array(modelBytes);
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

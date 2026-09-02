import type { WorkerRequest, WorkerResponse } from '@/workers/bioclip.worker';

/**
 * Main-thread handle for the inference worker.
 *
 * Deliberately thin: it owns the worker lifecycle and request/response
 * correlation, and nothing else. Preprocessing lives in `./preprocess`, and
 * prediction-to-species mapping lives in `@/lib/photo-id`, so each piece is
 * testable without the other two.
 */

export interface SessionInfo {
  /** Which execution provider actually initialised: 'webgpu' or 'wasm'. */
  provider: string;
  inputName: string;
  outputName: string;
}

export class BioclipSession {
  private worker: Worker;
  private nextRequestId = 1;
  private pending = new Map<
    number,
    { resolve: (v: Float32Array) => void; reject: (e: Error) => void }
  >();
  private readyPromise: Promise<SessionInfo>;

  private constructor(modelBytes: ArrayBuffer, forceWasm: boolean) {
    this.worker = new Worker(
      new URL('@/workers/bioclip.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.readyPromise = new Promise<SessionInfo>((resolve, reject) => {
      const onFirst = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          this.worker.removeEventListener('message', onFirst);
          this.worker.addEventListener('message', this.onMessage);
          resolve({
            provider: msg.provider,
            inputName: msg.inputName,
            outputName: msg.outputName,
          });
        } else if (msg.type === 'error') {
          this.worker.removeEventListener('message', onFirst);
          reject(new Error(msg.message));
        }
      };
      this.worker.addEventListener('message', onFirst);
      this.worker.addEventListener('error', e =>
        reject(new Error(`worker failed to load: ${e.message}`))
      );
    });

    const req: WorkerRequest = { type: 'init', modelBytes, forceWasm };
    // Transfer rather than copy — at ~306MB a structured-clone copy would
    // briefly double peak memory, which is exactly where a low-end phone dies.
    this.worker.postMessage(req, [modelBytes]);
  }

  private onMessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    if (msg.type === 'result') {
      this.pending.get(msg.requestId)?.resolve(msg.embedding);
      this.pending.delete(msg.requestId);
    } else if (msg.type === 'error' && msg.requestId !== undefined) {
      this.pending.get(msg.requestId)?.reject(new Error(msg.message));
      this.pending.delete(msg.requestId);
    }
  };

  /**
   * `modelBytes` is transferred to the worker and unusable afterwards on the
   * calling side.
   */
  static async create(
    modelBytes: ArrayBuffer,
    options: { forceWasm?: boolean } = {}
  ): Promise<{
    session: BioclipSession;
    info: SessionInfo;
  }> {
    const session = new BioclipSession(modelBytes, options.forceWasm ?? false);
    const info = await session.readyPromise;
    return { session, info };
  }

  /** Run one forward pass. `tensor` is transferred and unusable afterwards. */
  async embed(tensor: Float32Array, dims: number[]): Promise<Float32Array> {
    const requestId = this.nextRequestId++;
    const promise = new Promise<Float32Array>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
    });
    const req: WorkerRequest = { type: 'infer', requestId, tensor, dims };
    this.worker.postMessage(req, [tensor.buffer]);
    return promise;
  }

  dispose(): void {
    const req: WorkerRequest = { type: 'dispose' };
    this.worker.postMessage(req);
    this.worker.terminate();
    for (const { reject } of this.pending.values()) {
      reject(new Error('session disposed'));
    }
    this.pending.clear();
  }
}

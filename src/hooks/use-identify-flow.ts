import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  averageEmbeddings,
  loadTextMatrix,
  rankPredictions,
} from '@/lib/bioclip/classify';
import {
  BlankImageError,
  ImageDecodeError,
  prepareImage,
  type PreparedImage,
} from '@/lib/bioclip/imagePrep';
import { preprocessToTensor, TARGET_SIZE } from '@/lib/bioclip/preprocess';
import { BioclipSession } from '@/lib/bioclip/session';
import {
  downloadModel,
  getAnyCachedModel,
  removeModel as removeCachedModel,
} from '@/lib/modelCache';
import {
  detectVariant,
  isWebgpuUntrusted,
  markWebgpuUntrusted,
  MODEL_VARIANTS,
  type ModelVariant,
  type VariantSpec,
} from '@/lib/bioclip/variant';
import { runSelfCheck } from '@/lib/bioclip/selfCheck';
import {
  mergeToxicSightings,
  resolvePredictions,
  type Candidate,
  type Prediction,
} from '@/lib/photo-id';

/**
 * The photo-identification flow: model, photos, and result, without any UI.
 *
 * The page owns the look; this owns the order of things and every safeguard
 * between them. State is local, not a Zustand store: the result of one find is
 * ephemeral, request-scoped state — exactly what dataStore.ts is a cautionary
 * tale for.
 */

export type IdentifyPhase =
  // Opening state. The cache lookup and, when nothing is cached, the GPU probe
  // are both async, and showing the capture UI first meant a user could pick a
  // photo and only THEN be told to download 280MB — the work discarded. Nothing
  // actionable is offered until we know which state we are actually in.
  | { name: 'checking' }
  | { name: 'capture' }
  // Carries the variant chosen for THIS device, so the consent copy states the
  // size the user will actually download rather than a hardcoded one.
  | { name: 'needsModel'; spec: VariantSpec }
  | {
      name: 'downloading';
      spec: VariantSpec;
      fraction: number | null;
      receivedBytes: number;
    }
  | { name: 'working' }
  // Thumbnails come from `staged`, which outlives this phase, so the result only
  // has to carry what the model produced — plus how many photos actually
  // contributed. That is not the same as how many were staged: a photo that
  // failed to decode is not combined, and saying it was would be contradicted by
  // the thumbnail sitting right beside the claim.
  | { name: 'results'; candidates: Candidate[]; used: number }
  | { name: 'error'; message: string };

/** What one photo contributed to the combined answer. */
interface Shot {
  embedding: Float32Array;
  /** This photo's own top 3, so a warning it alone saw survives averaging. */
  predictions: Prediction[];
}

/**
 * A photo of the current find, and the work it kicked off.
 *
 * Embedding starts the moment a photo is picked, while the user is still framing
 * the next one, so the wait overlaps with the shooting instead of following it.
 * The forward pass costs the same either way; this just stops it being wall-clock
 * the user has to sit through.
 */
export interface StagedPhoto {
  key: number;
  /** Thumbnail, once the decode has produced one. Null while decoding. */
  previewUrl: string | null;
  /** True when this photo could not be used. Never hidden. */
  failed?: boolean;
  /** Resolves to null instead of rejecting, so one bad photo cannot lose the others. */
  work: Promise<Shot | null>;
}

/**
 * Cap on photos combined for one find.
 *
 * Two because the measurement says the second photo does nearly all the work
 * (see `averageEmbeddings`): a third added ~1pp of top-1 and moved nothing
 * else, and each photo is another full forward pass on the phone.
 */
export const MAX_PHOTOS = 2;

/**
 * Wait words, cycling while identification is running.
 *
 * On a phone the forward pass takes seconds, and a single unchanging
 * "Identifying…" for that long reads as a hung app. One word each, because the
 * sentences these replaced were cut off in the status pill on a phone, and
 * none of them promises completion. Never a word about eating or tasting.
 */
export const WORKING_MESSAGES = [
  'working.look',
  'working.compare',
  'working.sniff',
  'working.peer',
  'working.rummage',
  'working.sort',
  'working.weigh',
  'working.ponder',
] as const;

const WORKING_MESSAGE_INTERVAL_MS = 2500;

export interface IdentifyFlow {
  phase: IdentifyPhase;
  staged: StagedPhoto[];
  /** Which execution provider the session runs on: 'webgpu' or 'wasm'. */
  provider: string | null;
  /** The model variant on this device, once known. */
  variant: ModelVariant | null;
  /** How long the last photo's forward pass took. */
  lastMs: number | null;
  /** The wait message to show while `phase` is 'working'. */
  workingMessage: (typeof WORKING_MESSAGES)[number];
  startDownload: (spec: VariantSpec) => Promise<void>;
  cancelDownload: () => void;
  addPhotos: (files: File[]) => void;
  removePhoto: (key: number) => void;
  identify: () => Promise<void>;
  startOver: () => void;
  removeModel: () => void;
}

export function useIdentifyFlow(): IdentifyFlow {
  const { t } = useTranslation('identify');
  const [phase, setPhase] = useState<IdentifyPhase>({ name: 'checking' });
  const [provider, setProvider] = useState<string | null>(null);
  const [variant, setVariant] = useState<ModelVariant | null>(null);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [workingStage, setWorkingStage] = useState(0);
  // Photos staged for the current find, in capture order.
  const [staged, setStaged] = useState<StagedPhoto[]>([]);

  // The build in flight or done, so the open-time build and the first photo share
  // one session. Two concurrent builds would hold two copies of a ~300 MB graph,
  // which is exactly where a phone runs out of memory.
  const sessionRef = useRef<Promise<BioclipSession> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Monotonic id per attempt. Without it, a slow first identification can
  // resolve AFTER a second one and overwrite a newer result — including
  // replacing a toxic warning with a stale non-toxic one. A ref, not state:
  // it must be readable synchronously inside the async chain.
  const requestIdRef = useRef(0);
  // Every object URL created for the current find, so revoking does not depend on
  // reading state from a cleanup closure that may be a render behind.
  const previewsRef = useRef<string[]>([]);
  // Tail of the per-photo work chain. Two photos picked in quick succession must
  // not build the session twice or embed concurrently.
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const keyRef = useRef(0);
  // Why a photo failed. Without it, a session that cannot be built at all would
  // report "no photos could be read" instead of the actual reason.
  const lastErrorRef = useRef<unknown>(null);

  const clearStaged = useCallback(() => {
    for (const url of previewsRef.current) URL.revokeObjectURL(url);
    previewsRef.current = [];
    setStaged([]);
  }, []);

  // Decide the opening state from whether the model is already on the device.
  //
  // The variant probe runs ONLY when nothing is cached. It builds a throwaway ORT
  // session, so doing it on every visit would cost a needless WebGPU init on a
  // device that already has its model.
  useEffect(() => {
    let cancelled = false;
    getAnyCachedModel()
      .then(async cached => {
        if (cancelled) return;
        if (cached) {
          setVariant(cached.info.variant);
          // Two explicit branches, not a ternary on `name`: the latter widens to
          // `{ name: 'capture' | 'needsModel' }`, which does not satisfy the
          // discriminated union.
          setPhase({ name: 'capture' });
          return;
        }
        const { spec } = await detectVariant();
        if (cancelled) return;
        setPhase({ name: 'needsModel', spec });
      })
      .catch(() => {
        // Never strand the user on a spinner: offer the conservative variant.
        if (!cancelled)
          setPhase({ name: 'needsModel', spec: MODEL_VARIANTS.int8 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep cycling for slow devices rather than leaving the final message static.
  useEffect(() => {
    if (phase.name !== 'working') return;
    setWorkingStage(0);
    const timer = window.setInterval(
      () => setWorkingStage(stage => (stage + 1) % WORKING_MESSAGES.length),
      WORKING_MESSAGE_INTERVAL_MS
    );
    return () => clearInterval(timer);
  }, [phase.name]);

  // Build the session as soon as there is a model to build it from — on open, or
  // when a download finishes — instead of after the first photo arrives. Reading
  // ~300 MB and building the graph takes seconds on a phone, and the camera is
  // where that time can pass unnoticed. A failure resurfaces on the photo.
  useEffect(() => {
    if (phase.name === 'capture') ensureSession().catch(() => {});
    // ensureSession is memoised through sessionRef; re-running on its identity
    // would only return the same promise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.name]);

  useEffect(
    () => () => {
      // Through the promise, so a build still in flight is disposed when it
      // lands instead of leaking its worker and graph.
      void sessionRef.current?.then(
        s => s.dispose(),
        () => {}
      );
      sessionRef.current = null;
      abortRef.current?.abort();
      clearStaged();
    },
    [clearStaged]
  );

  const startDownload = async (spec: VariantSpec) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: 'downloading', spec, fraction: 0, receivedBytes: 0 });
    try {
      await downloadModel(
        spec,
        ({ fraction, receivedBytes }) =>
          setPhase({ name: 'downloading', spec, fraction, receivedBytes }),
        controller.signal
      );
      setVariant(spec.variant);
      setPhase({ name: 'capture' });
    } catch (err) {
      if (controller.signal.aborted) {
        setPhase({ name: 'needsModel', spec });
        return;
      }
      setPhase({
        name: 'error',
        message: `${t('download.failed')} ${
          err instanceof Error ? err.message : ''
        }`.trim(),
      });
    } finally {
      abortRef.current = null;
    }
  };

  /** The one session for this page, built on first call and shared after. */
  const ensureSession = (): Promise<BioclipSession> => {
    if (!sessionRef.current) {
      const building = buildSession().catch(err => {
        // Forget the failure, so the next photo retries instead of inheriting
        // it — unless a newer build (after "remove model") already replaced it.
        if (sessionRef.current === building) sessionRef.current = null;
        throw err;
      });
      sessionRef.current = building;
    }
    return sessionRef.current;
  };

  /**
   * Build a session and PROVE it computes this model before returning it.
   *
   * A GPU backend that initialises but returns wrong numbers is not a
   * theoretical worry — it happened on Android with int4 under `engine: webgpu`,
   * and produced a confident species list from noise. So a failed self-check
   * rebuilds on the CPU backend, and if that is also wrong the feature refuses
   * rather than guessing. Slow and correct beats fast and wrong; wrong and
   * confident is unacceptable for toxicity warnings.
   *
   * `bytes` is transferred into the worker. Do not retain an eager retry copy:
   * for int8 that would allocate another ~307 MB on every identification for a
   * retry that never happens, since int8 is always built on the CPU. A bad GPU
   * is rare; re-reading IndexedDB in that exceptional path is slower but keeps
   * the normal mobile peak low enough for Safari's web-content process.
   */
  const buildSession = async (): Promise<BioclipSession> => {
    const cached = await getAnyCachedModel();
    if (!cached) throw new Error(t('download.declined'));
    const spec = MODEL_VARIANTS[cached.info.variant];
    setVariant(spec.variant);

    const bytes = await cached.blob.arrayBuffer();

    let { session, info } = await BioclipSession.create(bytes, {
      // int8 gains nothing from WebGPU (its matmuls have no kernel there, see
      // variant.ts), and its embedding drifts from the CPU one the gate was
      // measured on: cosine 0.996 on a laptop GPU, 0.924 on an Adreno 6xx phone,
      // where the CPU was also faster. A GPU already caught returning wrong
      // numbers for this variant is not asked again on every session.
      forceWasm: spec.variant === 'int8' || isWebgpuUntrusted(spec.variant),
    });
    let check = await runSelfCheck(session, spec.variant);

    if (!check.ok && info.provider !== 'wasm') {
      // This device's GPU backend is untrustworthy for this artifact. Remember
      // it so the next download offers the variant whose compute path does not
      // depend on it, instead of repeating this every session.
      markWebgpuUntrusted(spec.variant);
      session.dispose();
      // The first buffer was transferred and is detached. Pay for a fresh read
      // only on a device whose GPU actually failed the numerical self-check.
      const retryBytes = await cached.blob.arrayBuffer();
      ({ session, info } = await BioclipSession.create(retryBytes, {
        forceWasm: true,
      }));
      check = await runSelfCheck(session, spec.variant);
    }

    if (!check.ok) {
      session.dispose();
      throw new Error(t('status.backendWrong'));
    }

    setProvider(info.provider);
    return session;
  };

  /**
   * Decode and embed one photo. Resolves to null rather than throwing.
   *
   * Failure is per-photo on purpose: losing a good angle because the other could
   * not be decoded would be the app throwing away the user's work. The failure
   * is marked on the photo instead, because a photo that silently stops counting
   * is exactly the kind of invisible shrinkage this feature must not have.
   */
  const embedPhoto = async (
    preparation: Promise<PreparedImage | null>,
    key: number
  ): Promise<Shot | null> => {
    try {
      // Decoding starts outside the inference queue. In particular, do not put
      // it behind ensureSession(): loading a 300 MB model can take seconds, and
      // an empty frame during that work makes a successful file pick look broken.
      const prepared = await preparation;
      if (!prepared) return null;
      const [session, matrix] = await Promise.all([
        ensureSession(),
        loadTextMatrix(),
      ]);

      const started = performance.now();
      const embedding = await session.embed(preprocessToTensor(prepared.rgba), [
        1,
        3,
        TARGET_SIZE,
        TARGET_SIZE,
      ]);
      setLastMs(performance.now() - started);

      // Each photo's own ranking is kept, not just its embedding: it is what
      // mergeToxicSightings needs to notice a warning the average washed out.
      return { embedding, predictions: rankPredictions(embedding, matrix, 3) };
    } catch (err) {
      lastErrorRef.current = err;
      setStaged(prev =>
        prev.map(s => (s.key === key ? { ...s, failed: true } : s))
      );
      return null;
    }
  };

  /**
   * Combine everything staged and show the result.
   *
   * Most of the work is usually already done by the time this runs — each photo
   * started embedding when it was picked — so pressing Identify after taking
   * two photos is not two passes of waiting, only whatever is left of the last
   * one.
   */
  const identify = async () => {
    const list = staged;
    const requestId = ++requestIdRef.current;
    const stale = () => requestId !== requestIdRef.current;
    setPhase({ name: 'working' });

    try {
      const shots = (await Promise.all(list.map(s => s.work))).filter(
        (s): s is Shot => s !== null
      );
      if (stale()) return;

      if (shots.length === 0) {
        // Report the real cause. A failed decode gets its own message, because
        // "something went wrong" hides the one actionable fact: this photo could
        // not be read, so try another.
        const err = lastErrorRef.current;
        setPhase({
          name: 'error',
          message:
            err instanceof BlankImageError || err instanceof ImageDecodeError
              ? t('status.unreadable')
              : err instanceof Error
                ? err.message
                : t('status.failed'),
        });
        return;
      }

      const matrix = await loadTextMatrix();
      if (stale()) return;

      const candidates =
        shots.length === 1
          ? resolvePredictions(shots[0].predictions)
          : mergeToxicSightings(
              rankPredictions(
                averageEmbeddings(shots.map(s => s.embedding)),
                matrix,
                3
              ),
              shots.map(s => s.predictions)
            );
      if (stale()) return;

      setPhase({ name: 'results', candidates, used: shots.length });
    } catch (err) {
      if (stale()) return;
      setPhase({
        name: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  /**
   * Return to the staging step because the photo set changed.
   *
   * The request id bump matters: an identification already in flight was started
   * from a different set of photos, and letting it land would show a result for
   * photos that are no longer the ones on screen.
   */
  const backToStaging = () => {
    requestIdRef.current++;
    setPhase({ name: 'capture' });
  };

  const startOver = () => {
    requestIdRef.current++;
    clearStaged();
    setPhase({ name: 'capture' });
  };

  /**
   * Stage photos. Embedding starts now; identifying does not.
   *
   * Adding a photo NEVER identifies on its own, including from the results
   * screen. One rule for the whole flow: changing the set of photos returns you
   * to the staging step, and you press Identify. Auto-running from results was
   * inconsistent — the capture step asks, so results firing by itself took the
   * decision away at the one moment the user has most reason to make it.
   *
   * The append reads `staged` from this render rather than inside a setState
   * updater: an impure updater would run twice in development and stage the
   * photo twice.
   */
  const addPhotos = (files: File[]) => {
    const current = staged;
    const accepted = files.slice(0, MAX_PHOTOS - current.length);
    const additions = accepted.map(file => {
      const key = ++keyRef.current;
      // Start every decode immediately. The much heavier model forward passes
      // remain serialized below so low-memory phones do not run several copies
      // of the graph at once.
      const preparation = prepareImage(file)
        .then(prepared => {
          previewsRef.current.push(prepared.previewUrl);
          setStaged(prev =>
            prev.map(s =>
              s.key === key ? { ...s, previewUrl: prepared.previewUrl } : s
            )
          );
          return prepared;
        })
        .catch(err => {
          // Handle decode failures immediately, including for a second
          // concurrently selected file whose inference turn has not started yet.
          // Returning null also prevents an early rejection from becoming an
          // unhandled promise while it waits for the model queue.
          lastErrorRef.current = err;
          setStaged(prev =>
            prev.map(s => (s.key === key ? { ...s, failed: true } : s))
          );
          return null;
        });
      const work = chainRef.current.then(() => embedPhoto(preparation, key));
      // embedPhoto never rejects, so the chain cannot be poisoned by one photo.
      chainRef.current = work;
      return { key, previewUrl: null, work } satisfies StagedPhoto;
    });

    if (additions.length === 0) return;
    setStaged([...current, ...additions]);
    backToStaging();
  };

  /**
   * Drop one staged photo.
   *
   * Its in-flight work is left to finish and discarded: the embedding is already
   * paid for, and cancelling mid-graph is not something ORT offers.
   *
   * Removing from the results screen goes back to staging rather than silently
   * re-ranking. The result on screen was computed FROM this photo, so it is now
   * wrong either way; making the user press Identify keeps one rule for every
   * change to the photo set instead of two behaviours to learn.
   */
  const removePhoto = (key: number) => {
    const gone = staged.find(s => s.key === key);
    if (gone?.previewUrl) {
      URL.revokeObjectURL(gone.previewUrl);
      previewsRef.current = previewsRef.current.filter(
        url => url !== gone.previewUrl
      );
    }
    setStaged(staged.filter(s => s.key !== key));
    backToStaging();
  };

  /**
   * Remove the model, then offer whichever variant is best for this device now.
   * Re-probes rather than reusing the removed variant: removing is also how a
   * user switches artifacts.
   */
  const removeModel = () => {
    void removeCachedModel()
      .then(async () => {
        void sessionRef.current?.then(
          s => s.dispose(),
          () => {}
        );
        sessionRef.current = null;
        setVariant(null);
        setProvider(null);
        const { spec } = await detectVariant();
        setPhase({ name: 'needsModel', spec });
      })
      .catch(() => setPhase({ name: 'needsModel', spec: MODEL_VARIANTS.int8 }));
  };

  return {
    phase,
    staged,
    provider,
    variant,
    lastMs,
    workingMessage: WORKING_MESSAGES[workingStage],
    startDownload,
    cancelDownload: () => abortRef.current?.abort(),
    addPhotos,
    removePhoto,
    identify,
    startOver,
    removeModel,
  };
}

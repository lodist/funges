import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { draw, loadArt, type Art, type View } from '@/game/draw';
import { shareRun } from '@/game/share';
import { Pause, Play } from '@/lib/icons';
import {
  newGame,
  RIDE_TICKS,
  score,
  step,
  TICKS_PER_SECOND,
  VIEW_H,
  VIEW_W,
  type Game,
  type Run,
} from '@/game/sim';
import { STAGES } from '@/game/stages';
import styles from './PlayPage.module.scss';

const TICK_MS = 1000 / TICKS_PER_SECOND;
const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
const SLIDE_KEYS = new Set(['ArrowDown', 'KeyS']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
/** A finger moving this far down (px), this soon after touching (ms), slides. */
const SWIPE = 28;
const SWIPE_MS = 300;
/** The run's end (the slide to a stop) plays this long before the result, ms. */
const ENDING = 1100;
const BEST = 'squirrel-best';

/** The best run on this device: its score, how far it got and the run
 *  itself, to post once there is a board. */
interface Best {
  score: number;
  furthest: number;
  run: Run;
}

function readBest(): Best | null {
  try {
    return JSON.parse(localStorage.getItem(BEST) ?? 'null');
  } catch {
    return null;
  }
}

function keepBest(best: Best) {
  try {
    localStorage.setItem(BEST, JSON.stringify(best));
  } catch {
    // Blocked storage: the best run lasts this visit.
  }
}

type Phase = 'loading' | 'ready' | 'playing' | 'paused' | 'over';

export default function PlayPage() {
  const { t, i18n } = useTranslation('common');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const art = useRef<Art>(new Map());
  const game = useRef<Game>(newGame(0));
  const run = useRef<Run>({ seed: 0, presses: [], releases: [], slides: [] });
  const inputs = useRef<('press' | 'release' | 'slide')[]>([]);
  const swipe = useRef<{ y: number; at: number } | null>(null);
  const phaseNow = useRef<Phase>('loading');
  const overAt = useRef(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [best, setBest] = useState(readBest);
  const [last, setLast] = useState<{ score: number; furthest: number }>();
  const [options] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return {
      debug: query.has('debug'),
      // /play?at=rome starts two screens before a stage, so the change into
      // it plays first, and ?ride on the stage's ride: for reviewing their
      // art. Such a run cannot be replayed, so it is never kept as the best.
      at: STAGES.findIndex(s => s.id === query.get('at')),
      ride: query.has('ride'),
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
    };
  });
  const number = (n: number) => n.toLocaleString(i18n.language);

  const goTo = useCallback((next: Phase) => {
    phaseNow.current = next;
    setPhase(next);
  }, []);

  // Canvas pixels per game pixel: the canvas has as many pixels as it is
  // shown at, so the smooth landscape stays sharp at any size.
  const scale = useRef(3);
  const paint = useCallback(
    (view?: View) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx)
        draw(
          ctx,
          game.current,
          art.current,
          { ...options, scale: scale.current },
          view
        );
    },
    [options]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const width = Math.min(
        2560,
        Math.round(canvas.clientWidth * (window.devicePixelRatio || 1))
      );
      if (width < 64 || width === canvas.width) return;
      canvas.width = width;
      canvas.height = Math.round((width * VIEW_H) / VIEW_W);
      scale.current = width / VIEW_W;
      paint();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [paint]);

  useEffect(() => {
    let live = true;
    void loadArt().then(loaded => {
      if (!live) return;
      art.current = loaded;
      paint();
      goTo('ready');
    });
    return () => {
      live = false;
    };
  }, [paint, goTo]);

  const start = useCallback(() => {
    const seed = (Math.random() * 0x100000000) >>> 0;
    game.current = newGame(seed);
    if (options.at > 0) {
      const g = game.current;
      g.dist =
        STAGES.slice(0, options.at).reduce((n, s) => n + s.length, 0) -
        2 * VIEW_W;
      g.nextAt = g.dist + VIEW_W + 160;
      g.furthest = options.at;
    }
    const stage = STAGES[Math.max(options.at, 0)];
    if (options.ride && stage.ride)
      game.current.ride = {
        stage: stage.id,
        art: stage.ride,
        until: RIDE_TICKS,
      };
    run.current = { seed, presses: [], releases: [], slides: [] };
    inputs.current = [];
    setLast(undefined);
    goTo('playing');
  }, [goTo, options]);

  const press = useCallback(() => {
    const now = phaseNow.current;
    if (now === 'ready') start();
    else if (now === 'paused') goTo('playing');
    else if (now === 'playing') inputs.current.push('press');
    // A tap meant as a last jump must not start the next run at once.
    else if (now === 'over' && performance.now() - overAt.current > 600)
      start();
  }, [goTo, start]);

  const release = useCallback(() => {
    if (phaseNow.current === 'playing') inputs.current.push('release');
  }, []);

  const slide = useCallback(() => {
    if (phaseNow.current === 'playing') inputs.current.push('slide');
  }, []);

  const togglePause = useCallback(() => {
    if (phaseNow.current === 'playing') goTo('paused');
    else if (phaseNow.current === 'paused') goTo('playing');
  }, [goTo]);

  // The loop: as many fixed ticks as time has passed, then one picture.
  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let then = performance.now();
    let spare = 0;
    let before: View = { dist: game.current.dist, y: game.current.y };
    let endedAt = -1;
    const loop = (now: number) => {
      // A stalled tab is paused, not fast-forwarded.
      spare += Math.min(now - then, 100);
      then = now;
      const g = game.current;
      while (spare >= TICK_MS && !g.over) {
        spare -= TICK_MS;
        const input = inputs.current.shift();
        const tick = g.tick + 1;
        if (input === 'press') run.current.presses.push(tick);
        if (input === 'release') run.current.releases.push(tick);
        if (input === 'slide') run.current.slides?.push(tick);
        before = { dist: g.dist, y: g.y };
        step(g, {
          press: input === 'press',
          release: input === 'release',
          slide: input === 'slide',
        });
      }
      if (g.over && endedAt < 0) endedAt = now;
      const ended = g.over ? now - endedAt : undefined;
      // Drawn between the last two ticks, by how far time has run into the
      // next one: smooth on 90 and 120 Hz screens too.
      const blend = g.over ? 1 : spare / TICK_MS;
      paint({
        dist: before.dist + (g.dist - before.dist) * blend,
        y: before.y + (g.y - before.y) * blend,
        ended,
      });
      // The run's end plays out before the result shows.
      if (ended === undefined || ended < (options.reducedMotion ? 0 : ENDING)) {
        frame = requestAnimationFrame(loop);
        return;
      }
      const result = { score: score(g), furthest: g.furthest };
      const previous = readBest();
      const review = options.at > 0 || options.ride;
      if (!review && (!previous || result.score > previous.score)) {
        const kept = { ...result, run: run.current };
        keepBest(kept);
        setBest(kept);
      }
      overAt.current = performance.now();
      setLast(result);
      goTo('over');
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, paint, goTo, options]);

  // Away from the tab or the app: paused, never lost.
  useEffect(() => {
    const away = () => {
      if (document.hidden && phaseNow.current === 'playing') goTo('paused');
    };
    document.addEventListener('visibilitychange', away);
    return () => document.removeEventListener('visibilitychange', away);
  }, [goTo]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (PAUSE_KEYS.has(event.code)) {
        togglePause();
        return;
      }
      const jump = JUMP_KEYS.has(event.code);
      if (!jump && !SLIDE_KEYS.has(event.code)) return;
      // Space on a focused button presses the button.
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button, a, input, select, textarea')
      )
        return;
      event.preventDefault();
      if (jump) press();
      else slide();
    };
    const up = (event: KeyboardEvent) => {
      if (JUMP_KEYS.has(event.code)) release();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [press, release, slide, togglePause]);

  const share = () => {
    const canvas = canvasRef.current;
    if (!canvas || !last) return;
    const points = number(last.score);
    void shareRun(canvas, {
      title: t('game.title'),
      line: t('game.card', { score: points }),
      text: t('game.shareText', {
        score: points,
        url: `${window.location.origin}/play/`,
      }),
    });
  };

  const fullscreen = () => {
    void areaRef.current?.requestFullscreen().then(
      () => {
        // Android turns to landscape in full screen; elsewhere this is a no-op.
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (to: string) => Promise<void>;
        };
        void orientation.lock?.('landscape').catch(() => {});
      },
      () => {}
    );
  };

  /** Buttons inside the tap area must not also jump. */
  const own = (event: PointerEvent) => event.stopPropagation();

  return (
    <>
      <SEO
        title={t('game.seoTitle')}
        description={t('game.seoDescription')}
        canonicalUrl={`${import.meta.env.BASE_URL}play`}
      />
      <div className={styles.page}>
        <h1 className={styles.title}>{t('game.title')}</h1>
        <div
          ref={areaRef}
          className={styles.area}
          onPointerDown={event => {
            if (event.button !== 0) return;
            swipe.current = { y: event.clientY, at: event.timeStamp };
            press();
          }}
          // A swipe down slides (in the air: dives, then slides).
          onPointerMove={event => {
            const from = swipe.current;
            if (!from || event.timeStamp - from.at > SWIPE_MS) return;
            if (event.clientY - from.y > SWIPE) {
              swipe.current = null;
              slide();
            }
          }}
          onPointerUp={() => {
            swipe.current = null;
            release();
          }}
          onPointerCancel={release}
          onContextMenu={event => event.preventDefault()}
        >
          <div className={styles.frame}>
            <canvas
              ref={canvasRef}
              width={VIEW_W * 3}
              height={VIEW_H * 3}
              className={styles.screen}
              role='img'
              aria-label={t('game.canvas')}
            />
            {(phase === 'playing' || phase === 'paused') && (
              <button
                type='button'
                className={styles.pause}
                onPointerDown={own}
                onClick={togglePause}
                aria-label={t(
                  phase === 'paused' ? 'game.resume' : 'game.pause'
                )}
              >
                {phase === 'paused' ? <Play /> : <Pause />}
              </button>
            )}
          </div>
          <div className={styles.panel} aria-live='polite'>
            {phase === 'ready' && (
              <p className={styles.lead}>{t('game.start')}</p>
            )}
            {phase === 'paused' && (
              <p className={styles.lead}>{t('game.paused')}</p>
            )}
            {phase === 'playing' && (
              <p className={styles.hint}>{t('game.hint')}</p>
            )}
            {phase === 'over' && last && (
              <p className={styles.lead}>
                {t('game.over', { score: number(last.score) })}
              </p>
            )}
            {best && phase !== 'playing' && (
              <p className={styles.hint}>
                {t('game.best', { score: number(best.score) })}
              </p>
            )}
            {(phase === 'ready' || phase === 'over') && (
              <div className={styles.actions}>
                {phase === 'over' && (
                  <>
                    <Button onPointerDown={own} onClick={start}>
                      {t('game.again')}
                    </Button>
                    <Button
                      variant='secondary'
                      onPointerDown={own}
                      onClick={share}
                    >
                      {t('game.share')}
                    </Button>
                  </>
                )}
                {document.fullscreenEnabled && (
                  <Button
                    variant='ghost'
                    onPointerDown={own}
                    onClick={fullscreen}
                  >
                    {t('game.fullscreen')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

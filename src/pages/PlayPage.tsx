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
import { draw, loadArt, type Art } from '@/game/draw';
import { shareRun } from '@/game/share';
import {
  newGame,
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

const stageId = (furthest: number) => STAGES[furthest % STAGES.length].id;

type Phase = 'loading' | 'ready' | 'playing' | 'paused' | 'over';

export default function PlayPage() {
  const { t, i18n } = useTranslation('common');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const art = useRef<Art>(new Map());
  const game = useRef<Game>(newGame(0));
  const run = useRef<Run>({ seed: 0, presses: [], releases: [] });
  const inputs = useRef<('press' | 'release')[]>([]);
  const phaseNow = useRef<Phase>('loading');
  const overAt = useRef(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [banner, setBanner] = useState<string | null>(null);
  const [best, setBest] = useState(readBest);
  const [last, setLast] = useState<{ score: number; furthest: number }>();
  const [options] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return {
      debug: query.has('debug'),
      // /play?at=rome starts at a stage, for reviewing its art. Such a run
      // cannot be replayed, so it is never kept as the best.
      at: STAGES.findIndex(s => s.id === query.get('at')),
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
    };
  });
  const number = (n: number) => n.toLocaleString(i18n.language);
  const stageName = useCallback(
    (furthest: number) => t(`game.stages.${stageId(furthest)}`),
    [t]
  );

  const goTo = useCallback((next: Phase) => {
    phaseNow.current = next;
    setPhase(next);
  }, []);

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) draw(ctx, game.current, art.current, options);
  }, [options]);

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
      g.dist = STAGES.slice(0, options.at).reduce((n, s) => n + s.length, 0);
      g.nextAt = g.dist + VIEW_W + 160;
      g.furthest = options.at;
    }
    run.current = { seed, presses: [], releases: [] };
    inputs.current = [];
    setLast(undefined);
    setBanner(stageName(Math.max(options.at, 0)));
    goTo('playing');
  }, [goTo, stageName, options]);

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

  // The loop: as many fixed ticks as time has passed, then one picture.
  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let then = performance.now();
    let spare = 0;
    let shown = game.current.furthest;
    const loop = (now: number) => {
      // A stalled tab is paused, not fast-forwarded.
      spare += Math.min(now - then, 100);
      then = now;
      const g = game.current;
      while (spare >= TICK_MS && !g.over) {
        spare -= TICK_MS;
        const input = inputs.current.shift();
        if (input === 'press') run.current.presses.push(g.tick + 1);
        if (input === 'release') run.current.releases.push(g.tick + 1);
        step(g, { press: input === 'press', release: input === 'release' });
      }
      paint();
      if (g.furthest !== shown) {
        shown = g.furthest;
        setBanner(stageName(shown));
      }
      if (!g.over) {
        frame = requestAnimationFrame(loop);
        return;
      }
      const result = { score: score(g), furthest: g.furthest };
      const previous = readBest();
      if (options.at < 1 && (!previous || result.score > previous.score)) {
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
  }, [phase, paint, goTo, stageName, options]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 2000);
    return () => clearTimeout(timer);
  }, [banner]);

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
      if (!JUMP_KEYS.has(event.code) || event.repeat) return;
      // Space on a focused button presses the button.
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button, a, input, select, textarea')
      )
        return;
      event.preventDefault();
      press();
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
  }, [press, release]);

  const share = () => {
    const canvas = canvasRef.current;
    if (!canvas || !last) return;
    const stage = stageName(last.furthest);
    const points = number(last.score);
    void shareRun(canvas, {
      title: t('game.title'),
      line: t('game.card', { score: points, stage }),
      text: t('game.shareText', {
        score: points,
        stage,
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
            if (event.button === 0) press();
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onContextMenu={event => event.preventDefault()}
        >
          <div className={styles.frame}>
            <canvas
              ref={canvasRef}
              width={VIEW_W}
              height={VIEW_H}
              className={styles.screen}
              role='img'
              aria-label={t('game.canvas')}
            />
            {phase === 'playing' && banner && (
              <p className={styles.banner}>{banner}</p>
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
              <>
                <p className={styles.lead}>
                  {t('game.over', { score: number(last.score) })}
                </p>
                <p>{t('game.reached', { stage: stageName(last.furthest) })}</p>
              </>
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

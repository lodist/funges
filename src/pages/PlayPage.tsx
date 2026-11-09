import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import SEO from '@/components/SEO';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SquirrelBoard } from '@/components/SquirrelBoard';
import { Button } from '@/components/ui/button';
import {
  bestOf,
  boardsOn,
  keepIfBest,
  playerName,
  readBest,
  sendBests,
  type Route,
} from '@/game/board';
import { draw, loadArt, type Art, type View } from '@/game/draw';
import { shareRun } from '@/game/share';
import { Pause, Play } from '@/lib/icons';
import { navItems } from '@/lib/nav-items';
import { NAV_SURFACE_CLASS } from '@/lib/nav-surface';
import { currentSpace } from '@/lib/spaces';
import { cn } from '@/lib/utils';
import {
  newGame,
  RIDE_TICKS,
  score,
  step,
  TICKS_PER_SECOND,
  VIEW_H,
  VIEW_MAX_W,
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
/** The route the next run takes: the classic journey or the stages shuffled. */
const ROUTE = 'squirrel-route';
/** The tallest view, game px: 4:3. A screen narrower than 16:9 sees more
 *  sky, down to this; narrower still gets bars. */
const VIEW_MAX_H = 360;
/** A phone or tablet held upright: the game is drawn turned sideways, to be
 *  played with the device turned (the same query as in the SCSS). */
const UPRIGHT = '(orientation: portrait) and (pointer: coarse)';

function readRoute(): Route {
  try {
    return localStorage.getItem(ROUTE) === 'random' ? 'random' : 'classic';
  } catch {
    return 'classic';
  }
}

/** On a phone or tablet the game takes the whole screen, locked sideways
 *  where the browser can (Android). Where it cannot (an iPhone has no full
 *  screen for a page), an upright screen turns the game by CSS instead.
 *  Only from a tap's release or a click: a touch's press does not count. */
function landscape(area: HTMLElement | null) {
  if (
    !area ||
    !document.fullscreenEnabled ||
    document.fullscreenElement ||
    !window.matchMedia('(pointer: coarse)').matches
  )
    return;
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (to: string) => Promise<void>;
  };
  void area
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => orientation.lock?.('landscape'))
    .catch(() => {});
}

type Phase = 'loading' | 'ready' | 'playing' | 'paused' | 'over';

export default function PlayPage() {
  const { t, i18n } = useTranslation('common');
  const { t: tNav } = useTranslation('sidebar');
  const { pathname } = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const art = useRef<Art>(new Map());
  const game = useRef<Game>(newGame(0));
  const run = useRef<Run>({ seed: 0, presses: [], releases: [], slides: [] });
  const inputs = useRef<('press' | 'release' | 'slide')[]>([]);
  const swipe = useRef<{ x: number; y: number; at: number } | null>(null);
  const phaseNow = useRef<Phase>('loading');
  const overAt = useRef(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [bests, setBests] = useState(() => ({
    classic: readBest('classic'),
    random: readBest('random'),
  }));
  const [last, setLast] = useState<{ score: number; furthest: number }>();
  const [route, setRoute] = useState(readRoute);
  const [tab, setTab] = useState<'game' | 'board'>('game');
  // The run just ended: a best of this device's, and its place on the board.
  const [newBest, setNewBest] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
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

  // Canvas pixels per game pixel, and the view's size in game pixels: the
  // canvas has as many pixels as it is shown at, so the smooth landscape
  // stays sharp at any size, and the view takes the screen's shape.
  const scale = useRef(3);
  const width = useRef(VIEW_W);
  const height = useRef(VIEW_H);
  const paint = useCallback(
    (view?: View) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx)
        draw(
          ctx,
          game.current,
          art.current,
          {
            ...options,
            scale: scale.current,
            width: width.current,
            height: height.current,
          },
          view
        );
    },
    [options]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 64 || h < 64) return;
      // From 4:3 to 21:9 the picture fills the screen: wider, it sees
      // further ahead; narrower, more sky. Past those, bars.
      const view = Math.min(VIEW_MAX_W, Math.max(VIEW_W, (w / h) * VIEW_H));
      const tall = Math.min(VIEW_MAX_H, Math.max(VIEW_H, (view * h) / w));
      // At most 2 canvas pixels per CSS pixel and 2560 across: a phone's 3x
      // would triple the pixels drawn each frame for little to see.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const s = Math.min(Math.min(w / view, h / tall) * dpr, 2560 / view);
      const cw = Math.round(view * s);
      const ch = Math.round(tall * s);
      if (cw === canvas.width && ch === canvas.height) return;
      canvas.width = cw;
      canvas.height = ch;
      scale.current = s;
      width.current = view;
      height.current = tall;
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
    // A review run (?at, ?ride) keeps the classic route its stage is on.
    const shuffled = route === 'random' && options.at < 0 && !options.ride;
    game.current = newGame(seed, shuffled);
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
    run.current = {
      seed,
      presses: [],
      releases: [],
      slides: [],
      ...(shuffled && { shuffled }),
    };
    inputs.current = [];
    setLast(undefined);
    setTab('game');
    goTo('playing');
  }, [goTo, options, route]);

  const chooseRoute = (next: Route) => {
    setRoute(next);
    try {
      localStorage.setItem(ROUTE, next);
    } catch {
      // Blocked storage: the choice lasts this visit.
    }
  };

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
      const review = options.at > 0 || options.ride;
      const ran: Route = run.current.shuffled ? 'random' : 'classic';
      const fresh = !review && keepIfBest(ran, bestOf(g, run.current));
      setNewBest(fresh);
      setRank(null);
      if (fresh) {
        setBests(kept => ({ ...kept, [ran]: readBest(ran) }));
        // Straight onto the board when this device has a name.
        void sendBests().then(
          ranks => setRank(ranks[ran] ?? null),
          () => {}
        );
      }
      overAt.current = performance.now();
      setLast(result);
      goTo('over');
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, paint, goTo, options]);

  // Away from the tab or the app, or out of full screen (Android's back):
  // paused, never lost. Leaving the page leaves full screen.
  useEffect(() => {
    const pause = () => {
      if (phaseNow.current === 'playing') goTo('paused');
    };
    const away = () => {
      if (document.hidden) pause();
    };
    const out = () => {
      if (!document.fullscreenElement) pause();
    };
    document.addEventListener('visibilitychange', away);
    document.addEventListener('fullscreenchange', out);
    return () => {
      document.removeEventListener('visibilitychange', away);
      document.removeEventListener('fullscreenchange', out);
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
    };
  }, [goTo]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      // Typing a name: the keys are letters, not the game's.
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, select')
      )
        return;
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

  /** Buttons and links on the tap area must not also jump. */
  const own = (event: PointerEvent) => event.stopPropagation();

  return (
    <>
      <SEO
        title={t('game.seoTitle')}
        description={t('game.seoDescription')}
        canonicalUrl={`${import.meta.env.BASE_URL}play`}
      />
      <div
        ref={areaRef}
        className={styles.area}
        onPointerDown={event => {
          if (event.button !== 0) return;
          swipe.current = {
            x: event.clientX,
            y: event.clientY,
            at: event.timeStamp,
          };
          press();
        }}
        // A swipe down slides (in the air: dives, then slides). On a turned
        // screen, down is towards the screen's left edge.
        onPointerMove={event => {
          const from = swipe.current;
          if (!from || event.timeStamp - from.at > SWIPE_MS) return;
          const down = window.matchMedia(UPRIGHT).matches
            ? from.x - event.clientX
            : event.clientY - from.y;
          if (down > SWIPE) {
            swipe.current = null;
            slide();
          }
        }}
        onPointerUp={() => {
          swipe.current = null;
          release();
          if (phaseNow.current === 'playing') landscape(areaRef.current);
        }}
        onPointerCancel={release}
        onContextMenu={event => event.preventDefault()}
      >
        <div className={styles.turn}>
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
              onClick={() => {
                togglePause();
                landscape(areaRef.current);
              }}
              aria-label={t(phase === 'paused' ? 'game.resume' : 'game.pause')}
            >
              {phase === 'paused' ? <Play /> : <Pause />}
            </button>
          )}
          {/* While the run is not going: the game's words, and the pages the
              sidebar or the nav bar would offer. */}
          {phase !== 'playing' && (
            <div
              className={cn(styles.menu, NAV_SURFACE_CLASS)}
              aria-live='polite'
            >
              <h1 className={styles.title}>{t('game.title')}</h1>
              {boardsOn && phase !== 'loading' && (
                <div onPointerDown={own}>
                  <SegmentedControl
                    label={t('game.menu')}
                    options={[
                      { value: 'game', label: t('game.tabGame') },
                      { value: 'board', label: t('game.tabBoard') },
                    ]}
                    value={tab}
                    onChange={setTab}
                  />
                </div>
              )}
              {tab === 'board' ? (
                <div onPointerDown={own}>
                  <SquirrelBoard route={route} onRoute={chooseRoute} />
                </div>
              ) : (
                <>
                  {phase === 'ready' && (
                    <>
                      <p className={styles.lead}>{t('game.start')}</p>
                      <p className={styles.hint}>{t('game.hint')}</p>
                    </>
                  )}
                  {phase === 'paused' && (
                    <p className={styles.lead}>{t('game.paused')}</p>
                  )}
                  {phase === 'over' && last && (
                    <p className={styles.lead}>
                      {t('game.over', { score: number(last.score) })}
                    </p>
                  )}
                  {bests[route] && (phase === 'ready' || phase === 'over') && (
                    <p className={styles.hint}>
                      {t('game.best', { score: number(bests[route].score) })}
                    </p>
                  )}
                  {phase === 'over' && rank && (
                    <p className={styles.hint}>{t('game.rank', { rank })}</p>
                  )}
                  {phase === 'over' && newBest && boardsOn && !playerName() && (
                    <button
                      type='button'
                      className={styles.signIn}
                      onPointerDown={own}
                      onClick={() => setTab('board')}
                    >
                      {t('game.addName')}
                    </button>
                  )}
                  {/* The next run's route: the classic journey or the stages
                  shuffled. Run again starts it, from a pause too. */}
                  {phase !== 'loading' && (
                    <div onPointerDown={own}>
                      <SegmentedControl
                        label={t('game.route')}
                        options={[
                          { value: 'classic', label: t('game.classic') },
                          { value: 'random', label: t('game.random') },
                        ]}
                        value={route}
                        onChange={chooseRoute}
                      />
                    </div>
                  )}
                  {(phase === 'paused' || phase === 'over') && (
                    <div className={styles.actions}>
                      {phase === 'paused' && (
                        <Button
                          onPointerDown={own}
                          onClick={() => {
                            goTo('playing');
                            landscape(areaRef.current);
                          }}
                        >
                          {t('game.resume')}
                        </Button>
                      )}
                      <Button
                        variant={phase === 'paused' ? 'secondary' : 'default'}
                        onPointerDown={own}
                        onClick={() => {
                          start();
                          landscape(areaRef.current);
                        }}
                      >
                        {t('game.again')}
                      </Button>
                      {phase === 'over' && (
                        <Button
                          variant='secondary'
                          onPointerDown={own}
                          onClick={share}
                        >
                          {t('game.share')}
                        </Button>
                      )}
                    </div>
                  )}
                  <nav className={styles.pages}>
                    {navItems(currentSpace(pathname), i18n.language).map(
                      item => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.url}
                            to={item.url}
                            reloadDocument={item.reloadDocument}
                            className={styles.link}
                            onPointerDown={own}
                          >
                            <Icon aria-hidden />
                            <span>{tNav(item.label)}</span>
                          </Link>
                        );
                      }
                    )}
                  </nav>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

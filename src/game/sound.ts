/**
 * The game's sounds, made in the browser (Web Audio): no files, no licences.
 * Soft and short, like Alto's: a hop, a pluck for each find (climbing a
 * pentatonic scale as a combo grows), a chime for a treat, a thud for a knock.
 *
 * The sim never sees this file: after each tick the page hands over what the
 * game was before it (`before`), and the sounds follow from what changed.
 * Browsers start audio only from a tap or a key, so wake() is called from one.
 */
import { STAGES } from './stages';
import type { Game } from './sim';

const SOUND = 'squirrel-sound';
const VOLUME = 0.6;
/** The music under the effects, and softer still in the menu. */
const MUSIC = 0.35;

/*
 * The music: a piano piece played here, note by note, in the manner of
 * Einaudi (broken chords over a bass, a sparse tune), on an upright piano
 * sampled by Simon Dalzell of Ivy Audio for Versilian Studios' VSCO 2
 * Community Edition (CC0; credit encouraged): a sample every four semitones,
 * A1 to C#6, 4 s each, mono. The run's pace sets its tempo.
 */
const PIANO = import.meta.glob<string>('../assets/game/music/piano/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let musicGain: GainNode | null = null;
let musicLoading = false;
/** The piano: its samples by MIDI note, where it plays, its clock. */
const keys = new Map<number, AudioBuffer>();
let piano: GainNode | null = null;
let clock = 0;
let nextAt = 0;
let step = 0;
/** The run's speed, for the tempo. */
let pace = 3.4;
let on = (() => {
  try {
    return localStorage.getItem(SOUND) !== 'off';
  } catch {
    return true;
  }
})();

export const soundOn = () => on;

export function setSoundOn(next: boolean) {
  on = next;
  try {
    localStorage.setItem(SOUND, next ? 'on' : 'off');
  } catch {
    // Blocked storage: the choice lasts this visit.
  }
  if (master) master.gain.value = on ? VOLUME : 0;
  if (on) void startMusic();
}

/** The audio, started from a tap or a key (and resumed after the tab slept). */
export function wake() {
  if (!ctx) {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Context) return;
    ctx = new Context();
    master = ctx.createGain();
    master.gain.value = on ? VOLUME : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  if (on) void startMusic();
}

/** The music, faded in: fetched the first time sound is on. */
async function startMusic() {
  if (!ctx || !master || musicGain || musicLoading) return;
  musicLoading = true;
  try {
    await startPiano();
  } catch {
    // No music (offline, say): the effects play on.
  } finally {
    musicLoading = false;
  }
}

/** The music's own level, faded in from silence. */
function fadeIn() {
  if (!ctx || !master) return null;
  musicGain = ctx.createGain();
  musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  musicGain.gain.exponentialRampToValueAtTime(MUSIC, ctx.currentTime + 2);
  musicGain.connect(master);
  return musicGain;
}

async function startPiano() {
  await Promise.all(
    Object.entries(PIANO).map(async ([path, url]) => {
      const midi = Number(path.match(/(\d+)\.mp3$/)?.[1]);
      const data = await (await fetch(url)).arrayBuffer();
      if (ctx) keys.set(midi, await ctx.decodeAudioData(data));
    })
  );
  if (!ctx) return;
  const out = fadeIn();
  if (!out) return;
  // A little room around the piano: decaying noise as its echo.
  const length = ctx.sampleRate * 2;
  const echo = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = echo.getChannelData(c);
    for (let i = 0; i < length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  const room = ctx.createConvolver();
  room.buffer = echo;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  piano = ctx.createGain();
  // Set against recorded music evened out at -20 LUFS.
  piano.gain.value = 1.5;
  piano.connect(out);
  piano.connect(room).connect(wet).connect(out);
  nextAt = ctx.currentTime + 0.1;
  step = 0;
  clock = window.setInterval(schedule, 50);
}

/** An eighth note, s: 70 beats a minute at a stroll, 84 at full speed. */
const eighth = () =>
  30 / (70 + 14 * Math.min(1, Math.max(0, (pace - 3.4) / 3.6)));

/** The notes due in the next fifth of a second, on the audio clock. */
function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05;
  while (nextAt < ctx.currentTime + 0.2) {
    score(step++, nextAt);
    nextAt += eighth();
  }
}

/** A minor's four chords, a bar each: its bass and fifth, and the broken
 *  chord the right hand plays in eighths, up and back down. */
const CHORDS = [
  { bass: [45, 52], arc: [57, 64, 69, 72, 76, 72, 69, 64] }, // Am
  { bass: [41, 48], arc: [53, 60, 65, 69, 72, 69, 65, 60] }, // F
  { bass: [48, 55], arc: [55, 60, 64, 67, 72, 67, 64, 60] }, // C
  { bass: [43, 50], arc: [55, 62, 67, 71, 74, 71, 67, 62] }, // G
];
/** The tune over eight bars: [bar, eighth, note, eighths held]. */
const TUNE: [number, number, number, number][] = [
  [0, 0, 76, 6],
  [0, 6, 74, 2],
  [1, 0, 72, 8],
  [2, 0, 67, 4],
  [2, 4, 72, 4],
  [3, 0, 71, 6],
  [3, 6, 74, 2],
  [4, 0, 76, 4],
  [4, 4, 79, 4],
  [5, 0, 77, 6],
  [5, 6, 76, 2],
  [6, 0, 76, 4],
  [6, 4, 74, 4],
  [7, 0, 74, 8],
];

/** One eighth of the piece. In 32 bars: the chords alone, the tune twice
 *  over them, then the chords alone and softer, and round again. */
function score(n: number, at: number) {
  const bar = Math.floor(n / 8);
  const e = n % 8;
  const chord = CHORDS[bar % 4];
  const part = Math.floor(bar / 8) % 4;
  const soft = part === 3 ? 0.75 : 1;
  // A hand is never quite on the grid.
  const loose = () => at + (Math.random() - 0.5) * 0.012;
  key(
    chord.arc[e],
    loose(),
    (e === 0 ? 0.5 : 0.34 + Math.random() * 0.08) * soft,
    4
  );
  if (e === 0) key(chord.bass[0], at, 0.6 * soft, 8);
  if (e === 4 && part !== 3) key(chord.bass[1], loose(), 0.38, 4);
  if (part === 1 || part === 2)
    for (const [b, when, note, held] of TUNE)
      if (b === bar % 8 && when === e) key(note, loose(), 0.72, held);
}

/** One key: its nearest sample, tuned; softer is darker; let go after
 *  `held` eighths. */
function key(midi: number, at: number, velocity: number, held: number) {
  if (!ctx || !piano) return;
  let near = 0;
  for (const k of keys.keys())
    if (Math.abs(k - midi) < Math.abs(near - midi)) near = k;
  const buffer = keys.get(near);
  if (!buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 2 ** ((midi - near) / 12);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 1400 + velocity * 7000;
  const gain = ctx.createGain();
  gain.gain.value = velocity;
  const end = at + held * eighth();
  gain.gain.setTargetAtTime(0, end, 0.15);
  source.connect(tone).connect(gain).connect(piano);
  source.start(at);
  source.stop(end + 1);
}

/** The music full while the run goes, softer in the menu. */
export function musicLevel(running: boolean) {
  if (ctx && musicGain)
    musicGain.gain.setTargetAtTime(
      running ? MUSIC : MUSIC * 0.5,
      ctx.currentTime,
      0.4
    );
}

/** Away from the tab: quiet until the next tap. */
export const sleep = () => void ctx?.suspend();

/** Leaving the game: all sound ends. */
export function stopAudio() {
  window.clearInterval(clock);
  void ctx?.close();
  ctx = master = musicGain = piano = null;
  noiseBuffer = null;
  keys.clear();
}

interface Tone {
  at?: number;
  length?: number;
  type?: OscillatorType;
  /** Where the pitch slides to by the end. */
  glide?: number;
  volume?: number;
}

function tone(
  freq: number,
  { at = 0, length = 0.12, type = 'sine', glide, volume = 0.3 }: Tone = {}
) {
  if (!ctx || !master || !on) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** A breath of filtered noise: a thud, a slide, a smash. */
function noise(length: number, volume: number, from: number, to: number) {
  if (!ctx || !master || !on) return;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = noiseBuffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + length);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  source.connect(filter).connect(gain).connect(master);
  source.start(t);
  source.stop(t + length);
}

/** Steps of a major pentatonic scale from C5: a combo climbs it. */
const note = (step: number) =>
  523.25 * 2 ** (([0, 2, 4, 7, 9][step % 5] + 12 * Math.floor(step / 5)) / 12);

/** A find, plucked: a sine with a soft octave above. */
const pluck = (step: number, at = 0, volume = 0.2) => {
  tone(note(step), { at, length: 0.22, volume });
  tone(note(step) * 2, { at, length: 0.12, volume: volume / 4 });
};

const arpeggio = (steps: number[], gap: number, volume: number) =>
  steps.forEach((step, i) => pluck(step, i * gap, volume));

/** What the game was before a tick: the sounds come from what changed. */
export interface Before {
  grounded: boolean;
  doubleUsed: boolean;
  lives: number;
  falling: boolean;
  slideUntil: number;
  sickUntil: number;
  riding: boolean;
  over: boolean;
}

export const before = (g: Game): Before => ({
  grounded: g.grounded,
  doubleUsed: g.doubleUsed,
  lives: g.lives,
  falling: g.falling,
  slideUntil: g.slideUntil,
  sickUntil: g.sickUntil,
  riding: Boolean(g.ride),
  over: g.over,
});

const isRare = (stage: string, art: string) =>
  STAGES.find(s => s.id === stage)?.pickups?.[1] === art;

/** The sounds of one tick. */
export function sounds(was: Before, g: Game) {
  pace = g.speed;
  if (!ctx || !on) return;
  if (!was.doubleUsed && g.doubleUsed)
    tone(440, { glide: 990, length: 0.14, type: 'triangle', volume: 0.16 });
  else if (was.grounded && !g.grounded && g.vy > 0)
    tone(300, { glide: 560, length: 0.09, type: 'triangle', volume: 0.14 });
  if (!was.grounded && g.grounded) noise(0.05, 0.06, 700, 200);
  if (g.slideUntil > was.slideUntil) noise(0.2, 0.08, 3000, 700);
  if (!was.falling && g.falling)
    tone(700, { glide: 150, length: 0.5, type: 'triangle', volume: 0.14 });
  if (g.lives < was.lives) {
    tone(170, { glide: 60, length: 0.28, volume: 0.32 });
    noise(0.12, 0.16, 1200, 200);
  }
  if (g.sickUntil > was.sickUntil) {
    tone(300, { glide: 190, length: 0.45, type: 'sawtooth', volume: 0.05 });
    tone(306, { glide: 196, length: 0.45, type: 'sawtooth', volume: 0.05 });
  }
  if (!was.riding && g.ride) arpeggio([0, 2, 4, 5, 7], 0.06, 0.18);
  for (const t of g.things) {
    if (t.hit !== g.tick) continue;
    if (t.kind === 'pickup') {
      if (isRare(t.stage, t.art)) arpeggio([5, 7], 0.08, 0.2);
      else pluck(Math.min(g.combo - 1, 12));
    } else if (t.kind === 'egg') arpeggio([0, 2, 4, 5], 0.09, 0.2);
    else if (t.kind === 'trap' && g.ride) noise(0.16, 0.22, 3000, 300);
  }
  if (!was.over && g.over) arpeggio([7, 4, 2, 0], 0.16, 0.16);
}

/**
 * The game's sounds, made in the browser (Web Audio): no files, no licences.
 * Soft and short: a hop, a pluck for each find (climbing a
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
 * The music, CC0 from OpenGameArt (no credit needed; given anyway):
 * "Forget Me Not" by Kistol, "Another August" by cynicmusic (The Cynic
 * Project, pixelsphere.org) and "JRPG Piano" by Joth, made mono, 80 kbps and
 * evened out in loudness.
 * ponytail: three until Loris picks one (/play?music=1|2|3); the rest go then.
 */
const TRACKS = import.meta.glob<string>('../assets/game/music/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});
const CHOICES = ['forget-me-not', 'another-august', 'jrpg-piano'];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let music: AudioBufferSourceNode | null = null;
let musicGain: GainNode | null = null;
let musicLoading = false;
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

/** One calm track, looped, faded in: fetched the first time sound is on. */
async function startMusic() {
  if (!ctx || !master || music || musicLoading) return;
  const pick = Number(new URLSearchParams(window.location.search).get('music'));
  const name = CHOICES[pick - 1] ?? CHOICES[0];
  const url = Object.entries(TRACKS).find(([path]) =>
    path.endsWith(`/${name}.mp3`)
  )?.[1];
  if (!url) return;
  musicLoading = true;
  try {
    const data = await (await fetch(url)).arrayBuffer();
    const buffer = await ctx.decodeAudioData(data);
    if (!ctx || !master) return; // left the page meanwhile
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    musicGain = ctx.createGain();
    musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicGain.gain.exponentialRampToValueAtTime(MUSIC, ctx.currentTime + 2);
    source.connect(musicGain).connect(master);
    source.start();
    music = source;
  } catch {
    // No music (offline, say): the effects play on.
  } finally {
    musicLoading = false;
  }
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
  music?.stop();
  void ctx?.close();
  ctx = master = musicGain = music = null;
  noiseBuffer = null;
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

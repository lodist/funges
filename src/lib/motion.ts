/**
 * Motion (#225) — the JS half of the motion scale.
 *
 * framer-motion cannot read a CSS custom property, so the durations and the
 * easing curve have to exist a second time as numbers. Before this file they
 * existed a *fifth* time: four call sites each spelled the value out with a
 * comment promising it mirrored `--transition-duration-*`, and one of those
 * promises was already false. Now there is one copy, and
 * `src/test/motion.test.ts` fails if it drifts from `src/index.css`.
 *
 * Seconds, because that is framer-motion's unit. The CSS side is the source
 * of truth; these follow it.
 */

/** `--transition-duration-fast` (150ms). Hover and press micro-interactions. */
export const DURATION_FAST = 0.15;

/** `--transition-duration-base` (200ms). The default for ordinary state changes. */
export const DURATION_BASE = 0.2;

/** `--transition-duration-slow` (300ms). Large surfaces covering real distance. */
export const DURATION_SLOW = 0.3;

/** `--ease-standard` — `cubic-bezier(0.4, 0, 0.2, 1)` as framer-motion's array form. */
export const EASE_STANDARD = [0.4, 0, 0.2, 1] as const;

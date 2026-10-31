/**
 * The landing's deep-green band, reused by the app pages that lead with
 * today: Worth Foraging Now's top pick, the Species season line and the
 * Recipes hero. One constant, so the three cannot drift apart.
 *
 * The band is `--band`: happy-900 in Terra, its own terracotta in Huerta,
 * whose deepest step is too dark for a band (index.css, the space blocks).
 * `--ring` (`--happy-700`) reads 1.9:1 on Terra's band, so the band re-points
 * it to the step the landing's forecast band uses. The band is the same in
 * both themes, so a happy-50 wash on it is too: those washes carry `dark:`
 * twins that repeat the light value, which is what theme-blind-fill.test.ts
 * asks a call site to say.
 */
export const BAND_SURFACE_CLASS =
  'bg-band text-band-foreground [--ring:var(--happy-100)]';

/** `outline` paints its stroke and label in --primary-text, which vanishes
 *  on the band; happy-100 holds the same stroke there. */
export const BAND_OUTLINE_CLASS =
  'border-happy-100 text-happy-50 hover:bg-happy-50/10 hover:text-happy-50 dark:bg-transparent dark:hover:bg-happy-50/10 dark:hover:text-happy-50';

/** `ghost` on the band: a cream label; on hover a faint cream wash and the
 *  label in the map dock's light green. */
export const BAND_GHOST_CLASS =
  'text-happy-50 hover:bg-happy-50/10 hover:text-happy-300 dark:hover:bg-happy-50/10 dark:hover:text-happy-300';

/** A pressed or current control on the band: a cream chip, like the map dock's
 *  chosen day. */
export const BAND_ACTIVE_CLASS =
  'bg-happy-50 text-happy-900 hover:bg-happy-50 hover:text-happy-900 dark:bg-happy-50 dark:text-happy-900 dark:hover:bg-happy-50 dark:hover:text-happy-900';

/** A button that wears the band itself, floating over the map with the rest of
 *  its green chrome (the language pill). */
export const BAND_BUTTON_CLASS =
  'border-band bg-band text-band-foreground [--ring:var(--happy-100)] hover:bg-happy-700 hover:text-happy-50';

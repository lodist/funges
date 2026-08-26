/**
 * The brand typefaces, self-hosted via `@fontsource` so `--font-sans`,
 * `--font-display` and `--font-mono` render the real faces instead of falling
 * back to system fonts. Nothing is fetched from a font CDN, which is what lets
 * typography survive the offline path intact.
 *
 * This module exists because the list used to live in two places —
 * `src/main.tsx` and `.storybook/preview.tsx` — kept in sync by hand. That
 * comment was in the code, and the drift it predicted happened the first time
 * the list changed: removing Merriweather at #225 broke all 31 story files,
 * because the application entrypoint was updated and the Storybook preview was
 * not. One import list, two importers.
 *
 * Space Grotesk ships no 400: its lightest real weight is 500, so
 * `font-normal` on the display face silently resolves to 500 (CSS Fonts 4
 * §5.2 checks 500 first for a desired weight of 400). Don't add a 400 import
 * expecting a lighter heading — there isn't one.
 */
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/source-code-pro/400.css';

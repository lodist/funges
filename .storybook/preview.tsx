import type { Preview } from '@storybook/tanstack-react';
// The brand typefaces. These live in src/lib/fonts.ts, which the application
// entrypoint also imports: Storybook never loads main.tsx, so without this
// every story renders in fallback system fonts and misrepresents the very
// typography the design system settled (#203).
import '../src/lib/fonts';
import '../src/index.css';
// Imported after index.css on purpose — it undoes the app's no-scroll body.
import './preview.css';
import { withI18n, withTheme } from '@/storybook/decorators';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'error' — axe violations fail the build. The Storybook Vitest project
      // runs in CI (see the Makefile's ci-check target), so this is a real
      // gate across every primitive rather than a report nobody reads.
      test: 'error',
    },

    options: {
      // Atomic-design order, matching the taxonomy in CONTEXT.md's glossary.
      // The tier lives in each story's title, not in the directory layout, so
      // moving a component between tiers is a one-line change.
      storySort: {
        order: ['Foundations', 'Atoms', 'Molecules'],
      },
    },
  },

  // A toolbar global rather than a light/dark story pair: duplicating every
  // story to show both themes doubles the surface without documenting
  // anything the toggle doesn't.
  globalTypes: {
    theme: {
      description: 'Light or dark theme',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },

  initialGlobals: {
    theme: 'light',
  },

  decorators: [withTheme, withI18n],
};

export default preview;

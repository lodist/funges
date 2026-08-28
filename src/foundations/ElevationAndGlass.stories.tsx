import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

/**
 * Foundations specimens for the elevation levels and the two glass variants.
 *
 * These moved here from the Card story, where #200 had to attach them for want
 * of a foundations tier. They document a token system, not a component, and a
 * card was never the right place for them.
 *
 * Nothing here asserts on token values — no rgba strings, no cubic-beziers.
 * That would test implementation detail and break on every retune. What is
 * asserted is that the surfaces render and that the interactive one actually
 * declares a transition.
 */

const meta: Meta = {
  // The specimens are documentation, not components: `!dev` keeps them out of
  // the sidebar as standalone entries so the tier reads as six prose pages,
  // which is what the spec asked Foundations to be. The `test` tag is
  // untouched, so they still run in the Storybook Vitest project, and the
  // `.mdx` page still renders each one via `<Story of={...} />`.
  tags: ['!dev'],
  title: 'Foundations/Elevation and glass',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Five semantic elevation levels and two glass variants, with the rules for where each is allowed.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Renders children twice: once in the light theme, once inside `.dark`. */
const ThemeMatrix = ({ children }: { children: React.ReactNode }) => (
  <div className='grid grid-cols-1 gap-0 sm:grid-cols-2'>
    <div className='bg-background text-foreground flex flex-col gap-6 p-8'>
      <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
        {'Light'}
      </p>
      {children}
    </div>
    <div className='dark bg-background text-foreground flex flex-col gap-6 p-8'>
      <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
        {'Dark'}
      </p>
      {children}
    </div>
  </div>
);

const ELEVATION_LEVELS = [
  {
    name: 'base',
    className: '',
    blurb: 'The map canvas. No shadow, no glass — not a discrete surface.',
  },
  {
    name: 'raised-subtle',
    className: 'elevation-raised-subtle',
    blurb: 'Lightweight input chrome: search field, Select trigger.',
  },
  {
    name: 'raised',
    className: 'elevation-raised',
    blurb: 'Small static chrome: Card, AppSidebar, MobileNavbar.',
  },
  {
    name: 'floating',
    className: 'elevation-floating',
    blurb: 'Dismiss-by-tap-outside overlays: Sheet, Popover, DropdownMenu.',
  },
  {
    name: 'overlay',
    className: 'elevation-overlay',
    blurb: 'Blocking Dialogs with a scrim. Always opaque, never glass.',
  },
] as const;

const Surface = ({
  name,
  className,
  blurb,
}: {
  name: string;
  className: string;
  blurb: string;
}) => (
  <div className={`bg-card rounded-xl p-4 ${className}`}>
    <p className='font-mono text-sm'>{name}</p>
    <p className='text-muted-foreground mt-1 text-xs'>{blurb}</p>
  </div>
);

export const ElevationLevels: Story = {
  render: () => (
    <ThemeMatrix>
      {ELEVATION_LEVELS.map(level => (
        <Surface
          key={level.name}
          name={level.name}
          className={level.className}
          blurb={level.blurb}
        />
      ))}
    </ThemeMatrix>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The five semantic elevation levels, in both themes. Dark mode leans on a 1px inset highlight for depth, because a black drop shadow is invisible against a dark background.',
      },
    },
  },
};

/**
 * Glass needs something textured behind it to read as translucent, so both
 * glass stories sit on a striped backdrop standing in for the map canvas.
 */
const MapBackdrop = ({ children }: { children: React.ReactNode }) => (
  <div
    className='flex min-h-[220px] items-center justify-center rounded-xl p-8'
    style={{
      // Axe cannot infer a reliable backdrop color through a translucent
      // surface and an image/gradient alone. The theme-aware solid fallback
      // also keeps the specimen legible if the gradient is unavailable.
      backgroundColor: 'var(--background)',
      backgroundImage:
        // Two steps of the one hue. These were hue 147 and 165 — two angles the
        // palette does not have, in the design system's own documentation.
        'repeating-linear-gradient(45deg, oklch(0.72 0.11 150) 0 18px, oklch(0.62 0.13 150) 18px 36px)',
    }}
  >
    {children}
  </div>
);

export const GlassRegular: Story = {
  render: () => (
    <ThemeMatrix>
      <MapBackdrop>
        <div className='glass-regular elevation-raised rounded-xl px-6 py-4'>
          <p className='font-mono text-sm'>{'glass-regular'}</p>
          <p className='text-muted-foreground mt-1 text-xs'>
            {'Text stays legible. This is the default glass.'}
          </p>
        </div>
      </MapBackdrop>
    </ThemeMatrix>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The `glass-regular` variant at the `raised` level, over a stand-in map backdrop. Opt-in per component and restricted to small fixed-size chrome.',
      },
    },
  },
};

export const GlassClear: Story = {
  render: () => (
    <ThemeMatrix>
      <MapBackdrop>
        <div className='glass-clear elevation-raised rounded-xl px-6 py-4'>
          <p className='font-mono text-sm'>{'glass-clear'}</p>
          <p className='mt-1 text-xs'>
            {'Markedly more transparent. Media only, never body copy.'}
          </p>
        </div>
      </MapBackdrop>
    </ThemeMatrix>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The `glass-clear` variant — markedly more transparent, and reserved for full-bleed media. Never place text-heavy, contrast-critical content on it.',
      },
    },
  },
};

export const GlassInteractive: Story = {
  render: () => (
    <MapBackdrop>
      <div
        data-testid='glass-interactive'
        className='glass-regular elevation-interactive rounded-xl px-6 py-4'
      >
        <p className='font-mono text-sm'>{'elevation-interactive'}</p>
        <p className='text-muted-foreground mt-1 text-xs'>
          {'Hover and press me — the escalation rides the motion tokens.'}
        </p>
      </div>
    </MapBackdrop>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Exercises the motion tokens through real hover and press behaviour on a `raised` glass surface.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const surface = canvas.getByTestId('glass-interactive');

    await expect(surface).toBeInTheDocument();

    // The transition itself is what the motion tokens drive, so assert the
    // element actually declares one rather than pinning the literal ms value.
    // The accessibility override intentionally removes it for reduced motion.
    const transition = getComputedStyle(surface).transitionDuration;
    await expect(transition).not.toBe('');
    const previewWindow = canvasElement.ownerDocument.defaultView;
    if (previewWindow?.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await expect(transition).toBe('0s');
    } else {
      await expect(transition).not.toBe('0s');
    }

    await userEvent.hover(surface);
    await expect(surface).toBeVisible();

    await userEvent.click(surface);
    await expect(surface).toBeVisible();

    await userEvent.unhover(surface);
  },
};

/** The matrix: every level against both glass variants and plain card. */
export const AllSurfaces: Story = {
  render: () => (
    <MapBackdrop>
      <div className='grid grid-cols-1 gap-6 sm:grid-cols-3'>
        {(['bg-card', 'glass-regular', 'glass-clear'] as const).map(surface => (
          <div key={surface} className='flex flex-col gap-4'>
            <p className='font-mono text-xs text-white'>{surface}</p>
            {ELEVATION_LEVELS.map(level => (
              <div
                key={level.name}
                className={`rounded-xl px-4 py-3 ${surface} ${level.className}`}
              >
                <p className='font-mono text-xs'>{level.name}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </MapBackdrop>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Every elevation level against each surface treatment. Note that the bottom two rows of the glass columns are combinations the rules disallow — they are shown so the disallowed pairing is recognisable, not as a licence to use them.',
      },
    },
  },
};

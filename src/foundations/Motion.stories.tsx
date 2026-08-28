import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Button } from '@/components/ui/button';

/**
 * Foundations specimens for the motion scale.
 *
 * Three durations and one easing curve. The stories drive real transitions
 * rather than printing the millisecond values, because the thing worth
 * documenting is what 150ms versus 300ms actually feels like.
 */

const meta: Meta = {
  // The specimens are documentation, not components: `!dev` keeps them out of
  // the sidebar as standalone entries so the tier reads as six prose pages,
  // which is what the spec asked Foundations to be. The `test` tag is
  // untouched, so they still run in the Storybook Vitest project, and the
  // `.mdx` page still renders each one via `<Story of={...} />`.
  tags: ['!dev'],
  title: 'Foundations/Motion',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Three durations, one easing curve, and what happens when the viewer asks for less motion.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const DURATIONS = [
  {
    token: '--transition-duration-fast',
    value: '150ms',
    use: 'Elevation hover and press micro-interactions.',
  },
  {
    token: '--transition-duration-base',
    value: '200ms',
    use: 'The canonical default. Ordinary UI state changes, Dialog enter/exit.',
  },
  {
    token: '--transition-duration-slow',
    value: '300ms',
    use: 'Large floating surfaces travelling a distance: Sheet.',
  },
];

/** A square that slides across on demand, so a duration can be felt. */
const Runner = ({ token }: { token: string }) => {
  const [moved, setMoved] = React.useState(false);

  return (
    <div className='flex flex-col gap-2'>
      <div className='bg-muted relative h-12 overflow-hidden rounded-xl'>
        <div
          className='bg-primary absolute top-2 size-8 rounded-lg'
          style={{
            transitionProperty: 'left',
            transitionDuration: `var(${token})`,
            transitionTimingFunction: 'var(--ease-standard)',
            left: moved ? 'calc(100% - 2.5rem)' : '0.5rem',
          }}
        />
      </div>
      <div className='flex items-center gap-3'>
        <Button size='sm' variant='outline' onClick={() => setMoved(m => !m)}>
          {'Run'}
        </Button>
        <p className='font-mono text-xs'>{token}</p>
      </div>
    </div>
  );
};

export const Durations: Story = {
  render: () => (
    <div className='flex max-w-2xl flex-col gap-8'>
      {DURATIONS.map(duration => (
        <div key={duration.token} className='flex flex-col gap-2'>
          <Runner token={duration.token} />
          <p className='text-muted-foreground text-sm'>
            {duration.value}
            {' — '}
            {duration.use}
          </p>
        </div>
      ))}
    </div>
  ),
};

export const Easing: Story = {
  render: () => (
    <div className='flex max-w-2xl flex-col gap-4'>
      <Runner token='--transition-duration-slow' />
      <p className='font-mono text-xs'>
        {'--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)'}
      </p>
      <p className='text-muted-foreground text-sm'>
        {
          'One curve, everywhere. It accelerates quickly and decelerates gently, which reads as a surface settling rather than snapping. There is no second easing token, and adding one is a design decision rather than a convenience.'
        }
      </p>
      <p className='text-muted-foreground text-sm'>
        {
          'The utilities are `ease-standard` and `duration-fast` / `duration-base` / `duration-slow`. The scale is registered under Tailwind’s `--transition-duration-*` namespace, so no arbitrary values are needed, and a bare `transition-colors` inherits both tokens through `--default-transition-duration` and `--default-transition-timing-function`.'
        }
      </p>
    </div>
  ),
};

export const ReducedMotion: Story = {
  render: () => (
    <div className='flex max-w-2xl flex-col gap-4'>
      <Runner token='--transition-duration-slow' />
      <p className='text-muted-foreground text-sm'>
        {
          'With prefers-reduced-motion set to reduce, a global rule collapses every animation and transition to 0.01ms rather than shortening it. The state change still lands — it just lands without the travel.'
        }
      </p>
      <p className='text-muted-foreground text-sm'>
        {
          "Collapsing rather than removing matters: a transition that never fires can leave a component wedged mid-state, whereas one that completes instantly cannot. The CSS rule covers CSS only: framer-motion writes inline transforms from JavaScript that no stylesheet can reach, so those are covered separately by MotionConfig reducedMotion='user' in __root.tsx. To see it, set the preference in the OS or in the browser devtools rendering panel and press Run again."
        }
      </p>
    </div>
  ),
};

/** The matrix: all three durations racing on one easing curve. */
export const AllDurations: Story = {
  render: () => {
    const AllRunners = () => {
      const [moved, setMoved] = React.useState(false);

      return (
        <div className='flex max-w-2xl flex-col gap-4'>
          {DURATIONS.map(duration => (
            <div key={duration.token} className='flex flex-col gap-1'>
              <div className='bg-muted relative h-10 overflow-hidden rounded-xl'>
                <div
                  className='bg-primary absolute top-1.5 size-7 rounded-lg'
                  style={{
                    transitionProperty: 'left',
                    transitionDuration: `var(${duration.token})`,
                    transitionTimingFunction: 'var(--ease-standard)',
                    left: moved ? 'calc(100% - 2.25rem)' : '0.375rem',
                  }}
                />
              </div>
              <p className='text-muted-foreground font-mono text-xs'>
                {duration.token}
                {' · '}
                {duration.value}
              </p>
            </div>
          ))}
          <Button
            size='sm'
            variant='outline'
            className='self-start'
            onClick={() => setMoved(m => !m)}
          >
            {'Run all'}
          </Button>
        </div>
      );
    };

    return <AllRunners />;
  },
  parameters: {
    docs: {
      description: {
        story:
          'All three durations started together, so the difference between them is visible rather than described.',
      },
    },
  },
};

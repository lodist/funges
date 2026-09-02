import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';

/**
 * Sonner is documented at a deliberately reduced bar: trigger stories rather
 * than a story per state.
 *
 * The component is imperative and renders nothing until a toast fires — a
 * `<Toaster />` on its own is an empty region, so there is no static surface to
 * enumerate variants against. What is documented instead is how to fire each
 * kind of toast, with the buttons that do it.
 */

const meta: Meta<typeof Toaster> = {
  title: 'Atoms/Sonner',
  component: Toaster,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Transient notifications. Mount one `Toaster` near the application root and call `toast()` from anywhere — the component takes no children and holds no state you pass it. Because a toast disappears, never put anything in one that the reader may need to act on later.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    position: {
      control: { type: 'select' },
      options: [
        'top-left',
        'top-center',
        'top-right',
        'bottom-left',
        'bottom-center',
        'bottom-right',
      ],
      description: 'Which corner toasts stack in',
    },
    richColors: {
      control: { type: 'boolean' },
      description:
        'Tint success, error and warning toasts by kind rather than rendering them all on the popover surface',
    },
    closeButton: {
      control: { type: 'boolean' },
      description: 'Render a dismiss button on every toast',
    },
    duration: {
      control: { type: 'number' },
      description: 'Milliseconds before a toast auto-dismisses',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <>
      <Toaster {...args} />
      <Button variant='outline' onClick={() => toast('Region saved')}>
        {'Fire a toast'}
      </Button>
    </>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The `Toaster` is the host; the button is what actually produces a toast. Both are needed for anything to be visible.',
      },
    },
  },
};

export const AllVariants: Story = {
  render: () => (
    <>
      <Toaster closeButton />
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => toast('Region saved')}
        >
          {'Default'}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => toast.success('Offline maps ready')}
        >
          {'Success'}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => toast.error('Could not reach the forecast service')}
        >
          {'Error'}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => toast.warning('Only 40 MB of storage left')}
        >
          {'Warning'}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => toast.info('Forecast updated three minutes ago')}
        >
          {'Info'}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() =>
            toast('Region saved', {
              description: 'North slope, 24 MB cached for offline use.',
            })
          }
        >
          {'With description'}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() =>
            toast('Region removed', {
              action: { label: 'Undo', onClick: () => toast('Restored') },
            })
          }
        >
          {'With action'}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() =>
            toast.promise(new Promise(resolve => setTimeout(resolve, 1500)), {
              loading: 'Downloading tiles…',
              success: 'Download complete',
              error: 'Download failed',
            })
          }
        >
          {'Promise'}
        </Button>
      </div>
    </>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Every kind of toast the library fires, as one row of triggers — the matrix for an imperative component. `toast.promise` is the one worth knowing about: it swaps its own message as the promise settles, so a caller does not have to fire three separate toasts.',
      },
    },
  },
};

export const WithRichColors: Story = {
  render: () => (
    <>
      <Toaster richColors closeButton />
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => toast.success('Offline maps ready')}
        >
          {'Success'}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => toast.error('Could not reach the forecast service')}
        >
          {'Error'}
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => toast.warning('Only 40 MB of storage left')}
        >
          {'Warning'}
        </Button>
      </div>
    </>
  ),
  parameters: {
    docs: {
      description: {
        story:
          '`richColors` tints each kind rather than rendering them all on the popover surface. Note that these tints are the library’s own — they do not come from the project palette, which is the trade-off for turning it on.',
      },
    },
  },
};

export const Positions: Story = {
  render: () => (
    <>
      <Toaster position='top-center' />
      <Button
        variant='outline'
        onClick={() => toast('Top-centre, rather than the default corner')}
      >
        {'Fire a toast'}
      </Button>
    </>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Position is a property of the `Toaster`, not of an individual toast — so it is an application-wide decision, made once.',
      },
    },
  },
};

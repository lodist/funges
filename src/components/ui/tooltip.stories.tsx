import type { Meta, StoryObj } from '@storybook/tanstack-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Info, Navigation, Plus, Minus } from '@/lib/icons';

const meta: Meta<typeof Tooltip> = {
  title: 'Atoms/Tooltip',
  component: Tooltip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A short label revealed on hover or focus. It is a supplement, never the only source of a name: tooltips never appear on touch, so a control whose meaning lives only in its tooltip is unlabelled on a phone. Give icon-only buttons an `aria-label` as well. Every tooltip needs a `TooltipProvider` above it — the app mounts one at the root, and these stories mount one as a decorator.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  argTypes: {
    defaultOpen: {
      control: { type: 'boolean' },
      description: 'Show the tooltip on mount, without hovering',
    },
    delayDuration: {
      control: { type: 'number' },
      description:
        'Milliseconds to wait before opening, overriding the provider for this one tooltip. Unset, it inherits the provider above — 300ms here, as in the app.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant='outline'>{'Hover me'}</Button>
      </TooltipTrigger>
      <TooltipContent>{'Recentre the map on your location'}</TooltipContent>
    </Tooltip>
  ),
};

export const Open: Story = {
  render: () => (
    <div className='pt-16'>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant='outline'>{'Already open'}</Button>
        </TooltipTrigger>
        <TooltipContent>{'Recentre the map on your location'}</TooltipContent>
      </Tooltip>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Forced open so the pill shape and arrow are visible without hovering.',
      },
    },
  },
};

export const OnIconButton: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size='icon' variant='outline' aria-label='Locate me'>
          <Navigation />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{'Locate me'}</TooltipContent>
    </Tooltip>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The canonical use. Note the `aria-label` duplicating the tooltip text — the tooltip is for sighted pointer users, the label is for everyone else.',
      },
    },
  },
};

export const WithLongText: Story = {
  render: () => (
    <div className='pt-24'>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant='outline' size='icon' aria-label='About confidence'>
            <Info />
          </Button>
        </TooltipTrigger>
        <TooltipContent className='max-w-56'>
          {
            'Confidence combines recent rainfall, soil temperature and how long since the last fruiting.'
          }
        </TooltipContent>
      </Tooltip>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The tooltip has no width constraint of its own, so a long one needs a `max-w-*`. At 224×92 it is a container and takes the 20px card corner; `rounded-full` would clamp to 46px here and read as a lozenge. Content this long is still usually a sign it belongs on the page.',
      },
    },
  },
};

export const NestedProvider: Story = {
  render: () => (
    <TooltipProvider delayDuration={0}>
      <div className='flex gap-2'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size='icon' variant='outline' aria-label='Zoom in'>
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{'Zoom in'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size='icon' variant='outline' aria-label='Zoom out'>
              <Minus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{'Zoom out'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size='icon' variant='outline' aria-label='Locate me'>
              <Navigation />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{'Locate me'}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A provider governs every tooltip beneath it: one delay, and one skip-delay window so moving between siblings in a toolbar does not restart the wait. Nesting a second provider overrides that delay for its subtree alone — the collapsed sidebar rail does exactly this, opening at 0ms because its labels are hidden and the tooltip is the only visible name. These three open instantly; every other story waits the root 300ms.',
      },
    },
  },
};

export const AllSides: Story = {
  render: () => (
    <div className='grid grid-cols-2 gap-12 p-20'>
      {(['top', 'right', 'bottom', 'left'] as const).map(side => (
        <div key={side} className='flex flex-col items-center gap-2'>
          <Tooltip defaultOpen>
            <TooltipTrigger asChild>
              <Button variant='outline' size='sm'>
                {side}
              </Button>
            </TooltipTrigger>
            <TooltipContent side={side}>{side}</TooltipContent>
          </Tooltip>
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: 'All four placements, open at once.',
      },
    },
  },
};

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
          'A short label revealed on hover or focus. It is a supplement, never the only source of a name: tooltips never appear on touch, so a control whose meaning lives only in its tooltip is unlabelled on a phone. Give icon-only buttons an `aria-label` as well.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    defaultOpen: {
      control: { type: 'boolean' },
      description: 'Show the tooltip on mount, without hovering',
    },
    delayDuration: {
      control: { type: 'number' },
      description:
        'Milliseconds to wait before opening. Defaults to 0 here, so the tooltip appears immediately.',
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
          'The pill has no width constraint of its own, so a long tooltip needs a `max-w-*`. Anything this long is usually a sign the content belongs on the page instead.',
      },
    },
  },
};

export const SharedProvider: Story = {
  render: () => (
    <TooltipProvider delayDuration={300}>
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
          'Each `Tooltip` wraps itself in a provider, so a group of them works with no setup. Wrapping the group in one explicit `TooltipProvider` is what buys the shared behaviour: a common delay, and skipping that delay once one tooltip in the group is already open.',
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

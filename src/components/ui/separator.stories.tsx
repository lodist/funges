import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Separator } from '@/components/ui/separator';

const meta: Meta<typeof Separator> = {
  title: 'Atoms/Separator',
  component: Separator,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A one-pixel rule between groups of content, and the last thing to reach for. Two sections that each open with a heading are already divided; the rule adds a line and no information. Decorative by default, and the default is almost always right.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: { type: 'radio' },
      options: ['horizontal', 'vertical'],
      description:
        'Which way the rule runs. A vertical separator needs a parent with a height, since it stretches to fill.',
    },
    decorative: {
      control: { type: 'boolean' },
      description:
        "When true (the default) the separator is hidden from assistive technology. `role='separator'` says a division exists without saying what is on either side, so on content that already has headings it is a second, poorer announcement of the same fact.",
    },
    className: {
      control: { type: 'text' },
      description: 'Additional CSS classes',
    },
  },
  args: {
    orientation: 'horizontal',
    decorative: true,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <div className='w-72'>
      <Separator {...args} />
    </div>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <div className='flex w-72 flex-col gap-4'>
      <p className='text-sm'>{'Chanterelles, ceps, hedgehog mushrooms.'}</p>
      <Separator />
      <p className='text-muted-foreground text-sm'>
        {'Updated from the forecast three hours ago.'}
      </p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className='flex h-10 items-center gap-4'>
      <span className='text-sm'>{'Species'}</span>
      <Separator orientation='vertical' />
      <span className='text-sm'>{'Recipes'}</span>
      <Separator orientation='vertical' />
      <span className='text-sm'>{'Data'}</span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A vertical separator stretches to its parent height, so the parent needs one — inside an `h-10` row it is 40px tall, inside an unsized div it collapses to nothing.',
      },
    },
  },
};

export const Semantic: Story = {
  render: () => (
    <div className='flex w-72 flex-col gap-4'>
      <p className='text-sm'>{'Foraging notes for this region.'}</p>
      <Separator decorative={false} />
      <p className='text-sm'>{'Legal restrictions and permits.'}</p>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "With `decorative={false}` the separator is exposed as a real separator role. Reach for it only where nothing else marks the division — if the section below deserves announcing, it deserves a heading, and the heading makes this redundant. Menus are the exception: inside `role='menu'` a separator is how ARIA groups items, so `DropdownMenuSeparator` is semantic without asking.",
      },
    },
  },
};

export const AllOrientations: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      <div className='flex w-72 flex-col gap-2'>
        <p className='text-muted-foreground font-mono text-xs'>
          {'horizontal · decorative'}
        </p>
        <Separator />
      </div>
      <div className='flex w-72 flex-col gap-2'>
        <p className='text-muted-foreground font-mono text-xs'>
          {'horizontal · semantic'}
        </p>
        <Separator decorative={false} />
      </div>
      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground font-mono text-xs'>
          {'vertical · decorative'}
        </p>
        <div className='flex h-10 items-center gap-4'>
          <span className='text-sm'>{'Left'}</span>
          <Separator orientation='vertical' />
          <span className='text-sm'>{'Right'}</span>
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Both orientations against both accessibility treatments.',
      },
    },
  },
};

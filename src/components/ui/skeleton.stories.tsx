import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const meta: Meta<typeof Skeleton> = {
  title: 'Atoms/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A pulsing placeholder for content that has not arrived. It has no size of its own — you give it the shape of whatever it stands in for, radius included, which is what stops the layout jumping when the real content lands. Wrap a set of them in `SkeletonGroup`: the pulse is a visual channel only, so the group is what announces the wait to a screen reader.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    className: {
      control: { type: 'text' },
      description:
        'Where the shape comes from. A skeleton with no size classes renders nothing visible.',
    },
  },
  args: {
    className: 'h-4 w-48',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TextLines: Story = {
  render: () => (
    <div className='flex w-72 flex-col gap-2'>
      <Skeleton className='h-4 w-full' />
      <Skeleton className='h-4 w-full' />
      <Skeleton className='h-4 w-2/3' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Standing in for a paragraph. The short last line is what makes it read as text rather than as a block.',
      },
    },
  },
};

export const Circle: Story = {
  render: () => <Skeleton className='size-12 rounded-full' />,
  parameters: {
    docs: {
      description: {
        story:
          'An avatar placeholder asks for `rounded-full` explicitly. The default is the small step, which is what a text line wants — the container radius used to be the default and CSS clamped it to a pill on anything under 40px tall, so a text line and a pill rendered identically.',
      },
    },
  },
};

export const Block: Story = {
  render: () => <Skeleton className='h-32 w-64 rounded-card' />,
  parameters: {
    docs: {
      description: {
        story:
          'Standing in for an image or a map tile. Card- and media-shaped placeholders ask for `rounded-card`, because they are the ones tall enough to render it.',
      },
    },
  },
};

export const CardPlaceholder: Story = {
  render: () => (
    <Card className='w-80'>
      <CardHeader className='gap-3'>
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-5 w-2/3' />
        <Skeleton className='h-4 w-full' />
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-4/5' />
      </CardContent>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The shape a loading list item should take: the same footprint as the loaded card, so nothing shifts on arrival.',
      },
    },
  },
};

export const Announced: Story = {
  render: () => (
    <SkeletonGroup className='flex w-72 flex-col gap-2'>
      <Skeleton className='h-4 w-full' />
      <Skeleton className='h-4 w-full' />
      <Skeleton className='h-4 w-2/3' />
    </SkeletonGroup>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The same three lines inside `SkeletonGroup`, which adds `role="status"`, `aria-busy` and a visually hidden message. Each rectangle is `aria-hidden`, so the region announces the wait once rather than once per shape. Pass `label` where the surface has a more specific message than the generic one.',
      },
    },
  },
};

export const AllShapes: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      {[
        { label: 'text line', className: 'h-4 w-48' },
        { label: 'heading', className: 'h-6 w-40' },
        { label: 'circle', className: 'size-12 rounded-full' },
        { label: 'pill', className: 'h-8 w-24 rounded-full' },
        { label: 'block', className: 'h-24 w-48 rounded-card' },
      ].map(shape => (
        <div key={shape.label} className='flex items-center gap-4'>
          <p className='text-muted-foreground w-24 font-mono text-xs'>
            {shape.label}
          </p>
          <Skeleton className={shape.className} />
        </div>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The shapes in use. Skeleton has no variants — the shape is entirely the caller’s, which is why there is a matrix of sizes rather than of props.',
      },
    },
  },
};

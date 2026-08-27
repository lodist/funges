import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';
import { Button } from './button';
import { Badge } from './badge';
import {
  Bookmark,
  Calendar,
  ChefHat,
  Clock,
  Leaf,
  MapPin,
  ScanSearch,
  Share,
  Sprout,
  Thermometer,
} from '@/lib/icons';

const meta: Meta<typeof Card> = {
  title: 'Atoms/Card',
  component: Card,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Paper surface at the raised elevation: 20px radius, no border, ' +
          '24px vertical padding, and horizontal padding owned by the ' +
          'regions. `interactive` adds the hover lift, `media` adds the clip ' +
          'that photo-bearing cards need, `surface="glass"` swaps the fill ' +
          'for the translucent chrome treatment.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    surface: {
      control: 'inline-radio',
      options: ['solid', 'glass'],
      description: 'Fill: opaque paper, or translucent chrome.',
    },
    padding: {
      control: 'inline-radio',
      options: ['content', 'none'],
      description: '`none` is for full-bleed media and self-padding bodies.',
    },
    interactive: {
      control: 'boolean',
      description: 'Hover lift. Only for cards that are themselves a target.',
    },
    media: {
      control: 'boolean',
      description: 'Clips children to the radius. Also clips focus rings.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <Card {...args} className='w-[350px]'>
      <CardHeader>
        <CardTitle>{'Yellowfoot chanterelle'}</CardTitle>
        <CardDescription>{'Craterellus tubaeformis'}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className='text-sm'>
          {'Damp conifer moss, often in troops. Hollow stem and a wavy, ' +
            'funnelled cap that darkens with age.'}
        </p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  name: 'With footer',
  render: args => (
    <Card {...args} className='w-[350px]'>
      <CardHeader>
        <CardTitle>{'Save this patch'}</CardTitle>
        <CardDescription>
          {'Kept on this device. Nothing is uploaded.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className='text-sm'>
          {'Two chanterelle finds within 40 m of each other.'}
        </p>
      </CardContent>
      <CardFooter className='gap-2 pt-6'>
        <Button variant='outline' className='flex-1'>
          {'Discard'}
        </Button>
        <Button className='flex-1'>{'Save'}</Button>
      </CardFooter>
    </Card>
  ),
};

// The footer button's focus ring must survive: an unconditional clip used to
// eat it, because the card has no padding below the footer.
export const FooterFocusRing: Story = {
  name: 'Footer focus ring',
  ...WithFooter,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole('button', { name: 'Save' });
    await userEvent.tab();
    save.focus();

    const card = canvasElement.querySelector('[data-slot=card]')!;
    await expect(getComputedStyle(card).overflow).toBe('visible');

    const cardBox = card.getBoundingClientRect();
    const buttonBox = save.getBoundingClientRect();
    // 2px ring at a 2px offset needs 4px of room outside the button.
    await expect(cardBox.bottom - buttonBox.bottom).toBeGreaterThanOrEqual(4);
  },
};

export const WithAction: Story = {
  name: 'With action',
  render: args => (
    <Card {...args} className='w-[350px]'>
      <CardHeader>
        <CardTitle>{'Hedgehog mushroom'}</CardTitle>
        <CardDescription>{'In season until late November'}</CardDescription>
        <CardAction>
          <Button variant='ghost' size='icon' aria-label='Bookmark'>
            <Bookmark />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className='text-sm'>
          {'Spines instead of gills. No lookalike worth worrying about.'}
        </p>
      </CardContent>
    </Card>
  ),
};

export const Interactive: Story = {
  args: { interactive: true },
  render: args => (
    <Card {...args} className='relative w-[350px]'>
      <CardHeader>
        <CardTitle>
          {/* Stretched to the card so the whole tile is one target. */}
          <a
            href='#species'
            className='focus-ring text-card-foreground rounded-sm after:absolute after:inset-0'
          >
            {'Wood blewit'}
          </a>
        </CardTitle>
        <CardDescription>{'Lepista nuda'}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className='text-sm'>
          {'The lift belongs to cards that are themselves a link or a button.'}
        </p>
      </CardContent>
    </Card>
  ),
};

export const Static: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The default. A card that holds a button is not itself a target, ' +
          'so it does not lift.',
      },
    },
  },
  render: args => (
    <Card {...args} className='w-[350px]'>
      <CardHeader>
        <CardTitle>{'Season summary'}</CardTitle>
        <CardDescription>{'September to November'}</CardDescription>
      </CardHeader>
      <CardContent className='grid grid-cols-3 gap-4 text-center'>
        {[
          { label: 'Finds', value: '128' },
          { label: 'Species', value: '17' },
          { label: 'Routes', value: '9' },
        ].map(stat => (
          <div key={stat.label}>
            <p className='text-2xl font-semibold'>{stat.value}</p>
            <p className='text-muted-foreground text-xs'>{stat.label}</p>
          </div>
        ))}
      </CardContent>
      <CardFooter className='pt-6'>
        <Button variant='outline' className='w-full'>
          {'Open the data page'}
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const WithMedia: Story = {
  name: 'With media',
  args: { padding: 'none', media: true },
  parameters: {
    docs: {
      description: {
        story:
          'Full-bleed photography: `padding="none"` lets the image reach the ' +
          'edges, `media` clips it to the radius. The body pads itself.',
      },
    },
  },
  render: args => (
    <Card {...args} className='w-[350px]'>
      <div className='bg-secondary text-muted-foreground flex h-40 items-center justify-center'>
        <Leaf className='size-10' />
      </div>
      <CardHeader className='pt-6'>
        <CardTitle>{'Wild garlic'}</CardTitle>
        <CardDescription>{'Allium ursinum'}</CardDescription>
      </CardHeader>
      <CardContent className='pb-6'>
        <p className='text-sm'>
          {'Broad leaves, unmistakable smell. Damp deciduous woodland.'}
        </p>
      </CardContent>
    </Card>
  ),
};

export const Glass: Story = {
  args: { surface: 'glass', padding: 'none' },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'Translucent chrome for small floating controls over the map. Not ' +
          'for large content cards: the fill has to stay readable.',
      },
    },
  },
  render: args => (
    <div className='from-happy-200 to-happy-500 flex h-64 items-center justify-center bg-gradient-to-br'>
      <Card {...args} className='w-[280px] px-4 py-3'>
        <div className='flex items-center gap-3'>
          <Thermometer className='size-5' />
          <div>
            <p className='text-sm font-semibold'>{'Good conditions'}</p>
            <p className='text-muted-foreground text-xs'>
              {'12 °C · rain 3 days ago'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  ),
};

export const SpeciesTile: Story = {
  name: 'Species tile',
  render: args => (
    <Card {...args} interactive className='relative w-[300px]'>
      <CardHeader>
        <div className='bg-secondary text-muted-foreground mb-2 flex size-20 items-center justify-center rounded-lg'>
          <Sprout className='size-8' />
        </div>
        <CardTitle>
          <a
            href='#species'
            className='focus-ring text-card-foreground rounded-sm after:absolute after:inset-0'
          >
            {'Penny bun'}
          </a>
        </CardTitle>
        <CardDescription>{'Boletus edulis'}</CardDescription>
        <CardAction>
          <Badge variant='secondary'>{'Edible'}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className='text-muted-foreground flex items-center gap-4 text-sm'>
        <span className='flex items-center gap-1.5'>
          <MapPin className='size-4' />
          {'2.4 km'}
        </span>
        <span className='flex items-center gap-1.5'>
          <Calendar className='size-4' />
          {'Aug–Oct'}
        </span>
      </CardContent>
    </Card>
  ),
};

export const RecipeTile: Story = {
  name: 'Recipe tile',
  render: args => (
    <Card {...args} className='w-[350px]'>
      <CardHeader>
        <CardTitle>{'Chanterelles on toast'}</CardTitle>
        <CardDescription>
          {'Four ingredients you already have.'}
        </CardDescription>
        <CardAction>
          <Button variant='ghost' size='icon' aria-label='Share'>
            <Share />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='text-muted-foreground flex items-center gap-4 text-sm'>
        <span className='flex items-center gap-1.5'>
          <Clock className='size-4' />
          {'15 min'}
        </span>
        <span className='flex items-center gap-1.5'>
          <ChefHat className='size-4' />
          {'Easy'}
        </span>
      </CardContent>
      <CardFooter className='pt-6'>
        <Button className='w-full'>{'Open recipe'}</Button>
      </CardFooter>
    </Card>
  ),
};

export const HeadingLevels: Story = {
  name: 'Heading levels',
  parameters: {
    docs: {
      description: {
        story:
          'The title is a real heading — `h3` by default, `as` picks the ' +
          'level so a card sits correctly in the page outline.',
      },
    },
  },
  render: args => (
    <div className='flex w-[350px] flex-col gap-4'>
      <Card {...args}>
        <CardHeader>
          <CardTitle as='h2' className='text-2xl'>
            {'Instructions'}
          </CardTitle>
          <CardDescription>{'Section heading, h2'}</CardDescription>
        </CardHeader>
      </Card>
      <Card {...args}>
        <CardHeader>
          <CardTitle className='text-lg'>{'Identifying a find'}</CardTitle>
          <CardDescription>{'Default, h3'}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  ),
};

export const Grid: Story = {
  parameters: { layout: 'padded' },
  render: args => (
    <div className='grid w-[760px] grid-cols-3 gap-4'>
      {[
        {
          title: 'Map',
          icon: MapPin,
          body: 'Where conditions are favourable.',
        },
        {
          title: 'Identify',
          icon: ScanSearch,
          body: 'From a photo, on device.',
        },
        { title: 'Recipes', icon: ChefHat, body: 'What to cook with a find.' },
      ].map(item => (
        <Card key={item.title} {...args}>
          <CardHeader>
            <item.icon className='text-muted-foreground mb-2 size-6' />
            <CardTitle>{item.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>{item.body}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
};

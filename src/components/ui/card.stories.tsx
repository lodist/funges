import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Heart, Share, Bookmark, Star, Calendar, MapPin } from 'lucide-react';

const meta: Meta<typeof Card> = {
  title: 'Atoms/Card',
  component: Card,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A flexible card component with header, content, and footer sections. Perfect for displaying content in a structured layout.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    className: {
      control: { type: 'text' },
      description: 'Additional CSS classes',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic Card Examples
export const Default: Story = {
  render: () => (
    <Card className='w-[350px]'>
      <CardHeader>
        <CardTitle>{'Card Title'}</CardTitle>
        <CardDescription>
          {'This is a basic card with title and description.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>
          {
            'This is the main content of the card. You can put any content here.'
          }
        </p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card className='w-[350px]'>
      <CardHeader>
        <CardTitle>{'Card with Footer'}</CardTitle>
        <CardDescription>
          {'This card includes a footer section.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>{'Main content goes here.'}</p>
      </CardContent>
      <CardFooter>
        <Button variant='outline' size='sm'>
          {'Cancel'}
        </Button>
        <Button size='sm'>{'Save'}</Button>
      </CardFooter>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card className='w-[350px]'>
      <CardHeader>
        <CardTitle>{'Card with Action'}</CardTitle>
        <CardDescription>
          {'This card has an action button in the header.'}
        </CardDescription>
        <CardAction>
          <Button variant='ghost' size='sm' aria-label='Share'>
            <Share className='h-4 w-4' />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p>{'Content with an action button in the top-right corner.'}</p>
      </CardContent>
    </Card>
  ),
};

// Content Types
export const WithImage: Story = {
  render: () => (
    <Card className='w-[350px] overflow-hidden'>
      <div className='aspect-video bg-muted flex items-center justify-center'>
        <span className='text-muted-foreground font-semibold'>
          {'Image Placeholder'}
        </span>
      </div>
      <CardHeader>
        <CardTitle>{'Card with Image'}</CardTitle>
        <CardDescription>
          {'This card includes an image at the top.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>{'Content below the image.'}</p>
      </CardContent>
    </Card>
  ),
};

export const WithForm: Story = {
  render: () => (
    <Card className='w-[400px]'>
      <CardHeader>
        <CardTitle>{'Contact Form'}</CardTitle>
        <CardDescription>
          {'Fill out the form below to get in touch.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div>
          <label htmlFor='name' className='block text-sm font-medium mb-2'>
            {'Name'}
          </label>
          <Input id='name' placeholder='Enter your name' />
        </div>
        <div>
          <label htmlFor='email' className='block text-sm font-medium mb-2'>
            {'Email'}
          </label>
          <Input id='email' type='email' placeholder='Enter your email' />
        </div>
        <div>
          <label htmlFor='message' className='block text-sm font-medium mb-2'>
            {'Message'}
          </label>
          <textarea
            id='message'
            className='w-full min-h-[100px] p-3 border rounded-md resize-none'
            placeholder='Enter your message'
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button className='w-full'>{'Send Message'}</Button>
      </CardFooter>
    </Card>
  ),
};

export const WithStats: Story = {
  render: () => (
    <Card className='w-[350px]'>
      <CardHeader>
        <CardTitle>{'Statistics'}</CardTitle>
        <CardDescription>{'Key metrics and data points.'}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-2 gap-4'>
          <div className='text-center'>
            <div className='text-2xl font-bold text-primary-text'>1,234</div>
            <div className='text-sm text-muted-foreground'>{'Total Users'}</div>
          </div>
          <div className='text-center'>
            <div className='text-2xl font-bold text-primary-text'>89%</div>
            <div className='text-sm text-muted-foreground'>
              {'Success Rate'}
            </div>
          </div>
          <div className='text-center'>
            <div className='text-2xl font-bold text-primary-text'>567</div>
            <div className='text-sm text-muted-foreground'>
              {'Active Projects'}
            </div>
          </div>
          <div className='text-center'>
            <div className='text-2xl font-bold text-primary-text'>{'24h'}</div>
            <div className='text-sm text-muted-foreground'>
              {'Response Time'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  ),
};

// Interactive Examples
export const Interactive: Story = {
  render: () => {
    const [isLiked, setIsLiked] = React.useState(false);
    const [isBookmarked, setIsBookmarked] = React.useState(false);

    return (
      <Card className='w-[350px]'>
        <CardHeader>
          <CardTitle>{'Interactive Card'}</CardTitle>
          <CardDescription>
            {'This card has interactive elements.'}
          </CardDescription>
          <CardAction>
            <Button
              variant='ghost'
              size='sm'
              aria-label='Bookmark'
              onClick={() => setIsBookmarked(!isBookmarked)}
            >
              <Bookmark
                className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`}
              />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p>{'Click the buttons to see the interactions.'}</p>
        </CardContent>
        <CardFooter className='justify-between'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setIsLiked(!isLiked)}
          >
            <Heart
              className={`h-4 w-4 ${isLiked ? 'fill-current text-destructive' : ''}`}
            />
            <span className='ml-1'>{isLiked ? 'Liked' : 'Like'}</span>
          </Button>
          <Button variant='ghost' size='sm'>
            <Share className='h-4 w-4' />
            <span className='ml-1'>{'Share'}</span>
          </Button>
        </CardFooter>
      </Card>
    );
  },
};

// Complex Examples
export const ProductCard: Story = {
  render: () => (
    <Card className='w-[300px] overflow-hidden'>
      <div className='aspect-square bg-gradient-to-br from-muted to-border flex items-center justify-center'>
        <span className='text-muted-foreground'>{'Product Image'}</span>
      </div>
      <CardHeader className='pb-3'>
        <div className='flex items-start justify-between'>
          <div>
            <CardTitle className='text-lg'>{'Premium Widget'}</CardTitle>
            <CardDescription>
              {'High-quality widget for all your needs'}
            </CardDescription>
          </div>
          <Badge variant='secondary'>$29.99</Badge>
        </div>
      </CardHeader>
      <CardContent className='pt-0'>
        <div className='flex items-center gap-1 mb-3'>
          {[...Array(5)].map((_, i) => (
            <Star
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className={`h-4 w-4 ${i < 4 ? 'fill-status-warning text-status-warning' : 'text-muted-foreground'}`}
            />
          ))}
          <span className='text-sm text-muted-foreground ml-1'>(4.0)</span>
        </div>
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <MapPin className='h-4 w-4' />
          <span>{'Free shipping'}</span>
        </div>
      </CardContent>
      <CardFooter>
        <Button className='w-full'>{'Add to Cart'}</Button>
      </CardFooter>
    </Card>
  ),
};

export const EventCard: Story = {
  render: () => (
    <Card className='w-[350px]'>
      <CardHeader>
        <div className='flex items-start justify-between'>
          <div>
            <CardTitle>{'Tech Conference 2024'}</CardTitle>
            <CardDescription>
              {'Join us for the biggest tech event of the year'}
            </CardDescription>
          </div>
          <Badge variant='outline'>{'Upcoming'}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          <div className='flex items-center gap-2 text-sm'>
            <Calendar className='h-4 w-4 text-muted-foreground' />
            <span>{'March 15, 2024 • 9:00 AM'}</span>
          </div>
          <div className='flex items-center gap-2 text-sm'>
            <MapPin className='h-4 w-4 text-muted-foreground' />
            <span>{'Convention Center, Downtown'}</span>
          </div>
          <p className='text-sm text-muted-foreground'>
            {
              'Learn about the latest technologies and network with industry experts.'
            }
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant='outline' className='flex-1'>
          {'Learn More'}
        </Button>
        <Button className='flex-1'>{'Register Now'}</Button>
      </CardFooter>
    </Card>
  ),
};

export const ProfileCard: Story = {
  render: () => (
    <Card className='w-[350px]'>
      <CardHeader className='text-center'>
        <div className='w-20 h-20 rounded-full bg-happy-500 mx-auto mb-4 flex items-center justify-center'>
          <span className='text-happy-900 font-bold text-xl'>JD</span>
        </div>
        <CardTitle>{'John Doe'}</CardTitle>
        <CardDescription>{'Senior Software Engineer'}</CardDescription>
        <CardAction>
          <Button variant='ghost' size='sm' aria-label='Share'>
            <Share className='h-4 w-4' />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          <div className='flex justify-between text-sm'>
            <span className='text-muted-foreground'>{'Experience'}</span>
            <span>{'5+ years'}</span>
          </div>
          <div className='flex justify-between text-sm'>
            <span className='text-muted-foreground'>{'Location'}</span>
            <span>{'San Francisco, CA'}</span>
          </div>
          <div className='flex justify-between text-sm'>
            <span className='text-muted-foreground'>{'Skills'}</span>
            <span>{'React, TypeScript, Node.js'}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant='outline' className='flex-1'>
          {'Message'}
        </Button>
        <Button className='flex-1'>{'Connect'}</Button>
      </CardFooter>
    </Card>
  ),
};

// Layout Examples
export const GridLayout: Story = {
  render: () => (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl'>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <Card key={i}>
          <CardHeader>
            <CardTitle>{'Card ' + i}</CardTitle>
            <CardDescription>
              {'This is card number ' + i + ' in a grid layout.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>{'Content for card ' + i + '.'}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

export const HorizontalLayout: Story = {
  render: () => (
    <div className='flex gap-6 w-full max-w-4xl'>
      <Card className='flex-1'>
        <CardHeader>
          <CardTitle>{'Left Card'}</CardTitle>
          <CardDescription>{'This card is on the left side.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <p>{'Content for the left card.'}</p>
        </CardContent>
      </Card>
      <Card className='flex-1'>
        <CardHeader>
          <CardTitle>{'Right Card'}</CardTitle>
          <CardDescription>{'This card is on the right side.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <p>{'Content for the right card.'}</p>
        </CardContent>
      </Card>
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

/**
 * The matrix the per-atom bar asks for.
 *
 * Card has no `variant` prop — what varies is which of its seven slots are
 * filled — so the matrix is an anatomy view rather than a variant grid. It also
 * replaces the all-at-once view Card briefly lost: the `ElevationLevels` and
 * glass stories that used to live here were token documentation, and moved to
 * `Foundations/Elevation and glass` where they belong.
 */
export const AllCompositions: Story = {
  render: () => (
    <div className='grid w-full max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2'>
      {[
        {
          label: 'header only',
          content: (
            <CardHeader>
              <CardTitle>{'Title'}</CardTitle>
              <CardDescription>{'Description'}</CardDescription>
            </CardHeader>
          ),
        },
        {
          label: 'header + content',
          content: (
            <>
              <CardHeader>
                <CardTitle>{'Title'}</CardTitle>
                <CardDescription>{'Description'}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='text-sm'>{'Body content.'}</p>
              </CardContent>
            </>
          ),
        },
        {
          label: 'header + content + footer',
          content: (
            <>
              <CardHeader>
                <CardTitle>{'Title'}</CardTitle>
                <CardDescription>{'Description'}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='text-sm'>{'Body content.'}</p>
              </CardContent>
              <CardFooter>
                <Button size='sm'>{'Action'}</Button>
              </CardFooter>
            </>
          ),
        },
        {
          label: 'header with action',
          content: (
            <>
              <CardHeader>
                <CardTitle>{'Title'}</CardTitle>
                <CardDescription>{'Description'}</CardDescription>
                <CardAction>
                  <Button variant='ghost' size='sm' aria-label='Share'>
                    <Share className='h-4 w-4' />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className='text-sm'>
                  {'CardAction pins itself to the header’s trailing edge.'}
                </p>
              </CardContent>
            </>
          ),
        },
      ].map(composition => (
        <div key={composition.label} className='flex flex-col gap-2'>
          <p className='text-muted-foreground font-mono text-xs'>
            {composition.label}
          </p>
          <Card>{composition.content}</Card>
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Every arrangement of the card’s slots in one view. Card has no variants, so this is an anatomy matrix rather than a variant grid.',
      },
    },
  },
};

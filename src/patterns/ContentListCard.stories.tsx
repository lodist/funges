import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Pattern: content list card.
 *
 * A Card carrying a badge and an action button, repeated down a list. Rendered
 * on the species, recipes and worth-foraging-now screens — the most duplicated
 * composition in the application, and the one where a fourth instance is most
 * likely to drift.
 */

const meta: Meta = {
  title: 'Molecules/Content list card',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A Card with a status badge and an action. The repeating unit of the species, recipes and worth-foraging-now lists.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className='w-80'>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <CardTitle>{'Chanterelle'}</CardTitle>
          <Badge>{'In season'}</Badge>
        </div>
        <CardDescription>{'Cantharellus cibarius'}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className='text-muted-foreground text-sm'>
          {
            'Mature beech and oak on north-facing slopes, four to eight days after sustained rain.'
          }
        </p>
      </CardContent>
      <CardFooter>
        <Button size='sm'>{'View on map'}</Button>
      </CardFooter>
    </Card>
  ),
};

export const WithMultipleBadges: Story = {
  render: () => (
    <Card className='w-80'>
      <CardHeader>
        <CardTitle>{'Chanterelle'}</CardTitle>
        <CardDescription>{'Cantharellus cibarius'}</CardDescription>
        <div className='flex flex-wrap gap-2 pt-1'>
          <Badge>{'In season'}</Badge>
          <Badge variant='secondary'>{'High confidence'}</Badge>
          <Badge variant='outline'>{'Mushroom'}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className='text-muted-foreground text-sm'>
          {'Reliable in this region from late August through October.'}
        </p>
      </CardContent>
      <CardFooter>
        <Button size='sm'>{'View on map'}</Button>
      </CardFooter>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'With more than one badge the row moves below the description, since a title competing with three pills for the same line stops being scannable.',
      },
    },
  },
};

export const WithSecondaryAction: Story = {
  render: () => (
    <Card className='w-80'>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <CardTitle>{'Chanterelle risotto'}</CardTitle>
          <Badge variant='secondary'>{'30 min'}</Badge>
        </div>
        <CardDescription>{'Four servings'}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className='text-muted-foreground text-sm'>
          {'Uses whatever you found today, plus stock and hard cheese.'}
        </p>
      </CardContent>
      <CardFooter className='gap-2'>
        <Button size='sm'>{'Open recipe'}</Button>
        <Button size='sm' variant='outline'>
          {'Save'}
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const Loading: Story = {
  render: () => (
    <Card className='w-80'>
      <CardHeader className='gap-3'>
        <div className='flex items-start justify-between gap-3'>
          <Skeleton className='h-5 w-32' />
          <Skeleton className='h-5 w-20 rounded-full' />
        </div>
        <Skeleton className='h-4 w-40' />
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-4/5' />
      </CardContent>
      <CardFooter>
        <Skeleton className='h-8 w-28 rounded-full' />
      </CardFooter>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The loading shape mirrors the loaded one — same footprint, so the list does not shift when the data lands. Note the pill radii on the badge and button placeholders.',
      },
    },
  },
};

export const InAList: Story = {
  render: () => (
    <div className='grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
      {[
        {
          name: 'Chanterelle',
          latin: 'Cantharellus cibarius',
          status: 'In season',
        },
        { name: 'Cep', latin: 'Boletus edulis', status: 'In season' },
        {
          name: 'Hedgehog mushroom',
          latin: 'Hydnum repandum',
          status: 'Coming soon',
        },
        {
          name: 'Morel',
          latin: 'Morchella esculenta',
          status: 'Out of season',
        },
      ].map(species => (
        <Card key={species.name}>
          <CardHeader>
            <div className='flex items-start justify-between gap-3'>
              <CardTitle>{species.name}</CardTitle>
              <Badge
                variant={
                  species.status === 'In season' ? 'default' : 'secondary'
                }
              >
                {species.status}
              </Badge>
            </div>
            <CardDescription>{species.latin}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button size='sm'>{'View on map'}</Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'The pattern in the grid the screens actually render. Cards in a row do not equalise their heights on their own — the grid does that.',
      },
    },
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='grid w-full max-w-5xl grid-cols-1 gap-6 lg:grid-cols-3'>
      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground font-mono text-xs'>
          {'single badge'}
        </p>
        <Card>
          <CardHeader>
            <div className='flex items-start justify-between gap-3'>
              <CardTitle>{'Chanterelle'}</CardTitle>
              <Badge>{'In season'}</Badge>
            </div>
            <CardDescription>{'Cantharellus cibarius'}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button size='sm'>{'View on map'}</Button>
          </CardFooter>
        </Card>
      </div>
      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground font-mono text-xs'>
          {'badge row + two actions'}
        </p>
        <Card>
          <CardHeader>
            <CardTitle>{'Chanterelle'}</CardTitle>
            <CardDescription>{'Cantharellus cibarius'}</CardDescription>
            <div className='flex flex-wrap gap-2 pt-1'>
              <Badge>{'In season'}</Badge>
              <Badge variant='outline'>{'Mushroom'}</Badge>
            </div>
          </CardHeader>
          <CardFooter className='gap-2'>
            <Button size='sm'>{'View'}</Button>
            <Button size='sm' variant='outline'>
              {'Save'}
            </Button>
          </CardFooter>
        </Card>
      </div>
      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground font-mono text-xs'>{'loading'}</p>
        <Card>
          <CardHeader className='gap-3'>
            <div className='flex items-start justify-between gap-3'>
              <Skeleton className='h-5 w-32' />
              <Skeleton className='h-5 w-20 rounded-full' />
            </div>
            <Skeleton className='h-4 w-40' />
          </CardHeader>
          <CardFooter>
            <Skeleton className='h-8 w-28 rounded-full' />
          </CardFooter>
        </Card>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: 'Every arrangement of the pattern in use, in one view.',
      },
    },
  },
};

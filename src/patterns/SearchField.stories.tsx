import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

/**
 * Pattern: search field.
 *
 * A pattern is admissible here only if the application genuinely renders it on
 * at least two screens. This one appears on the species list and the recipes
 * list with the same markup in both, which is exactly the duplication a
 * documented pattern is meant to stop drifting.
 *
 * There is no `SearchField` component — the composition is two elements, and
 * extracting it has not earned itself yet. What is documented is the shape, so
 * the third one matches the first two.
 */

const meta: Meta = {
  title: 'Molecules/Search field',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'An Input with a leading search icon. Rendered on the species and recipes screens.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className='relative w-80'>
      {/* aria-hidden: the icon is decorative, the field is named by its label.
          pl-11 is the caller's job — Input ships pl-4 and knows nothing about
          a leading icon. */}
      <Search
        aria-hidden
        className='text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2'
      />
      <Input
        type='search'
        aria-label='Search species'
        placeholder='Search species'
        className='pl-11'
      />
    </div>
  ),
};

export const WithValue: Story = {
  render: () => (
    <div className='relative w-80'>
      <Search
        aria-hidden
        className='text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2'
      />
      <Input
        type='search'
        aria-label='Search species'
        defaultValue='chanterelle'
        className='pl-11'
      />
    </div>
  ),
};

export const Controlled: Story = {
  render: () => {
    const ControlledSearch = () => {
      const [query, setQuery] = React.useState('');

      return (
        <div className='flex w-80 flex-col gap-3'>
          <div className='relative'>
            <Search
              aria-hidden
              className='text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2'
            />
            <Input
              type='search'
              aria-label='Search species'
              placeholder='Search species'
              className='pl-11'
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </div>
          <p className='text-muted-foreground text-xs'>
            {query
              ? `Filtering by “${query}”`
              : 'Showing every species in season'}
          </p>
        </div>
      );
    };

    return <ControlledSearch />;
  },
  parameters: {
    docs: {
      description: {
        story:
          'How both screens actually use it: the query filters a list as it is typed, with no submit.',
      },
    },
  },
};

export const AllStates: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-6'>
      {[
        { label: 'empty', props: { placeholder: 'Search species' } },
        { label: 'with value', props: { defaultValue: 'chanterelle' } },
        {
          label: 'disabled',
          props: { placeholder: 'Search unavailable', disabled: true },
        },
      ].map(state => (
        <div key={state.label} className='flex flex-col gap-1'>
          <p className='text-muted-foreground font-mono text-xs'>
            {state.label}
          </p>
          <div className='relative'>
            <Search
              aria-hidden
              className='text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2'
            />
            <Input
              type='search'
              aria-label={`Search species (${state.label})`}
              className='pl-11'
              {...state.props}
            />
          </div>
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: 'Every state the field is rendered in, in one view.',
      },
    },
  },
};

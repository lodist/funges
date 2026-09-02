import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Pattern: filter control.
 *
 * A label paired with a Select that narrows a list in place. Rendered on the
 * data, worth-foraging-now and species screens — three, so it clears the
 * two-screen bar for admissibility comfortably.
 *
 * The distinguishing detail is that it filters immediately rather than feeding
 * a submit, which is why the caption is a plain span rather than a form label
 * pointing at an input.
 *
 * The caption is a `<span>`, not the `Label` atom, for two reasons pointing the
 * same way: the trigger is a button, so it takes its name from
 * `aria-labelledby` and `htmlFor` buys nothing — and `Label` carries `text-sm`,
 * a utility, which outranks `.type-micro` in @layer components and would
 * silently render the caption at 14px.
 */

const meta: Meta = {
  title: 'Molecules/Filter control',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A label and Select pair that filters a list as soon as it changes. Rendered on the data, worth-foraging-now and species screens.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const FOCUS_OPTIONS = [
  { value: 'mixed', label: 'Mushrooms and plants' },
  { value: 'mushrooms', label: 'Mushrooms only' },
  { value: 'plants', label: 'Plants only' },
];

export const Default: Story = {
  render: () => (
    <div className='flex flex-col gap-2'>
      <span id='focus-label' className='type-micro text-muted-foreground'>
        {'Focus'}
      </span>
      <Select defaultValue='mixed'>
        <SelectTrigger className='w-48' aria-labelledby='focus-label'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FOCUS_OPTIONS.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
};

export const Inline: Story = {
  render: () => (
    <div className='flex items-center gap-3'>
      <span
        id='inline-focus-label'
        className='type-micro text-muted-foreground'
      >
        {'Focus'}
      </span>
      <Select defaultValue='mixed'>
        <SelectTrigger
          size='sm'
          className='w-44'
          aria-labelledby='inline-focus-label'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FOCUS_OPTIONS.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The inline form, with the `sm` trigger — what the data screen uses, where the filter sits inside dense chrome rather than above a list.',
      },
    },
  },
};

export const MultipleFilters: Story = {
  render: () => (
    <div className='flex flex-wrap items-end gap-4'>
      {[
        { id: 'filter-focus', label: 'Focus', options: FOCUS_OPTIONS },
        {
          id: 'filter-season',
          label: 'Season',
          options: [
            { value: 'now', label: 'In season now' },
            { value: 'soon', label: 'Coming soon' },
            { value: 'all', label: 'All year' },
          ],
        },
      ].map(filter => (
        <div key={filter.id} className='flex flex-col gap-2'>
          <span id={filter.id} className='type-micro text-muted-foreground'>
            {filter.label}
          </span>
          <Select defaultValue={filter.options[0].value}>
            <SelectTrigger className='w-44' aria-labelledby={filter.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filter.options.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Several filters in a row. Each needs its own label id — reusing one leaves both triggers announcing the same name.',
      },
    },
  },
};

export const Controlled: Story = {
  render: () => {
    const ControlledFilter = () => {
      const [focus, setFocus] = React.useState('mixed');

      return (
        <div className='flex flex-col gap-3'>
          <div className='flex flex-col gap-2'>
            <span
              id='controlled-focus-label'
              className='type-micro text-muted-foreground'
            >
              {'Focus'}
            </span>
            <Select value={focus} onValueChange={setFocus}>
              <SelectTrigger
                className='w-48'
                aria-labelledby='controlled-focus-label'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOCUS_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className='text-muted-foreground text-xs'>
            {`Showing: ${
              FOCUS_OPTIONS.find(option => option.value === focus)?.label
            }`}
          </p>
        </div>
      );
    };

    return <ControlledFilter />;
  },
  parameters: {
    docs: {
      description: {
        story:
          'The real behaviour: changing the value re-filters immediately, with no apply step.',
      },
    },
  },
};

export const AllLayouts: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground font-mono text-xs'>{'stacked'}</p>
        <div className='flex flex-col gap-2'>
          <span
            id='matrix-stacked'
            className='type-micro text-muted-foreground'
          >
            {'Focus'}
          </span>
          <Select defaultValue='mixed'>
            <SelectTrigger className='w-48' aria-labelledby='matrix-stacked'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOCUS_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground font-mono text-xs'>
          {'inline · sm'}
        </p>
        <div className='flex items-center gap-3'>
          <span id='matrix-inline' className='type-micro text-muted-foreground'>
            {'Focus'}
          </span>
          <Select defaultValue='mixed'>
            <SelectTrigger
              size='sm'
              className='w-44'
              aria-labelledby='matrix-inline'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOCUS_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: 'Both layouts the application uses, in one view.',
      },
    },
  },
};

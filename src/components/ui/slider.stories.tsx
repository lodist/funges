import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

const meta: Meta<typeof Slider> = {
  title: 'Atoms/Slider',
  component: Slider,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A value picked along a range. The track is deliberately neutral rather than accent-coloured, so that a slider sitting over the map never reads as part of the map’s own score colour coding.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    min: {
      control: { type: 'number' },
      description: 'Lower bound of the range',
    },
    max: {
      control: { type: 'number' },
      description: 'Upper bound of the range',
    },
    step: {
      control: { type: 'number' },
      description: 'Smallest increment the thumb can move by',
    },
    showTicks: {
      control: { type: 'boolean' },
      description:
        'Renders a tick mark under every legal step. Only worth it when the steps are few and meaningful — one per forecast day, not one per percent.',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the thumb can be moved',
    },
    formatValue: {
      control: false,
      description:
        'Spoken form of a value, put on each thumb’s `aria-valuetext`. Needed whenever the number the thumb sits on is not the thing the user is choosing — a forecast day is announced as “Today”, not as “0”.',
    },
    defaultValue: {
      control: { type: 'object' },
      description:
        'Initial value as an array. One entry gives one thumb, two give a range.',
    },
    className: {
      control: { type: 'text' },
      description: 'Additional CSS classes',
    },
  },
  args: {
    min: 0,
    max: 100,
    step: 1,
    showTicks: false,
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <div className='w-80'>
      <Slider defaultValue={[50]} aria-label='Value' {...args} />
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-3'>
      {/* aria-labelledby, not htmlFor: the slider root is a span, which a
          label cannot point at. The name has to reach the thumb. */}
      <Label id='confidence-label'>{'Minimum confidence'}</Label>
      <Slider defaultValue={[60]} aria-labelledby='confidence-label' />
    </div>
  ),
};

export const WithTicks: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-3'>
      <Label id='forecast-day-label'>{'Forecast day'}</Label>
      <Slider
        aria-labelledby='forecast-day-label'
        min={0}
        max={6}
        step={1}
        defaultValue={[2]}
        showTicks
        formatValue={day => (day === 0 ? 'Today' : `In ${day} days`)}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Ticks are inset by the thumb’s radius so they line up with where the thumb can actually stop, rather than with the container edges. Seven steps for seven forecast days, each announced by `formatValue` as the day it means rather than as its index.',
      },
    },
  },
};

export const Range: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-3'>
      {/* A range gets aria-label rather than aria-labelledby: one label id
          would name both thumbs identically, whereas the label text is
          suffixed with each thumb's position. */}
      <Label>{'Score range'}</Label>
      <Slider aria-label='Score range' defaultValue={[25, 75]} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Two entries in the value array give two thumbs. The number of thumbs is derived from the value, not from a prop.',
      },
    },
  },
};

export const Disabled: Story = {
  render: () => (
    <div className='w-80'>
      <Slider defaultValue={[40]} aria-label='Value' disabled />
    </div>
  ),
};

export const Controlled: Story = {
  render: () => {
    const ControlledSlider = () => {
      const [value, setValue] = React.useState([3]);

      return (
        <div className='flex w-80 flex-col gap-3'>
          <div className='flex items-center justify-between'>
            <Label id='controlled-slider-label'>{'Days ahead'}</Label>
            <span className='font-mono text-xs'>{value[0]}</span>
          </div>
          <Slider
            aria-labelledby='controlled-slider-label'
            min={0}
            max={6}
            step={1}
            showTicks
            value={value}
            onValueChange={setValue}
          />
        </div>
      );
    };

    return <ControlledSlider />;
  },
  parameters: {
    docs: {
      description: {
        story:
          '`onValueChange` hands back the whole array, so a controlled slider stores an array even when it has one thumb.',
      },
    },
  },
};

export const AllStates: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-8'>
      {[
        { label: 'single thumb', props: { defaultValue: [50] } },
        {
          label: 'with ticks',
          props: {
            defaultValue: [2],
            min: 0,
            max: 6,
            step: 1,
            showTicks: true,
          },
        },
        { label: 'range', props: { defaultValue: [25, 75] } },
        { label: 'disabled', props: { defaultValue: [40], disabled: true } },
      ].map(state => (
        <div key={state.label} className='flex flex-col gap-2'>
          <p className='text-muted-foreground font-mono text-xs'>
            {state.label}
          </p>
          <Slider aria-label={state.label} {...state.props} />
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: 'Every configuration the slider supports, in one view.',
      },
    },
  },
};

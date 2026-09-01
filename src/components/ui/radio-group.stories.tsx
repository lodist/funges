import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const meta: Meta<typeof RadioGroup> = {
  title: 'Atoms/RadioGroup',
  component: RadioGroup,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'One choice out of several, all visible at once. Reach for a Select instead when the options are many or the list is long — a radio group stops being scannable somewhere around six options.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    defaultValue: {
      control: { type: 'text' },
      description: 'Which item is selected initially when uncontrolled',
    },
    value: {
      control: { type: 'text' },
      description: 'The selected item when controlled',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disables every item in the group',
    },
    orientation: {
      control: { type: 'radio' },
      options: ['vertical', 'horizontal'],
      description:
        'Which arrow keys move between items. It does not change the layout — that is the className’s job.',
    },
    className: {
      control: { type: 'text' },
      description:
        'Additional CSS classes. The group is a grid with a gap by default.',
    },
  },
  args: {
    disabled: false,
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
  render: args => (
    <RadioGroup defaultValue='mixed' {...args}>
      {FOCUS_OPTIONS.map(option => (
        <Label key={option.value} className='flex items-center gap-2'>
          <RadioGroupItem value={option.value} />
          {option.label}
        </Label>
      ))}
    </RadioGroup>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <RadioGroup
      defaultValue='mixed'
      orientation='horizontal'
      className='flex gap-6'
    >
      {FOCUS_OPTIONS.map(option => (
        <Label key={option.value} className='flex items-center gap-2'>
          <RadioGroupItem value={option.value} />
          {option.label}
        </Label>
      ))}
    </RadioGroup>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Laying the group out in a row takes two changes, not one: `orientation` tells the keyboard which arrows to honour, and the className does the actual layout. Setting only one of them gives you a row you cannot arrow through, or a column that responds to left and right.',
      },
    },
  },
};

export const WithDescriptions: Story = {
  render: () => (
    <RadioGroup defaultValue='mixed' className='gap-4'>
      {[
        {
          value: 'mixed',
          label: 'Mushrooms and plants',
          hint: 'Everything in season, ranked together.',
        },
        {
          value: 'mushrooms',
          label: 'Mushrooms only',
          hint: 'Fungi, ranked by forecast confidence.',
        },
        {
          value: 'plants',
          label: 'Plants only',
          hint: 'Greens, berries and roots.',
        },
      ].map(option => (
        <div key={option.value} className='flex items-start gap-2'>
          <RadioGroupItem
            value={option.value}
            id={`described-${option.value}`}
            className='mt-0.5'
          />
          <div className='flex flex-col'>
            <Label htmlFor={`described-${option.value}`}>{option.label}</Label>
            <p className='text-muted-foreground text-xs'>{option.hint}</p>
          </div>
        </div>
      ))}
    </RadioGroup>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'With supporting copy the label can no longer wrap the control, so the item needs an id and the label an `htmlFor`.',
      },
    },
  },
};

export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue='mixed' disabled>
      {FOCUS_OPTIONS.map(option => (
        <Label key={option.value} className='flex items-center gap-2'>
          <RadioGroupItem value={option.value} />
          {option.label}
        </Label>
      ))}
    </RadioGroup>
  ),
};

export const SingleItemDisabled: Story = {
  render: () => (
    <RadioGroup defaultValue='mixed'>
      {FOCUS_OPTIONS.map(option => (
        <Label key={option.value} className='flex items-center gap-2'>
          <RadioGroupItem
            value={option.value}
            disabled={option.value === 'plants'}
          />
          {option.label}
          {option.value === 'plants' ? (
            <span className='text-muted-foreground text-xs'>
              {'(no data for this region)'}
            </span>
          ) : null}
        </Label>
      ))}
    </RadioGroup>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Disabling one item rather than the group. Keyboard navigation skips it.',
      },
    },
  },
};

export const Controlled: Story = {
  render: () => {
    const ControlledGroup = () => {
      const [value, setValue] = React.useState('mixed');

      return (
        <div className='flex flex-col gap-3'>
          <RadioGroup value={value} onValueChange={setValue}>
            {FOCUS_OPTIONS.map(option => (
              <Label key={option.value} className='flex items-center gap-2'>
                <RadioGroupItem value={option.value} />
                {option.label}
              </Label>
            ))}
          </RadioGroup>
          <p className='text-muted-foreground font-mono text-xs'>{value}</p>
        </div>
      );
    };

    return <ControlledGroup />;
  },
};

export const AllStates: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      {[
        { label: 'default', groupProps: {}, disabledItem: null },
        {
          label: 'disabled group',
          groupProps: { disabled: true },
          disabledItem: null,
        },
        { label: 'one item disabled', groupProps: {}, disabledItem: 'plants' },
      ].map(state => (
        <div key={state.label} className='flex flex-col gap-2'>
          <p className='text-muted-foreground font-mono text-xs'>
            {state.label}
          </p>
          <RadioGroup defaultValue='mixed' {...state.groupProps}>
            {FOCUS_OPTIONS.map(option => (
              <Label key={option.value} className='flex items-center gap-2'>
                <RadioGroupItem
                  value={option.value}
                  disabled={option.value === state.disabledItem}
                />
                {option.label}
              </Label>
            ))}
          </RadioGroup>
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: 'Every disabled treatment the group supports, in one view.',
      },
    },
  },
};

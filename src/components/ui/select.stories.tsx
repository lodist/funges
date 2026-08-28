import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const meta: Meta<typeof Select> = {
  title: 'Atoms/Select',
  component: Select,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'One choice from a list, revealed on demand. The trigger is `raised-subtle` input chrome; the content is a `floating` surface. Use it over a RadioGroup once the options stop fitting comfortably on screen.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    defaultValue: {
      control: { type: 'text' },
      description: 'Initially selected value when uncontrolled',
    },
    value: {
      control: { type: 'text' },
      description: 'Selected value when controlled',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the trigger can be opened',
    },
    required: {
      control: { type: 'boolean' },
      description: 'Marks the field required inside a form',
    },
  },
  args: {
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const SPECIES = [
  { value: 'chanterelle', label: 'Chanterelle' },
  { value: 'cep', label: 'Cep' },
  { value: 'hedgehog', label: 'Hedgehog mushroom' },
  { value: 'morel', label: 'Morel' },
];

export const Default: Story = {
  render: args => (
    <Select {...args}>
      <SelectTrigger className='w-56' aria-label='Species'>
        <SelectValue placeholder='Select a species' />
      </SelectTrigger>
      <SelectContent>
        {SPECIES.map(species => (
          <SelectItem key={species.value} value={species.value}>
            {species.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className='flex w-56 flex-col gap-2'>
      <Label id='species-label'>{'Species'}</Label>
      <Select>
        <SelectTrigger aria-labelledby='species-label'>
          <SelectValue placeholder='Select a species' />
        </SelectTrigger>
        <SelectContent>
          {SPECIES.map(species => (
            <SelectItem key={species.value} value={species.value}>
              {species.label}
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
          'The trigger is a button, not an input, so it takes its name from `aria-labelledby` rather than from a label’s `htmlFor`.',
      },
    },
  },
};

export const WithValue: Story = {
  render: () => (
    <Select defaultValue='cep'>
      <SelectTrigger className='w-56' aria-label='Species'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SPECIES.map(species => (
          <SelectItem key={species.value} value={species.value}>
            {species.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'With a value set, `SelectValue` needs no placeholder — it renders the selected item’s label.',
      },
    },
  },
};

export const Small: Story = {
  render: () => (
    <Select defaultValue='cep'>
      <SelectTrigger size='sm' className='w-48' aria-label='Species'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SPECIES.map(species => (
          <SelectItem key={species.value} value={species.value}>
            {species.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The `sm` trigger, used where a filter sits inside dense chrome rather than in a form.',
      },
    },
  },
};

export const Grouped: Story = {
  render: () => (
    <Select>
      <SelectTrigger className='w-56' aria-label='Species'>
        <SelectValue placeholder='Select a species' />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>{'Mushrooms'}</SelectLabel>
          <SelectItem value='chanterelle'>{'Chanterelle'}</SelectItem>
          <SelectItem value='cep'>{'Cep'}</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>{'Plants'}</SelectLabel>
          <SelectItem value='ramsons'>{'Ramsons'}</SelectItem>
          <SelectItem value='elderflower'>{'Elderflower'}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
  parameters: {
    docs: {
      description: {
        story:
          '`SelectGroup` with a `SelectLabel` gives the grouping real semantics, not just a heading — the label is announced as the group’s name.',
      },
    },
  },
};

export const WithDisabledItem: Story = {
  render: () => (
    <Select>
      <SelectTrigger className='w-56' aria-label='Species'>
        <SelectValue placeholder='Select a species' />
      </SelectTrigger>
      <SelectContent>
        {SPECIES.map(species => (
          <SelectItem
            key={species.value}
            value={species.value}
            disabled={species.value === 'morel'}
          >
            {species.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled defaultValue='cep'>
      <SelectTrigger className='w-56' aria-label='Species'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SPECIES.map(species => (
          <SelectItem key={species.value} value={species.value}>
            {species.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};

export const Invalid: Story = {
  render: () => (
    <div className='flex w-56 flex-col gap-2'>
      <Select>
        <SelectTrigger aria-invalid aria-label='Species'>
          <SelectValue placeholder='Select a species' />
        </SelectTrigger>
        <SelectContent>
          {SPECIES.map(species => (
            <SelectItem key={species.value} value={species.value}>
              {species.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className='text-destructive-text text-xs'>
        {'Please pick a species.'}
      </p>
    </div>
  ),
};

export const LongList: Story = {
  render: () => (
    <Select>
      <SelectTrigger className='w-56' aria-label='Region'>
        <SelectValue placeholder='Select a region' />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: 30 }, (_, i) => (
          <SelectItem key={i} value={`region-${i}`}>
            {`Region ${i + 1}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Past a certain length the content scrolls and grows its own scroll buttons. No configuration — it happens on overflow.',
      },
    },
  },
};

export const Controlled: Story = {
  render: () => {
    const ControlledSelect = () => {
      const [value, setValue] = React.useState('');

      return (
        <div className='flex w-56 flex-col gap-3'>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger aria-label='Species'>
              <SelectValue placeholder='Select a species' />
            </SelectTrigger>
            <SelectContent>
              {SPECIES.map(species => (
                <SelectItem key={species.value} value={species.value}>
                  {species.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className='text-muted-foreground font-mono text-xs'>
            {value || '(nothing selected)'}
          </p>
        </div>
      );
    };

    return <ControlledSelect />;
  },
  parameters: {
    docs: {
      description: {
        story:
          'Note that an empty string is not a usable item value — Radix reserves it for "no selection", so an item with `value=""` throws.',
      },
    },
  },
};

export const AllTriggerStates: Story = {
  render: () => (
    <div className='flex w-56 flex-col gap-6'>
      {[
        { label: 'placeholder', props: {}, triggerProps: {} },
        { label: 'value', props: { defaultValue: 'cep' }, triggerProps: {} },
        {
          label: 'small',
          props: { defaultValue: 'cep' },
          triggerProps: { size: 'sm' as const },
        },
        {
          label: 'disabled',
          props: { disabled: true, defaultValue: 'cep' },
          triggerProps: {},
        },
        {
          label: 'invalid',
          props: {},
          triggerProps: { 'aria-invalid': true },
        },
      ].map(state => (
        <div key={state.label} className='flex flex-col gap-1'>
          <p className='text-muted-foreground font-mono text-xs'>
            {state.label}
          </p>
          <Select {...state.props}>
            <SelectTrigger aria-label={state.label} {...state.triggerProps}>
              <SelectValue placeholder='Select a species' />
            </SelectTrigger>
            <SelectContent>
              {SPECIES.map(species => (
                <SelectItem key={species.value} value={species.value}>
                  {species.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Every trigger state in one view. The content is a portal, so only one list can be open at a time — the matrix covers the trigger, which is the part that varies.',
      },
    },
  },
};

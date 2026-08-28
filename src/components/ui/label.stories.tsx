import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

const meta: Meta<typeof Label> = {
  title: 'Atoms/Label',
  component: Label,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The accessible name for a form control. Built on the Radix label primitive, so clicking it focuses or toggles the control it points at — which plain text next to an input does not do.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    htmlFor: {
      control: { type: 'text' },
      description:
        'The id of the control this label names. Required unless the label wraps the control.',
    },
    children: {
      control: { type: 'text' },
      description: 'The label text',
    },
    className: {
      control: { type: 'text' },
      description: 'Additional CSS classes',
    },
  },
  args: {
    children: 'Species name',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithInput: Story = {
  render: () => (
    <div className='flex w-72 flex-col gap-2'>
      <Label htmlFor='species'>{'Species name'}</Label>
      <Input id='species' placeholder='Cantharellus cibarius' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The usual shape: `htmlFor` matching the control id. Clicking the label focuses the input.',
      },
    },
  },
};

export const WrappingControl: Story = {
  render: () => (
    <Label className='flex items-center gap-2'>
      <Checkbox />
      {'Show only species in season'}
    </Label>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A label may wrap its control instead of pointing at it, which removes the need for a matching id. Handy for checkboxes, where the label and the control are always adjacent anyway.',
      },
    },
  },
};

export const Disabled: Story = {
  render: () => (
    <div className='flex w-72 flex-col gap-2'>
      <Label htmlFor='disabled-input'>{'Unavailable field'}</Label>
      <Input id='disabled-input' disabled placeholder='Not editable' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The label dims itself when its control is disabled — it reads the state off a sibling group rather than needing a prop.',
      },
    },
  },
};

export const AllStates: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-6'>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='matrix-default'>{'With input'}</Label>
        <Input id='matrix-default' placeholder='Editable' />
      </div>
      <Label className='flex items-center gap-2'>
        <Checkbox />
        {'Wrapping a checkbox'}
      </Label>
      <div className='group flex flex-col gap-2' data-disabled>
        <Label htmlFor='matrix-disabled'>{'With disabled input'}</Label>
        <Input id='matrix-disabled' disabled placeholder='Not editable' />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Every way a label attaches to a control, in one view.',
      },
    },
  },
};

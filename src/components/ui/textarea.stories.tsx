import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const meta: Meta<typeof Textarea> = {
  title: 'Atoms/Textarea',
  component: Textarea,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Multi-line free text. It grows with its content rather than scrolling inside a fixed box, so a long note stays readable without a nested scrollbar.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    placeholder: {
      control: { type: 'text' },
      description: 'Hint text shown while the field is empty',
    },
    rows: {
      control: { type: 'number' },
      description:
        'Starting height in lines. The field still grows past it as text is entered.',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the field can be edited',
    },
    readOnly: {
      control: { type: 'boolean' },
      description:
        'Whether the value is selectable but not editable. Unlike disabled, it stays focusable and submits with the form.',
    },
    'aria-invalid': {
      control: { type: 'boolean' },
      description: 'Marks the field as failing validation',
    },
    className: {
      control: { type: 'text' },
      description: 'Additional CSS classes',
    },
  },
  args: {
    placeholder: 'Where did you find it, and what was growing nearby?',
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <div className='w-80'>
      <Textarea aria-label='Foraging notes' {...args} />
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-2'>
      <Label htmlFor='notes'>{'Foraging notes'}</Label>
      <Textarea
        id='notes'
        placeholder='Where did you find it, and what was growing nearby?'
      />
    </div>
  ),
};

export const WithValue: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-2'>
      <Label htmlFor='notes-filled'>{'Foraging notes'}</Label>
      <Textarea
        id='notes-filled'
        defaultValue='Found a good patch on the north slope, under mature beech. Soil still damp from the rain three days ago.'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The field has already grown to fit this value — no scrollbar, no fixed height.',
      },
    },
  },
};

export const Disabled: Story = {
  render: () => (
    <div className='w-80'>
      <Textarea
        aria-label='Foraging notes'
        disabled
        defaultValue='Notes are locked while this entry is syncing.'
      />
    </div>
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <div className='w-80'>
      <Textarea
        aria-label='Foraging notes'
        readOnly
        defaultValue='Submitted notes cannot be edited, but they can still be selected and copied.'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Read-only rather than disabled: still focusable, still copyable, still submitted with the form.',
      },
    },
  },
};

export const Invalid: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-2'>
      <Label htmlFor='notes-invalid'>{'Foraging notes'}</Label>
      <Textarea id='notes-invalid' aria-invalid defaultValue='Too short' />
      <p className='text-destructive text-xs'>
        {'Please describe the habitat in at least ten characters.'}
      </p>
    </div>
  ),
};

export const AllStates: Story = {
  render: () => (
    <div className='flex w-80 flex-col gap-6'>
      {[
        { label: 'empty', props: { placeholder: 'Placeholder text' } },
        { label: 'filled', props: { defaultValue: 'Some notes here.' } },
        {
          label: 'disabled',
          props: { disabled: true, defaultValue: 'Locked.' },
        },
        {
          label: 'read-only',
          props: { readOnly: true, defaultValue: 'Not editable.' },
        },
        {
          label: 'invalid',
          props: { 'aria-invalid': true, defaultValue: 'Too short' },
        },
      ].map(state => (
        <div key={state.label} className='flex flex-col gap-1'>
          <p className='text-muted-foreground font-mono text-xs'>
            {state.label}
          </p>
          <Textarea aria-label={state.label} {...state.props} />
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: 'Every state the field can be in, in one view.',
      },
    },
  },
};

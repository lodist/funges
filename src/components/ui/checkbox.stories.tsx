import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const meta: Meta<typeof Checkbox> = {
  title: 'Atoms/Checkbox',
  component: Checkbox,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A square control for an independent yes/no choice. It renders as a button rather than an input, so it needs an accessible name from a `Label` or an `aria-label` — there is no implicit one.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    checked: {
      control: { type: 'boolean' },
      description:
        'Controlled checked state. Leave undefined and use defaultChecked for an uncontrolled checkbox.',
    },
    defaultChecked: {
      control: { type: 'boolean' },
      description: 'Initial checked state when uncontrolled',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the checkbox can be toggled',
    },
    'aria-invalid': {
      control: { type: 'boolean' },
      description:
        'Marks the control as failing validation, which recolours its border',
    },
    className: {
      control: { type: 'text' },
      description:
        'Additional CSS classes. Note that the size variants defined internally are not exposed as a prop — override the size here if you need one.',
    },
  },
  args: {
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    'aria-label': 'Accept',
  },
};

export const Checked: Story = {
  args: {
    defaultChecked: true,
    'aria-label': 'Accept',
  },
};

export const WithLabel: Story = {
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
          'The shape to reach for by default. Wrapping the checkbox in a `Label` gives it a name and makes the text a click target.',
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    'aria-label': 'Unavailable option',
  },
};

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    defaultChecked: true,
    'aria-label': 'Locked option',
  },
};

export const Invalid: Story = {
  args: {
    'aria-invalid': true,
    'aria-label': 'Required agreement',
  },
  parameters: {
    docs: {
      description: {
        story:
          '`aria-invalid` recolours the border to the destructive token. It carries no message of its own — pair it with `FormMessage` in a real form.',
      },
    },
  },
};

export const Controlled: Story = {
  render: () => {
    const ControlledCheckbox = () => {
      const [checked, setChecked] = React.useState(false);

      return (
        <div className='flex flex-col gap-3'>
          <Label className='flex items-center gap-2'>
            <Checkbox
              checked={checked}
              onCheckedChange={value => setChecked(value === true)}
            />
            {'Notify me when this species comes into season'}
          </Label>
          <p className='text-muted-foreground text-xs'>
            {checked ? 'Notifications on' : 'Notifications off'}
          </p>
        </div>
      );
    };

    return <ControlledCheckbox />;
  },
  parameters: {
    docs: {
      description: {
        story:
          '`onCheckedChange` hands back `true`, `false` or `"indeterminate"`, so a boolean state needs the comparison rather than a direct assignment.',
      },
    },
  },
};

export const AllStates: Story = {
  render: () => (
    <div className='grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-4'>
      {[
        { label: 'unchecked', props: {} },
        { label: 'checked', props: { defaultChecked: true } },
        { label: 'disabled', props: { disabled: true } },
        {
          label: 'disabled + checked',
          props: { disabled: true, defaultChecked: true },
        },
        { label: 'invalid', props: { 'aria-invalid': true } },
      ].map(state => (
        <React.Fragment key={state.label}>
          <Checkbox aria-label={state.label} {...state.props} />
          <p className='text-muted-foreground font-mono text-xs'>
            {state.label}
          </p>
        </React.Fragment>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Every state the checkbox can be in, in one view.',
      },
    },
  },
};

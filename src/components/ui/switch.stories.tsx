import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const meta: Meta<typeof Switch> = {
  title: 'Atoms/Switch',
  component: Switch,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A toggle for a setting that takes effect immediately. That is the whole distinction from Checkbox: a switch turns something on now, a checkbox records a choice that a submit button will act on later.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    checked: {
      control: { type: 'boolean' },
      description: 'Controlled on/off state',
    },
    defaultChecked: {
      control: { type: 'boolean' },
      description: 'Initial state when uncontrolled',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the switch can be toggled',
    },
    className: {
      control: { type: 'text' },
      description:
        'Additional CSS classes. The internal size variants are not exposed as a prop — override the dimensions here if you need to.',
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
    'aria-label': 'Enable offline maps',
  },
};

export const Checked: Story = {
  args: {
    defaultChecked: true,
    'aria-label': 'Enable offline maps',
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className='flex items-center gap-3'>
      <Switch id='offline-maps' />
      <Label htmlFor='offline-maps'>{'Download maps for offline use'}</Label>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A switch sits beside its label rather than wrapping it, since the label is usually a full sentence describing what turning it on does.',
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    'aria-label': 'Unavailable setting',
  },
};

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    defaultChecked: true,
    'aria-label': 'Locked setting',
  },
};

export const Controlled: Story = {
  render: () => {
    const ControlledSwitch = () => {
      const [enabled, setEnabled] = React.useState(false);

      return (
        <div className='flex w-72 flex-col gap-3'>
          <div className='flex items-center justify-between gap-4'>
            <Label htmlFor='controlled-switch'>{'Offline maps'}</Label>
            <Switch
              id='controlled-switch'
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
          <p className='text-muted-foreground text-xs'>
            {enabled
              ? 'Regions will be cached for offline use.'
              : 'Maps load from the network only.'}
          </p>
        </div>
      );
    };

    return <ControlledSwitch />;
  },
  parameters: {
    docs: {
      description: {
        story:
          '`onCheckedChange` hands back a plain boolean, so it can be passed a setter directly — unlike Checkbox, which can also report an indeterminate state.',
      },
    },
  },
};

export const AllStates: Story = {
  render: () => (
    <div className='grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-4'>
      {[
        { label: 'off', props: {} },
        { label: 'on', props: { defaultChecked: true } },
        { label: 'disabled · off', props: { disabled: true } },
        {
          label: 'disabled · on',
          props: { disabled: true, defaultChecked: true },
        },
      ].map(state => (
        <React.Fragment key={state.label}>
          <Switch aria-label={state.label} {...state.props} />
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
        story: 'Every state the switch can be in, in one view.',
      },
    },
  },
};

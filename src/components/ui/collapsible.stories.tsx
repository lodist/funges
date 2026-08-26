import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown } from '@/lib/icons';

const meta: Meta<typeof Collapsible> = {
  title: 'Atoms/Collapsible',
  component: Collapsible,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Show and hide a region of content. Unstyled on purpose — it supplies the open/closed state and the accessibility wiring, and nothing else. Every visual decision, including the disclosure arrow, belongs to the caller.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    defaultOpen: {
      control: { type: 'boolean' },
      description: 'Whether the content starts expanded when uncontrolled',
    },
    open: {
      control: { type: 'boolean' },
      description: 'The expanded state when controlled',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the trigger responds at all',
    },
    className: {
      control: { type: 'text' },
      description: 'Additional CSS classes',
    },
  },
  args: {
    defaultOpen: false,
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const HABITAT_NOTES =
  'Mature beech and oak, north-facing slopes, on soil that has stayed damp for several days. Fruiting bodies appear four to eight days after sustained rain once night temperatures settle above eight degrees.';

export const Default: Story = {
  render: args => (
    <Collapsible className='w-80' {...args}>
      <CollapsibleTrigger asChild>
        <Button variant='outline' size='sm'>
          {'Habitat notes'}
          <ChevronDown />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='text-muted-foreground pt-3 text-sm'>
        {HABITAT_NOTES}
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const Open: Story = {
  render: () => (
    <Collapsible defaultOpen className='w-80'>
      <CollapsibleTrigger asChild>
        <Button variant='outline' size='sm'>
          {'Habitat notes'}
          <ChevronDown />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='text-muted-foreground pt-3 text-sm'>
        {HABITAT_NOTES}
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const WithRotatingChevron: Story = {
  render: () => (
    <Collapsible className='group w-80'>
      <CollapsibleTrigger asChild>
        <Button variant='outline' size='sm'>
          {'Habitat notes'}
          <ChevronDown className='transition-transform duration-base ease-standard group-data-[state=open]:rotate-180' />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='text-muted-foreground pt-3 text-sm'>
        {HABITAT_NOTES}
      </CollapsibleContent>
    </Collapsible>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The component exposes its state as a `data-state` attribute, which is how a caller animates a chevron without tracking the state itself. The rotation rides the shared motion tokens rather than a hardcoded duration.',
      },
    },
  },
};

export const Disabled: Story = {
  render: () => (
    <Collapsible disabled className='w-80'>
      <CollapsibleTrigger asChild>
        <Button variant='outline' size='sm' disabled>
          {'Habitat notes unavailable'}
          <ChevronDown />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='text-muted-foreground pt-3 text-sm'>
        {HABITAT_NOTES}
      </CollapsibleContent>
    </Collapsible>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Disabling the collapsible stops it toggling but does not grey out the trigger — the trigger is the caller’s own component, so it needs disabling too.',
      },
    },
  },
};

export const Controlled: Story = {
  render: () => {
    const ControlledCollapsible = () => {
      const [open, setOpen] = React.useState(false);

      return (
        <div className='flex w-80 flex-col gap-3'>
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button variant='outline' size='sm'>
                {open ? 'Hide habitat notes' : 'Show habitat notes'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className='text-muted-foreground pt-3 text-sm'>
              {HABITAT_NOTES}
            </CollapsibleContent>
          </Collapsible>
          <p className='text-muted-foreground font-mono text-xs'>
            {open ? 'open' : 'closed'}
          </p>
        </div>
      );
    };

    return <ControlledCollapsible />;
  },
};

export const AllStates: Story = {
  render: () => (
    <div className='flex flex-col gap-8'>
      {[
        { label: 'closed', props: {} },
        { label: 'open', props: { defaultOpen: true } },
        { label: 'disabled', props: { disabled: true } },
      ].map(state => (
        <div key={state.label} className='flex flex-col gap-2'>
          <p className='text-muted-foreground font-mono text-xs'>
            {state.label}
          </p>
          <Collapsible className='w-80' {...state.props}>
            <CollapsibleTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                disabled={state.label === 'disabled'}
              >
                {'Habitat notes'}
                <ChevronDown />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className='text-muted-foreground pt-3 text-sm'>
              {HABITAT_NOTES}
            </CollapsibleContent>
          </Collapsible>
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: 'Both states plus the disabled treatment, in one view.',
      },
    },
  },
};

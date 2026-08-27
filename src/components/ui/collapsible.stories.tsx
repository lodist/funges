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
          'Show and hide a region of content. It owns the open/closed state, the accessibility wiring and the height animation, and nothing else — the animation is the one visual it cannot leave to the caller, because padding on the animating box would keep the closed state its own padding tall, and a caller cannot rotate a glyph on the shared tokens without wiring `data-state` itself. The trigger turns its trailing glyph 180° on the same duration and curve the height travels on, so the arrow and the content finish together; a leading icon is left alone. Every other visual decision, the disclosure arrow included, belongs to the caller, and a className goes on an inner box rather than the animating one.',
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

export const Disabled: Story = {
  render: () => (
    <Collapsible disabled className='w-80'>
      <CollapsibleTrigger asChild>
        <Button variant='outline' size='sm'>
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
          'Disabling the collapsible stops it toggling and greys the trigger with it: the primitive forwards `disabled` to the trigger, and `asChild` lands it on the caller’s own component, so no second prop is needed.',
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
              <Button variant='outline' size='sm'>
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
        story:
          'Both states plus the disabled treatment, in one view. Only the root is disabled — the trigger greys itself.',
      },
    },
  },
};

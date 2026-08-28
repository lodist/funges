import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const meta: Meta<typeof Sheet> = {
  title: 'Atoms/Sheet',
  component: Sheet,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A panel that slides in from an edge. The `floating` elevation level, and it rides `--transition-duration-slow` because it covers real distance. Reach for it over a Dialog when the content is a panel to work in rather than a decision to make.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    defaultOpen: {
      control: { type: 'boolean' },
      description: 'Open on mount, without a click',
    },
    open: {
      control: { type: 'boolean' },
      description: 'Open state when controlled',
    },
    modal: {
      control: { type: 'boolean' },
      description:
        'When true (the default) the content behind is inert while the sheet is open',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const SheetBody = () => (
  <div className='flex flex-col gap-4 px-4'>
    <div className='flex flex-col gap-2'>
      <Label htmlFor='sheet-region'>{'Region name'}</Label>
      <Input id='sheet-region' placeholder='North slope' />
    </div>
    <p className='text-muted-foreground text-sm'>
      {
        'Downloading a region caches its map tiles on this device so the map keeps working without a connection.'
      }
    </p>
  </div>
);

export const Default: Story = {
  render: args => (
    <Sheet {...args}>
      <SheetTrigger asChild>
        <Button variant='outline'>{'Open sheet'}</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{'Offline maps'}</SheetTitle>
          <SheetDescription>
            {'Choose a region to make available offline.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody />
        <SheetFooter>
          <Button>{'Download'}</Button>
          <SheetClose asChild>
            <Button variant='outline'>{'Cancel'}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const FromRight: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant='outline'>{'Open from right'}</Button>
      </SheetTrigger>
      <SheetContent side='right'>
        <SheetHeader>
          <SheetTitle>{'Offline maps'}</SheetTitle>
          <SheetDescription>
            {'The default side. Slides in from the trailing edge.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody />
      </SheetContent>
    </Sheet>
  ),
};

export const FromLeft: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant='outline'>{'Open from left'}</Button>
      </SheetTrigger>
      <SheetContent side='left'>
        <SheetHeader>
          <SheetTitle>{'Navigation'}</SheetTitle>
          <SheetDescription>
            {'What the sidebar becomes on a narrow viewport.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody />
      </SheetContent>
    </Sheet>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The left side is what `Sidebar` reaches for on mobile — the off-canvas nav is a Sheet underneath. ' +
          'That branch ships unmounted: the root route renders `AppSidebar` on desktop only, and mobile navigation goes through `MobileNavbar`.',
      },
    },
  },
};

export const FromTop: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant='outline'>{'Open from top'}</Button>
      </SheetTrigger>
      <SheetContent side='top'>
        <SheetHeader>
          <SheetTitle>{'Filters'}</SheetTitle>
          <SheetDescription>
            {'Height is content-driven rather than full-bleed.'}
          </SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const FromBottom: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant='outline'>{'Open from bottom'}</Button>
      </SheetTrigger>
      <SheetContent side='bottom'>
        <SheetHeader>
          <SheetTitle>{'Actions'}</SheetTitle>
          <SheetDescription>
            {'The mobile action sheet: rounded top, drag handle, no border.'}
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button>{'Save this spot'}</Button>
          <SheetClose asChild>
            <Button variant='outline'>{'Cancel'}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The bottom side is styled differently on purpose — a rounded top edge and a drag handle, since a bottom sheet reads as something you pull up rather than a panel that appears.',
      },
    },
  },
};

export const Controlled: Story = {
  render: () => {
    const ControlledSheet = () => {
      const [open, setOpen] = React.useState(false);

      return (
        <div className='flex flex-col items-center gap-3'>
          <Button variant='outline' onClick={() => setOpen(true)}>
            {'Open from outside'}
          </Button>
          <p className='text-muted-foreground font-mono text-xs'>
            {open ? 'open' : 'closed'}
          </p>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{'Controlled sheet'}</SheetTitle>
                <SheetDescription>
                  {'Opened by state rather than by a trigger.'}
                </SheetDescription>
              </SheetHeader>
              <SheetFooter>
                <Button onClick={() => setOpen(false)}>{'Close'}</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      );
    };

    return <ControlledSheet />;
  },
};

export const AllSides: Story = {
  render: () => (
    <div className='flex flex-wrap gap-3'>
      {(['top', 'right', 'bottom', 'left'] as const).map(side => (
        <Sheet key={side}>
          <SheetTrigger asChild>
            <Button variant='outline' size='sm'>
              {side}
            </Button>
          </SheetTrigger>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle>{`Sheet from ${side}`}</SheetTitle>
              <SheetDescription>
                {
                  'The left and right sides are full-height; top and bottom size to their content.'
                }
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'All four sides as triggers. Only one sheet can be open at a time, so this matrix is a row of buttons rather than four open panels.',
      },
    },
  },
};

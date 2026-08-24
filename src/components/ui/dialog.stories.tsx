import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const meta: Meta<typeof Dialog> = {
  title: 'Atoms/Dialog',
  component: Dialog,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A blocking modal behind a scrim. The `overlay` elevation level, and the one surface that is never glass — a dialog has to hold its contrast over whatever the map happens to be showing. Use a Sheet instead when the content is a panel rather than a decision.',
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
        'When true (the default) the content behind is inert and the scroll is locked',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <Dialog {...args}>
      <DialogTrigger asChild>
        <Button variant='outline'>{'Open dialog'}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{'Delete this region?'}</DialogTitle>
          <DialogDescription>
            {
              'The offline tiles for this region will be removed from this device. You can download them again later.'
            }
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline'>{'Cancel'}</Button>
          </DialogClose>
          <Button variant='destructive'>{'Delete'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Open: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant='outline'>{'Open dialog'}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{'Delete this region?'}</DialogTitle>
          <DialogDescription>
            {
              'The offline tiles for this region will be removed from this device.'
            }
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline'>{'Cancel'}</Button>
          </DialogClose>
          <Button variant='destructive'>{'Delete'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Open on mount, so the `overlay` elevation and the scrim are visible without interaction.',
      },
    },
  },
};

export const WithForm: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant='outline'>{'Name this region'}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{'Name this region'}</DialogTitle>
          <DialogDescription>
            {'Give the download a name you will recognise later.'}
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='region-name'>{'Region name'}</Label>
          <Input id='region-name' placeholder='North slope' />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline'>{'Cancel'}</Button>
          </DialogClose>
          <Button>{'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Focus lands on the first focusable element when the dialog opens, which is why the input comes before the footer buttons in the DOM.',
      },
    },
  },
};

export const WithoutCloseButton: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant='outline'>{'Open dialog'}</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{'Choose a plan'}</DialogTitle>
          <DialogDescription>
            {'Pick one of the options below to continue.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline'>{'Not now'}</Button>
          </DialogClose>
          <Button>{'Continue'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Dropping the corner X forces the choice into the footer. Escape and the scrim still dismiss it, so this does not make the dialog inescapable — if you need that, disable those too, and think hard first.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant='outline'>{'Open dialog'}</Button>
      </DialogTrigger>
      <DialogContent className='max-h-[80vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{'Foraging guidelines'}</DialogTitle>
          <DialogDescription>
            {'Read these before collecting anything.'}
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-3 text-sm'>
          {Array.from({ length: 12 }, (_, i) => (
            <p key={i}>
              {
                'Take only what you will use, leave the mycelium undisturbed, and never clear a patch entirely — a picked patch that is left intact fruits again within the season.'
              }
            </p>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>{'Understood'}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The content does not scroll on its own — a tall dialog needs `max-h-*` and `overflow-y-auto`, or it grows past the viewport.',
      },
    },
  },
};

export const Controlled: Story = {
  render: () => {
    const ControlledDialog = () => {
      const [open, setOpen] = React.useState(false);

      return (
        <div className='flex flex-col items-center gap-3'>
          <Button variant='outline' onClick={() => setOpen(true)}>
            {'Open from outside'}
          </Button>
          <p className='text-muted-foreground font-mono text-xs'>
            {open ? 'open' : 'closed'}
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{'Controlled dialog'}</DialogTitle>
                <DialogDescription>
                  {
                    'Opened by state rather than by a trigger, which is what you need when something other than a button opens it.'
                  }
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>{'Close'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      );
    };

    return <ControlledDialog />;
  },
  parameters: {
    docs: {
      description: {
        story:
          'A controlled dialog needs no `DialogTrigger` at all. Note that `DialogTitle` is still required — Radix warns without one, because a dialog with no accessible name is unusable with a screen reader.',
      },
    },
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className='flex flex-wrap gap-3'>
      {[
        { label: 'With close button', showClose: true },
        { label: 'Without close button', showClose: false },
      ].map(variant => (
        <Dialog key={variant.label}>
          <DialogTrigger asChild>
            <Button variant='outline' size='sm'>
              {variant.label}
            </Button>
          </DialogTrigger>
          <DialogContent showCloseButton={variant.showClose}>
            <DialogHeader>
              <DialogTitle>{variant.label}</DialogTitle>
              <DialogDescription>
                {'The same dialog, with and without the corner dismiss.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant='outline'>{'Close'}</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Dialog has one real variant — whether the corner dismiss is rendered. Both are here as triggers rather than open at once, since two modals cannot share a screen.',
      },
    },
  },
};

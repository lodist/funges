import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Settings } from 'lucide-react';

const meta: Meta<typeof DropdownMenu> = {
  title: 'Atoms/DropdownMenu',
  component: DropdownMenu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A menu of actions, on a `floating` surface. Actions, not values — a menu that picks a value is a Select, and the difference matters because a menu closes on choose while a select reports a selection.',
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
        'When true (the default) the page behind is inert while the menu is open',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger asChild>
        <Button variant='outline'>{'Open menu'}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>{'Save this region'}</DropdownMenuItem>
        <DropdownMenuItem>{'Share'}</DropdownMenuItem>
        <DropdownMenuItem>{'Export as GPX'}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const Open: Story = {
  render: () => (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='outline'>{'Already open'}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>{'Save this region'}</DropdownMenuItem>
        <DropdownMenuItem>{'Share'}</DropdownMenuItem>
        <DropdownMenuItem>{'Export as GPX'}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Forced open so the floating surface is visible without interaction. `modal={false}` keeps the rest of the docs page usable while it is open.',
      },
    },
  },
};

export const OnIconButton: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='icon' aria-label='More actions'>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem>{'Edit'}</DropdownMenuItem>
        <DropdownMenuItem>{'Duplicate'}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant='destructive'>{'Delete'}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The overflow-menu shape. `align="end"` keeps the surface inside the viewport when the trigger sits at the right edge.',
      },
    },
  },
};

export const WithLabelsAndGroups: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='icon' aria-label='Settings'>
          <Settings />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56'>
        <DropdownMenuLabel>{'Map'}</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>
            {'Reset view'}
            <DropdownMenuShortcut>{'⌘R'}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            {'Locate me'}
            <DropdownMenuShortcut>{'⌘L'}</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{'Data'}</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem>{'Refresh forecast'}</DropdownMenuItem>
          <DropdownMenuItem>{'Download for offline'}</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  parameters: {
    docs: {
      description: {
        story:
          '`DropdownMenuShortcut` only *displays* a shortcut — it does not bind one. The key handler is still the caller’s job.',
      },
    },
  },
};

export const WithCheckboxItems: Story = {
  render: () => {
    const CheckboxMenu = () => {
      const [showMushrooms, setShowMushrooms] = React.useState(true);
      const [showPlants, setShowPlants] = React.useState(false);

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline'>{'Layers'}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className='w-56'>
            <DropdownMenuLabel>{'Visible layers'}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showMushrooms}
              onCheckedChange={setShowMushrooms}
            >
              {'Mushrooms'}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showPlants}
              onCheckedChange={setShowPlants}
            >
              {'Plants'}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    };

    return <CheckboxMenu />;
  },
  parameters: {
    docs: {
      description: {
        story:
          'Checkbox items stay open on click, unlike plain items — toggling several settings should not mean reopening the menu each time.',
      },
    },
  },
};

export const WithRadioItems: Story = {
  render: () => {
    const RadioMenu = () => {
      const [focus, setFocus] = React.useState('mixed');

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline'>{'Focus'}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className='w-56'>
            <DropdownMenuLabel>{'Show'}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={focus} onValueChange={setFocus}>
              <DropdownMenuRadioItem value='mixed'>
                {'Mushrooms and plants'}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value='mushrooms'>
                {'Mushrooms only'}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value='plants'>
                {'Plants only'}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    };

    return <RadioMenu />;
  },
};

export const WithSubmenu: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline'>{'Export'}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56'>
        <DropdownMenuItem>{'Copy link'}</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{'Download as'}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>{'GPX'}</DropdownMenuItem>
            <DropdownMenuItem>{'GeoJSON'}</DropdownMenuItem>
            <DropdownMenuItem>{'CSV'}</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const WithDisabledItem: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline'>{'Open menu'}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>{'Save this region'}</DropdownMenuItem>
        <DropdownMenuItem disabled>
          {'Download for offline (unavailable)'}
        </DropdownMenuItem>
        <DropdownMenuItem>{'Share'}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const AllItemTypes: Story = {
  render: () => (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='outline'>{'Every item type'}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-64'>
        <DropdownMenuLabel>{'Label'}</DropdownMenuLabel>
        <DropdownMenuItem>{'Plain item'}</DropdownMenuItem>
        <DropdownMenuItem>
          {'With shortcut'}
          <DropdownMenuShortcut>{'⌘K'}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem inset>{'Inset item'}</DropdownMenuItem>
        <DropdownMenuItem disabled>{'Disabled item'}</DropdownMenuItem>
        <DropdownMenuItem variant='destructive'>
          {'Destructive item'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>
          {'Checkbox item'}
        </DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value='a'>
          <DropdownMenuRadioItem value='a'>
            {'Radio item'}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{'Submenu trigger'}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>{'Nested item'}</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Every item type the menu offers, open at once — the matrix a reviewer can eyeball in a single screenshot.',
      },
    },
  },
};

import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent, within } from 'storybook/test';

import { CategoryChips, type CategoryChip } from '@/components/CategoryChips';
import { CATEGORY_ICONS } from '@/lib/categoryIcons';

/**
 * Molecule: category chips.
 *
 * The species-type filter: a row of pill chips, each one of our own type icons
 * plus its label, that filters a list in place. It composes only the Button
 * atom (ghost, default 44px size — the touch floor) and owns no state — the caller holds the value — so it
 * meets both molecule conditions. Rendered on three screens: the map species
 * panel, the "Species in this area" list and the Species page. Before this,
 * the first two each hand-rolled the chip and the Species page used a Select,
 * so the same filter looked different in each place.
 *
 * **Selected is marked by weight and a soft lift, never a colour swap**
 * (Trailhead #213): every chip keeps the same neutral fill, so the row reads
 * as one control rather than a call to action.
 *
 * **Two tones.** `muted` sits on page and dialog surfaces; `glass` is the
 * translucent card fill the map species panel needs over the blurred map.
 *
 * **Labels hide below `sm:`** and the icons carry the row, which is why each
 * chip also takes its label as `aria-label`: the visible label is display:none
 * on a phone and would otherwise leave the button nameless.
 */

const CHIPS: CategoryChip[] = [
  { value: 'all', label: 'All types', icon: CATEGORY_ICONS.all },
  { value: 'mushroom', label: 'Mushrooms', icon: CATEGORY_ICONS.mushroom },
  { value: 'plant', label: 'Plants', icon: CATEGORY_ICONS.plant },
  { value: 'berry', label: 'Berries', icon: CATEGORY_ICONS.berry },
  { value: 'nut', label: 'Nuts', icon: CATEGORY_ICONS.nut },
  { value: 'flower', label: 'Flowers', icon: CATEGORY_ICONS.flower },
  { value: 'spectacle', label: 'Spectacles', icon: CATEGORY_ICONS.spectacle },
];

const meta: Meta<typeof CategoryChips> = {
  title: 'Molecules/Category chips',
  component: CategoryChips,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The species-type filter chips, shared by the map species panel, the area species list and the Species page.',
      },
    },
  },
  argTypes: {
    chips: {
      control: false,
      description:
        'The chips, in order: `value`, `label` and `icon` (a URL from `CATEGORY_ICONS`). Callers prepend `all`; only the map panel appends `spectacle`.',
    },
    value: {
      control: { type: 'select' },
      options: CHIPS.map(chip => chip.value),
      description: 'The selected chip’s `value`.',
    },
    onChange: {
      description: 'Called with the clicked chip’s `value`.',
    },
    tone: {
      control: { type: 'inline-radio' },
      options: ['muted', 'glass'],
      description:
        '`muted` on page and dialog surfaces; `glass` over the map or a photo.',
    },
    className: {
      control: { type: 'text' },
      description: 'Extra classes for the row (it centres and wraps).',
    },
  },
  args: {
    chips: CHIPS,
    value: 'all',
    tone: 'muted',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Over the map the panel is a dark blur; a flat dark wash stands in for it.
const MapBackdrop = ({ children }: { children: React.ReactNode }) => (
  <div className='rounded-card bg-neutral-700 p-6'>{children}</div>
);

export const Default: Story = {};

export const OneTypeSelected: Story = {
  args: { value: 'mushroom' },
  parameters: {
    docs: {
      description: {
        story:
          'A type picked: the chip turns semibold and lifts; its fill stays the same.',
      },
    },
  },
};

export const Glass: Story = {
  args: { tone: 'glass', value: 'berry' },
  decorators: [
    Story => (
      <MapBackdrop>
        <Story />
      </MapBackdrop>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story: 'The map species panel’s tone, over the blurred map.',
      },
    },
  },
};

export const Controlled: Story = {
  render: args => {
    const ControlledChips = () => {
      const [value, setValue] = React.useState('all');
      return <CategoryChips {...args} value={value} onChange={setValue} />;
    };
    return <ControlledChips />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const berries = canvas.getByRole('button', { name: 'Berries' });
    await userEvent.click(berries);
    await expect(berries).toHaveAttribute('aria-pressed', 'true');
    await expect(
      canvas.getByRole('button', { name: 'All types' })
    ).toHaveAttribute('aria-pressed', 'false');
  },
  parameters: {
    docs: {
      description: {
        story:
          'The real behaviour: a click selects that type and releases the previous one.',
      },
    },
  },
};

export const AllTones: Story = {
  render: args => (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground font-mono text-xs'>{'muted'}</p>
        <CategoryChips {...args} tone='muted' value='plant' />
      </div>
      <div className='flex flex-col gap-2'>
        <p className='text-muted-foreground font-mono text-xs'>{'glass'}</p>
        <MapBackdrop>
          <CategoryChips {...args} tone='glass' value='plant' />
        </MapBackdrop>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Both tones, each with one chip selected, in one view.',
      },
    },
  },
};

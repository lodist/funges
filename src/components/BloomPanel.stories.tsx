import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent, within } from 'storybook/test';
import BloomPanel from '@/components/BloomPanel';
import { BLOOM_SPOTS, unixDay, type BloomPeaks } from '@/lib/bloom';

/**
 * Organism: the cherry blossom panel.
 *
 * Takes the score legend's place under the forecast slider while the cherry
 * blossom layer is shown (`AdvancedMap.tsx`). It owns local state (the list
 * toggle) and reads i18n, so it is an organism, not a molecule.
 *
 * The ramp is days to peak on the slider's day: grey more than three weeks out,
 * pink deepening to the peak, fading for two weeks after. The list sorts the
 * viewing spots by how soon they peak, each for its own variety.
 */

const DAY = unixDay(new Date(2027, 3, 1));
// Spread the spots over the whole ramp, from a month out to two weeks past.
const PEAKS: BloomPeaks = Object.fromEntries(
  BLOOM_SPOTS.map((spot, index) => [spot.id, DAY - 14 + ((index * 7) % 45)])
);

const meta: Meta<typeof BloomPanel> = {
  title: 'Organisms/Bloom panel',
  component: BloomPanel,
  tags: ['autodocs'],
  args: { peaks: PEAKS, day: DAY },
  argTypes: {
    peaks: {
      control: { type: 'object' },
      description:
        'Predicted peak per spot id, in days since 1970-01-01, from `<region>_bloom_spots.json` on R2.',
    },
    day: {
      control: { type: 'number' },
      description:
        'The slider’s day in the same unit: today plus the forecast offset.',
    },
    onSelectSpot: {
      description:
        'Called with the spot a list row names; the map flies to it.',
    },
    className: {
      control: { type: 'text' },
      description: 'Placement inside the map’s bottom overlay.',
    },
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The cherry blossom legend and viewing-spot list that replaces the score legend on the map.',
      },
    },
  },
  decorators: [
    Story => (
      <div className='w-[24rem] p-4'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SpotsOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { expanded: false });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getAllByRole('listitem')).toHaveLength(
      BLOOM_SPOTS.length
    );
  },
};

/** Before 1 February, or on last season's file: no list, just when it starts. */
export const OffSeason: Story = {
  args: { peaks: {}, day: DAY },
};

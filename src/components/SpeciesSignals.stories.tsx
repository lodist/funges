import type { Meta, StoryObj } from '@storybook/tanstack-react';

import { ConditionsMeter, LookalikeTag } from '@/components/SpeciesSignals';
import { BAND_SURFACE_CLASS } from '@/lib/band-surface';

/**
 * Molecule: species signals.
 *
 * The two marks a species carries wherever it is listed for today: how good
 * its conditions are, and the worst toxic look-alike to check against. Worth
 * Foraging Now, the Species page and the Recipes page all render them, so the
 * three lists cannot disagree about what a score or a warning looks like.
 *
 * **The meter is ten pills of one green.** Score is depth, never a new hue:
 * `--primary-text` on paper, `--happy-500` on the deep-green band. The
 * conditions word and the number sit beside it; `compact` keeps the number
 * and moves the word to screen readers.
 *
 * **The tag names the look-alike.** A severity alone gives the reader nothing
 * to check, so the scientific name always follows it, and it wraps rather
 * than truncating in German.
 */
const meta: Meta<typeof ConditionsMeter> = {
  title: 'Molecules/Species signals',
  component: ConditionsMeter,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    score: {
      control: { type: 'range', min: 0, max: 10, step: 0.1 },
      description: "Today's score, 0–10.",
    },
    tone: {
      control: { type: 'inline-radio' },
      options: ['paper', 'band'],
      description: '`paper` on a card; `band` on the deep-green field.',
    },
    compact: {
      control: 'boolean',
      description: 'Shorter pills and the number alone, for tiles.',
    },
  },
  args: { score: 8.7, tone: 'paper', compact: false },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = { args: { compact: true } };

export const OnTheBand: Story = {
  args: { tone: 'band', score: 9.6 },
  decorators: [
    Story => (
      <div className={`${BAND_SURFACE_CLASS} rounded-card p-6`}>
        <Story />
      </div>
    ),
  ],
};

export const LookalikeTags: Story = {
  render: () => (
    <div className='flex max-w-56 flex-col gap-3'>
      <LookalikeTag scientificName={'Omphalotus olearius'} severity='toxic' />
      <LookalikeTag
        scientificName={'Lepiota brunneoincarnata'}
        severity='lethal'
      />
    </div>
  ),
};

/** Every state together: the three conditions levels on both grounds, and
 *  both warning severities. */
export const Matrix: Story = {
  render: () => (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-3'>
        {[9.4, 7.5, 5.2].map(score => (
          <ConditionsMeter key={score} score={score} />
        ))}
        <ConditionsMeter score={9.4} compact />
      </div>
      <div
        className={`${BAND_SURFACE_CLASS} flex flex-col gap-3 rounded-card p-6`}
      >
        {[9.4, 7.5, 5.2].map(score => (
          <ConditionsMeter key={score} score={score} tone='band' />
        ))}
      </div>
      <div className='flex max-w-56 flex-col gap-3'>
        <LookalikeTag scientificName={'Omphalotus olearius'} severity='toxic' />
        <LookalikeTag
          scientificName={'Lepiota brunneoincarnata'}
          severity='lethal'
        />
      </div>
    </div>
  ),
};

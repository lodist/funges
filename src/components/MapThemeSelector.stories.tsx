import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent, waitFor } from 'storybook/test';
import MapThemeSelector from '@/components/MapThemeSelector';

/**
 * Molecule: map theme selector.
 *
 * The one popover in the app that is not Radix. It rides on the map chrome at
 * `AdvancedMap.tsx`, beside the locate and info buttons.
 *
 * It stays hand-rolled rather than becoming a `Select` because each row carries
 * a thumbnail and a two-line description, and `SelectItem`'s single text column
 * has nowhere to put either. What it does not get to keep is its own
 * vocabulary: the popover takes `rounded-card` + `elevation-floating`, the rows
 * take `rounded-xl` and the Menus focus tone with its dark twin, the caption
 * takes `.type-micro`, and the trigger declares `aria-expanded`. Escape closes
 * it, which Radix would have given the other two surfaces for free.
 */

const meta: Meta<typeof MapThemeSelector> = {
  title: 'Molecules/Map theme selector',
  component: MapThemeSelector,
  tags: ['autodocs'],
  argTypes: {
    className: {
      control: { type: 'text' },
      description:
        'Positioning for the container, not the popover. The map chrome uses it to place the trigger in the control stack.',
    },
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The map chrome’s theme picker: a hand-rolled popover of thumbnail rows, on the same surface vocabulary as Select and DropdownMenu.',
      },
    },
  },
  decorators: [
    // A tall flex row, deliberately: the map ships this in a flex-col, where
    // stretch is horizontal and the anchor hugs the trigger by accident. A row
    // stretches it vertically instead, which is the case that broke — so the
    // frame documents the harder context, and the Open story measures it.
    Story => (
      <div className='flex min-h-[34rem] w-[30rem] justify-end p-4'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const FLOOR = 44;

export const Default: Story = {};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLElement>(
      '[data-slot=map-theme-trigger]'
    )!;
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // The enter animation scales and fades, so both a measured height and
    // axe's contrast pass are wrong until it lands: a row measured at
    // scale 0.97 is short, and text at opacity 0 composites to 1.01:1
    // against the popover.
    const content = await waitFor(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-slot=map-theme-content]'
      );
      expect(getComputedStyle(el!).opacity).toBe('1');
      return el!;
    });

    const rows = content.querySelectorAll<HTMLElement>(
      '[data-slot=map-theme-item]'
    );
    await expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      // Rows clear the target floor and take the Menus radius, so this
      // surface cannot drift away from the two Radix ones it mirrors.
      await expect(
        Math.round(row.getBoundingClientRect().height)
      ).toBeGreaterThanOrEqual(FLOOR);
      await expect(getComputedStyle(row).borderRadius).toBe('12px');
    }

    // Exactly one row is pressed: the picker is single-choice.
    const pressed = content.querySelectorAll('[aria-pressed="true"]');
    await expect(pressed.length).toBe(1);

    // The popover hangs off the trigger, not off whatever box the caller's
    // layout stretched around it. `mt-2` is the whole gap.
    await expect(
      Math.round(
        content.getBoundingClientRect().top -
          trigger.getBoundingClientRect().bottom
      )
    ).toBe(8);
  },
  parameters: {
    docs: {
      description: {
        story:
          'Open, with the active theme pressed. Every row clears 44px and takes the 12px row radius.',
      },
    },
  },
};

export const ClosesOnEscape: Story = {
  play: async ({ canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLElement>(
      '[data-slot=map-theme-trigger]'
    )!;
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{Escape}');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() =>
      expect(document.querySelector('[data-slot=map-theme-content]')).toBeNull()
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Escape dismisses it. A hand-rolled popover gets no dismiss for free, and mousedown-outside alone leaves a keyboard user stuck in it.',
      },
    },
  },
};

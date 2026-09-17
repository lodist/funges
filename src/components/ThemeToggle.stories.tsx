import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent, waitFor } from 'storybook/test';

import { ThemeProvider } from '@/components/theme-provider';
import ThemeToggle from '@/components/ThemeToggle';

/**
 * Molecule: app theme switch.
 *
 * The only control that reaches `ThemeProvider`. The provider, the `useTheme`
 * hook and the `light`/`dark` classes it writes onto `<html>` all shipped long
 * before this did — the theme system was complete and simply had no surface,
 * so the stored preference could only ever be whatever the OS said.
 *
 * **Three options, not a two-state toggle.** `system` is the provider default,
 * and following the OS preference is a stated product commitment; a switch that
 * could only reach light or dark would remove a capability rather than add one.
 * The selected option reads `theme` — the *stored* preference — not the class
 * the provider resolved, so "System" stays selected after dark falls.
 *
 * A `radiogroup` rather than three buttons: the options are one exclusive
 * choice, so a screen reader should announce "2 of 3" and arrow keys should
 * move within the group, not tab through three unrelated controls. Each option
 * is icon-only with an `sr-only` label and a `title`, which is why the label
 * must exist in all six locales — `src/test/theme-toggle.test.tsx` asserts it.
 *
 * Ships in two places: the sidebar's Help flyout footer above `MapLastUpdated`
 * (desktop), and `SettingsPage` beside `LanguageSwitcher` (where mobile reaches
 * it, since the Help group is desktop-only).
 */

const meta: Meta<typeof ThemeToggle> = {
  title: 'Molecules/Theme toggle',
  component: ThemeToggle,
  tags: ['autodocs'],
  argTypes: {
    className: {
      control: { type: 'text' },
      description:
        'Sizing for the group. It fills its container by default — the Help flyout lets it span the footer, SettingsPage pins it to `w-40`.',
    },
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'The app’s light / dark / system switch — the only UI that writes to ThemeProvider.',
      },
    },
  },
  decorators: [
    // Its own provider: the component reads context, and the stories below
    // click through real theme changes rather than mocking setTheme.
    Story => (
      <ThemeProvider>
        <div className='w-56 p-4'>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const options = (canvasElement: HTMLElement) =>
  canvasElement.querySelectorAll<HTMLElement>(
    '[data-slot=theme-toggle-option]'
  );

const option = (canvasElement: HTMLElement, theme: string) =>
  canvasElement.querySelector<HTMLElement>(
    `[data-slot=theme-toggle-option][data-theme=${theme}]`
  )!;

export const Default: Story = {};

export const Semantics: Story = {
  play: async ({ canvasElement }) => {
    const group = canvasElement.querySelector<HTMLElement>(
      '[data-slot=theme-toggle]'
    )!;

    // One exclusive choice, announced as a group — not three loose buttons.
    await expect(group).toHaveAttribute('role', 'radiogroup');
    await expect(group).toHaveAccessibleName();
    await expect(options(canvasElement).length).toBe(3);

    // Exactly one is checked at any time, and every option carries a text
    // label despite being icon-only.
    const checked = canvasElement.querySelectorAll('[aria-checked="true"]');
    await expect(checked.length).toBe(1);
    for (const el of options(canvasElement)) {
      await expect(el).toHaveAccessibleName();
    }
  },
  parameters: {
    docs: {
      description: {
        story:
          'Radiogroup semantics: three options, exactly one checked, every icon-only option carrying an accessible name.',
      },
    },
  },
};

export const SwitchesTheme: Story = {
  play: async ({ canvasElement }) => {
    const root = document.documentElement;
    const before = root.className;

    await userEvent.click(option(canvasElement, 'dark'));
    await waitFor(() => expect(root).toHaveClass('dark'));
    await expect(option(canvasElement, 'dark')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(localStorage.getItem('vite-ui-theme')).toBe('dark');

    await userEvent.click(option(canvasElement, 'light'));
    await waitFor(() => expect(root).toHaveClass('light'));
    await expect(root).not.toHaveClass('dark');

    // Selecting System hands the choice back to the OS: the stored preference
    // is 'system' even though the resolved class is still concrete.
    await userEvent.click(option(canvasElement, 'system'));
    await expect(localStorage.getItem('vite-ui-theme')).toBe('system');
    await expect(option(canvasElement, 'system')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await waitFor(() => expect(root.className).toMatch(/light|dark/));

    // The switch writes to the real <html>, so leave the preview as we found
    // it rather than stranding the docs page in whichever theme ran last.
    localStorage.removeItem('vite-ui-theme');
    root.className = before;
  },
  parameters: {
    docs: {
      description: {
        story:
          'Clicking through all three: each writes the resolved class onto `<html>` and persists the preference. System stores `system` while still resolving to a concrete class.',
      },
    },
  },
};

export const InFlyoutFooter: Story = {
  decorators: [
    // The Help flyout's real footer: the toggle sits above MapLastUpdated in a
    // `gap-2` column, on the popover surface rather than the page ground.
    Story => (
      <ThemeProvider>
        <div className='w-56 rounded-card bg-popover p-1.5 elevation-floating'>
          <div className='px-4 py-1.5'>
            <div className='flex flex-col gap-2'>
              <Story />
              <span className='type-micro text-muted-foreground'>
                {'Map updated 2 days ago'}
              </span>
            </div>
          </div>
        </div>
      </ThemeProvider>
    ),
  ],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        story:
          'As it ships in the sidebar Help flyout, above `MapLastUpdated` on the popover surface.',
      },
    },
  },
};

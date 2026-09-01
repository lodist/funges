import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Bean, Flower2, Grape, Leaf, List, Mushroom } from '@/lib/icons';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const meta: Meta<typeof Select> = {
  title: 'Atoms/Select',
  component: Select,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'One choice from a list, revealed on demand. The trigger is `raised-subtle` input chrome; the content is a `floating` surface. Use it over a RadioGroup once the options stop fitting comfortably on screen.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    defaultValue: {
      control: { type: 'text' },
      description: 'Initially selected value when uncontrolled',
    },
    value: {
      control: { type: 'text' },
      description: 'Selected value when controlled',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the trigger can be opened',
    },
    required: {
      control: { type: 'boolean' },
      description: 'Marks the field required inside a form',
    },
  },
  args: {
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Every trigger is a tap target first. `default` is 48px and `sm` is the 44px
// floor itself — `sm` was h-8, which put the data screen's filter 12px under.
const FLOOR = 44;

// Radix marks the rest of the document aria-hidden while the popover is open,
// and the a11y addon runs axe after the play function — on a tree where the
// trigger is both focusable and inside that aria-hidden region. That is the
// primitive working, not a defect, so the story closes what it opened.
const withOpenContent = async (
  canvasElement: HTMLElement,
  assert: (ctx: { trigger: HTMLElement; content: HTMLElement }) => Promise<void>
) => {
  const trigger = within(canvasElement).getByRole('combobox');
  await userEvent.click(trigger);
  const content = await within(document.body).findByRole('listbox');
  // The popover enters on `zoom-in-95`, so anything measured before the
  // animation lands comes back scaled — a 16px glyph reads 15.
  await waitFor(() => {
    const style = getComputedStyle(content);
    expect(`${style.transform} ${style.opacity}`).toBe('none 1');
  });
  await assert({ trigger, content });
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(content.isConnected).toBe(false));
};

const SPECIES = [
  { value: 'chanterelle', label: 'Chanterelle' },
  { value: 'cep', label: 'Cep' },
  { value: 'hedgehog', label: 'Hedgehog mushroom' },
  { value: 'morel', label: 'Morel' },
];

export const Default: Story = {
  render: args => (
    <Select {...args}>
      <SelectTrigger className='w-56' aria-label='Species'>
        <SelectValue placeholder='Select a species' />
      </SelectTrigger>
      <SelectContent>
        {SPECIES.map(species => (
          <SelectItem key={species.value} value={species.value}>
            {species.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    await withOpenContent(canvasElement, async ({ trigger, content }) => {
      await expect(Math.round(trigger.getBoundingClientRect().height)).toBe(48);

      // The row column has to line up with where the trigger's px-4 puts the
      // closed value, or the label jumps sideways on open.
      const item = content.querySelector<HTMLElement>(
        '[data-slot=select-item]'
      )!;
      await expect(getComputedStyle(item).paddingLeft).toBe(
        getComputedStyle(trigger).paddingLeft
      );
      await expect(getComputedStyle(item).borderRadius).toBe('12px');
    });
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className='flex w-56 flex-col gap-2'>
      <Label id='species-label'>{'Species'}</Label>
      <Select>
        <SelectTrigger aria-labelledby='species-label'>
          <SelectValue placeholder='Select a species' />
        </SelectTrigger>
        <SelectContent>
          {SPECIES.map(species => (
            <SelectItem key={species.value} value={species.value}>
              {species.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The trigger is a button, not an input, so it takes its name from `aria-labelledby` rather than from a label’s `htmlFor`.',
      },
    },
  },
};

export const WithValue: Story = {
  render: () => (
    <Select defaultValue='cep'>
      <SelectTrigger className='w-56' aria-label='Species'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SPECIES.map(species => (
          <SelectItem key={species.value} value={species.value}>
            {species.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'With a value set, `SelectValue` needs no placeholder — it renders the selected item’s label.',
      },
    },
  },
};

export const Small: Story = {
  render: () => (
    <Select defaultValue='cep'>
      <SelectTrigger size='sm' className='w-48' aria-label='Species'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SPECIES.map(species => (
          <SelectItem key={species.value} value={species.value}>
            {species.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox');
    await expect(Math.round(trigger.getBoundingClientRect().height)).toBe(
      FLOOR
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'The `sm` trigger, used where a filter sits inside dense chrome rather than in a form. Dense means 44px and tighter type, not a smaller tap target.',
      },
    },
  },
};

const CATEGORIES = [
  { value: 'all', label: 'All types', Icon: List },
  { value: 'mushroom', label: 'Mushrooms', Icon: Mushroom },
  { value: 'plant', label: 'Plants', Icon: Leaf },
  { value: 'berry', label: 'Berries', Icon: Grape },
  { value: 'nut', label: 'Nuts', Icon: Bean },
  { value: 'flower', label: 'Flowers', Icon: Flower2 },
];

export const WithIcons: Story = {
  render: () => (
    <Select defaultValue='all'>
      <SelectTrigger className='w-56' aria-label='Category'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIES.map(({ value, label, Icon }) => (
          <SelectItem key={value} value={value}>
            <Icon />
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    await withOpenContent(canvasElement, async ({ trigger, content }) => {
      const closed = trigger.querySelector<HTMLElement>(
        '[data-slot=select-value] svg'
      )!;
      const open = content.querySelector<HTMLElement>(
        '[data-slot=select-item] svg'
      )!;

      // SelectValue clones the chosen row's children into the trigger, and the
      // rules SelectItem wrote do not travel with them. The closed glyph came
      // out at lucide's 24px against the row's 16px, hard against its label.
      await expect(Math.round(closed.getBoundingClientRect().width)).toBe(16);
      await expect(Math.round(closed.getBoundingClientRect().width)).toBe(
        Math.round(open.getBoundingClientRect().width)
      );

      const value = trigger.querySelector<HTMLElement>(
        '[data-slot=select-value]'
      )!;
      const row = open.closest('[data-slot=select-item]') as HTMLElement;
      await expect(getComputedStyle(value).columnGap).toBe('8px');
      await expect(getComputedStyle(value).columnGap).toBe(
        getComputedStyle(row).columnGap
      );
    });
  },
  parameters: {
    docs: {
      description: {
        story:
          'Rows that lead with a drawn icon — what the species filter ships. The glyph has to read the same size and sit at the same distance from its label whether the list is open or closed, which the trigger only manages because it repeats SelectItem’s icon rules for the children `SelectValue` clones into it.',
      },
    },
  },
};

export const Grouped: Story = {
  render: () => (
    <Select>
      <SelectTrigger className='w-56' aria-label='Species'>
        <SelectValue placeholder='Select a species' />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>{'Mushrooms'}</SelectLabel>
          <SelectItem value='chanterelle'>{'Chanterelle'}</SelectItem>
          <SelectItem value='cep'>{'Cep'}</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>{'Plants'}</SelectLabel>
          <SelectItem value='ramsons'>{'Ramsons'}</SelectItem>
          <SelectItem value='elderflower'>{'Elderflower'}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    await withOpenContent(canvasElement, async ({ content }) => {
      const label = content.querySelector<HTMLElement>(
        '[data-slot=select-label]'
      )!;
      const item = content.querySelector<HTMLElement>(
        '[data-slot=select-item]'
      )!;

      // The Micro role, the same one DropdownMenuLabel takes. The two used to
      // read 12px/400/muted against 14px/500/inherited for one role.
      const style = getComputedStyle(label);
      await expect(style.fontSize).toBe('12px');
      await expect(style.fontWeight).toBe('500');
      await expect(style.textTransform).toBe('uppercase');
      await expect(style.paddingLeft).toBe(getComputedStyle(item).paddingLeft);
    });
  },
  parameters: {
    docs: {
      description: {
        story:
          '`SelectGroup` with a `SelectLabel` gives the grouping real semantics, not just a heading — the label is announced as the group’s name.',
      },
    },
  },
};

export const WithDisabledItem: Story = {
  render: () => (
    <Select>
      <SelectTrigger className='w-56' aria-label='Species'>
        <SelectValue placeholder='Select a species' />
      </SelectTrigger>
      <SelectContent>
        {SPECIES.map(species => (
          <SelectItem
            key={species.value}
            value={species.value}
            disabled={species.value === 'morel'}
          >
            {species.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled defaultValue='cep'>
      <SelectTrigger className='w-56' aria-label='Species'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SPECIES.map(species => (
          <SelectItem key={species.value} value={species.value}>
            {species.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};

export const Invalid: Story = {
  render: () => (
    <div className='flex w-56 flex-col gap-2'>
      <Select>
        <SelectTrigger aria-invalid aria-label='Species'>
          <SelectValue placeholder='Select a species' />
        </SelectTrigger>
        <SelectContent>
          {SPECIES.map(species => (
            <SelectItem key={species.value} value={species.value}>
              {species.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className='text-destructive-text text-xs'>
        {'Please pick a species.'}
      </p>
    </div>
  ),
};

export const LongList: Story = {
  render: () => (
    <Select>
      <SelectTrigger className='w-56' aria-label='Region'>
        <SelectValue placeholder='Select a region' />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: 30 }, (_, i) => (
          <SelectItem key={i} value={`region-${i}`}>
            {`Region ${i + 1}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Past a certain length the content scrolls and grows its own scroll buttons. No configuration — it happens on overflow.',
      },
    },
  },
};

export const Controlled: Story = {
  render: () => {
    const ControlledSelect = () => {
      const [value, setValue] = React.useState('');

      return (
        <div className='flex w-56 flex-col gap-3'>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger aria-label='Species'>
              <SelectValue placeholder='Select a species' />
            </SelectTrigger>
            <SelectContent>
              {SPECIES.map(species => (
                <SelectItem key={species.value} value={species.value}>
                  {species.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className='text-muted-foreground font-mono text-xs'>
            {value || '(nothing selected)'}
          </p>
        </div>
      );
    };

    return <ControlledSelect />;
  },
  parameters: {
    docs: {
      description: {
        story:
          'Note that an empty string is not a usable item value — Radix reserves it for "no selection", so an item with `value=""` throws.',
      },
    },
  },
};

export const AllTriggerStates: Story = {
  render: () => (
    <div className='flex w-56 flex-col gap-6'>
      {[
        { label: 'placeholder', props: {}, triggerProps: {} },
        { label: 'value', props: { defaultValue: 'cep' }, triggerProps: {} },
        {
          label: 'small',
          props: { defaultValue: 'cep' },
          triggerProps: { size: 'sm' as const },
        },
        {
          label: 'disabled',
          props: { disabled: true, defaultValue: 'cep' },
          triggerProps: {},
        },
        {
          label: 'invalid',
          props: {},
          triggerProps: { 'aria-invalid': true },
        },
      ].map(state => (
        <div key={state.label} className='flex flex-col gap-1'>
          <p className='text-muted-foreground font-mono text-xs'>
            {state.label}
          </p>
          <Select {...state.props}>
            <SelectTrigger aria-label={state.label} {...state.triggerProps}>
              <SelectValue placeholder='Select a species' />
            </SelectTrigger>
            <SelectContent>
              {SPECIES.map(species => (
                <SelectItem key={species.value} value={species.value}>
                  {species.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Every trigger state in one view. The content is a portal, so only one list can be open at a time — the matrix covers the trigger, which is the part that varies.',
      },
    },
  },
};

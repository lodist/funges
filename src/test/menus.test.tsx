import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const dropdownSource = readFileSync(
  'src/components/ui/dropdown-menu.tsx',
  'utf8'
);
const selectSource = readFileSync('src/components/ui/select.tsx', 'utf8');

// The measured tone: --happy-100 is identical in both themes, so a light-only
// focus fill reads 1.18 against the popover in light and 10.02 in dark.
const FOCUS_LIGHT = ['focus:bg-happy-100', 'focus:text-happy-900'];
const FOCUS_DARK = ['dark:focus:bg-happy-900', 'dark:focus:text-happy-100'];

function renderMenu() {
  const { container } = render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>{'Open'}</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{'Layers'}</DropdownMenuLabel>
        <DropdownMenuItem>{'Plain'}</DropdownMenuItem>
        <DropdownMenuItem variant='destructive'>{'Delete'}</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked>
          {'Mushrooms'}
        </DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value='a'>
          <DropdownMenuRadioItem value='a'>{'Satellite'}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSub defaultOpen>
          <DropdownMenuSubTrigger>{'More'}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>{'Nested'}</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const q = (sel: string) => document.querySelector(sel);
  const classes = (sel: string) => [...(q(sel)?.classList ?? [])];
  return { container, q, classes };
}

function renderSelect() {
  render(
    <Select defaultOpen defaultValue='cep'>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>{'Mushrooms'}</SelectLabel>
          <SelectItem value='cep'>{'Cep'}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
  const classes = (sel: string) => [
    ...(document.querySelector(sel)?.classList ?? []),
  ];
  return { classes };
}

describe('menu rows share one focus tone', () => {
  const rows = [
    'dropdown-menu-item',
    'dropdown-menu-checkbox-item',
    'dropdown-menu-radio-item',
    'dropdown-menu-sub-trigger',
  ];

  it.each(rows)('%s carries the light tone and its dark twin', slot => {
    const { classes } = renderMenu();
    const c = classes(`[data-slot=${slot}]`);
    expect(c.length).toBeGreaterThan(0);
    for (const token of [...FOCUS_LIGHT, ...FOCUS_DARK]) {
      expect(c).toContain(token);
    }
  });

  it.each(rows)('%s no longer falls back to the shadcn accent tone', slot => {
    const { classes } = renderMenu();
    const c = classes(`[data-slot=${slot}]`);
    expect(c).not.toContain('focus:bg-accent');
    expect(c).not.toContain('focus:text-accent-foreground');
  });

  it('SelectItem mirrors the same four tokens', () => {
    const { classes } = renderSelect();
    const c = classes('[data-slot=select-item]');
    for (const token of [...FOCUS_LIGHT, ...FOCUS_DARK]) {
      expect(c).toContain(token);
    }
  });

  it('the open sub-trigger takes the item tone in both themes', () => {
    const { classes } = renderMenu();
    const c = classes('[data-slot=dropdown-menu-sub-trigger]');
    expect(c).toContain('data-[state=open]:bg-happy-100');
    expect(c).toContain('dark:data-[state=open]:bg-happy-900');
    expect(c).not.toContain('data-[state=open]:bg-accent');
  });
});

describe('the destructive variant survives the base dark twin', () => {
  // Same specificity, `dark:` orders later — without its own twins the base
  // repaints a Delete row as a plain green row in dark only.
  it('declares dark twins for both fill and text', () => {
    const { classes } = renderMenu();
    const c = classes(
      '[data-slot=dropdown-menu-item][data-variant=destructive]'
    );
    expect(c.length).toBeGreaterThan(0);
    expect(c).toContain(
      'dark:data-[variant=destructive]:focus:bg-destructive/20'
    );
    expect(c).toContain(
      'dark:data-[variant=destructive]:focus:text-destructive-text'
    );
  });

  it('never uses the fill tone as text', () => {
    const { classes } = renderMenu();
    const c = classes(
      '[data-slot=dropdown-menu-item][data-variant=destructive]'
    );
    expect(c).toContain('data-[variant=destructive]:text-destructive-text');
    expect(c).not.toContain('data-[variant=destructive]:text-destructive');
  });
});

describe('menu text sits in two columns, not three', () => {
  it('label, plain item and sub-trigger share the text column', () => {
    const { classes } = renderMenu();
    for (const slot of [
      'dropdown-menu-label',
      'dropdown-menu-item',
      'dropdown-menu-sub-trigger',
    ]) {
      expect(classes(`[data-slot=${slot}]`)).toContain('px-4');
    }
  });

  it('indicator rows keep the wider column the indicator needs', () => {
    const { classes } = renderMenu();
    for (const slot of [
      'dropdown-menu-checkbox-item',
      'dropdown-menu-radio-item',
    ]) {
      expect(classes(`[data-slot=${slot}]`)).toContain('pl-8');
    }
    expect(classes('[data-slot=dropdown-menu-item]')).toContain(
      'data-[inset]:pl-8'
    );
  });

  it('SelectLabel shares the SelectItem column', () => {
    const { classes } = renderSelect();
    expect(classes('[data-slot=select-label]')).toContain('px-4');
    expect(classes('[data-slot=select-item]')).toContain('pl-4');
  });
});

describe('menu surfaces animate on tokens', () => {
  it.each([
    ['dropdown-menu-content', renderMenu],
    ['select-content', renderSelect],
  ])('%s declares the token duration and curve', (slot, mount) => {
    const { classes } = mount();
    const c = classes(`[data-slot=${slot}]`);
    expect(c.length).toBeGreaterThan(0);
    expect(c).toContain('duration-fast');
    expect(c).toContain('ease-standard');
  });
});

describe('a menu surface contains its own height', () => {
  it('the top-level content caps against the available height and scrolls', () => {
    const { classes } = renderMenu();
    const c = classes('[data-slot=dropdown-menu-content]');
    expect(c).toContain(
      'max-h-(--radix-dropdown-menu-content-available-height)'
    );
    expect(c).toContain('overflow-y-auto');
    expect(c).not.toContain('overflow-hidden');
  });

  it('SelectContent does the same against its own variable', () => {
    const { classes } = renderSelect();
    const c = classes('[data-slot=select-content]');
    expect(c).toContain('max-h-(--radix-select-content-available-height)');
    expect(c).toContain('overflow-y-auto');
  });

  // SubContent never mounts under jsdom, so the two below read the source,
  // anchored to the slot. Every other assertion here reads a real classList.
  const subContent = /sub-content[\s\S]{0,900}?elevation-floating'/;

  it('the submenu caps against the available height and scrolls', () => {
    const block = dropdownSource.match(subContent)?.[0] ?? '';
    expect(block).toContain(
      'max-h-(--radix-dropdown-menu-content-available-height)'
    );
    expect(block).toContain('overflow-y-auto');
    expect(block).not.toContain('overflow-hidden');
  });

  it('the submenu animates on the token duration and curve', () => {
    const block = dropdownSource.match(subContent)?.[0] ?? '';
    expect(block).toContain('duration-fast');
    expect(block).toContain('ease-standard');
  });
});

describe('checkbox rows keep the menu open', () => {
  it('toggles twice without reopening', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>{'Open'}</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked>
            {'Mushrooms'}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem>{'Plants'}</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await user.click(
      document.querySelectorAll('[data-slot=dropdown-menu-checkbox-item]')[0]!
    );
    expect(
      document.querySelector('[data-slot=dropdown-menu-content]')
    ).not.toBeNull();

    await user.click(
      document.querySelectorAll('[data-slot=dropdown-menu-checkbox-item]')[1]!
    );
    expect(
      document.querySelector('[data-slot=dropdown-menu-content]')
    ).not.toBeNull();
  });

  it("still runs the caller's onSelect", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>{'Open'}</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem onSelect={onSelect}>
            {'Mushrooms'}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await user.click(
      document.querySelector('[data-slot=dropdown-menu-checkbox-item]')!
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector('[data-slot=dropdown-menu-content]')
    ).not.toBeNull();
  });

  it('a radio row still closes — one value ends the interaction', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>{'Open'}</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value='a'>
            <DropdownMenuRadioItem value='b'>{'Terrain'}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await user.click(
      document.querySelector('[data-slot=dropdown-menu-radio-item]')!
    );
    expect(
      document.querySelector('[data-slot=dropdown-menu-content]')
    ).toBeNull();
  });
});

describe('menu rows stay inside the radius scale', () => {
  // 20px card minus 4px padding would be 16px, but rounded-2xl is banned by
  // radius.test.ts — rounded-xl is the largest radius a row may take.
  it.each([
    'dropdown-menu-item',
    'dropdown-menu-checkbox-item',
    'dropdown-menu-radio-item',
    'dropdown-menu-sub-trigger',
  ])('%s uses rounded-xl', slot => {
    const { classes } = renderMenu();
    expect(classes(`[data-slot=${slot}]`)).toContain('rounded-xl');
  });
});

describe('the selected row belongs to the component', () => {
  it('a checked radio row is marked by the indicator and the weight', () => {
    const { classes } = renderMenu();
    const c = classes('[data-slot=dropdown-menu-radio-item]');
    expect(c).toContain('data-[state=checked]:font-semibold');
    // No fill: it would land on the same token as the focus tone, and the two
    // states would be indistinguishable on the row that is both.
    expect(c).not.toContain('data-[state=checked]:bg-happy-100');
  });

  it('no consumer paints the selected row itself', () => {
    // Three switchers each hardcoded `bg-happy-100 text-happy-900 font-semibold`
    // with no dark twin, so the selected row measured 10.02 against the popover
    // in dark while every other row measured 1.33. The same pair repeated across
    // call sites is a missing feature in the base, not a call-site preference.
    const consumers = readdirSync('src', { recursive: true, encoding: 'utf8' })
      .map(f => f.replaceAll('\\', '/'))
      .filter(
        f =>
          typeof f === 'string' && /\.tsx$/.test(f) && !f.includes('.stories.')
      )
      .map(f => [`src/${f}`, readFileSync(`src/${f}`, 'utf8')] as const)
      .filter(
        ([path, body]) =>
          !path.startsWith('src/components/ui/') &&
          !path.startsWith('src/test/') &&
          body.includes("from '@/components/ui/dropdown-menu'")
      );

    expect(consumers.length).toBeGreaterThan(0);
    const offenders = consumers
      .filter(([, body]) => /\bbg-happy-\d{2,3}\b/.test(body))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

describe('the menu sources carry no issue references', () => {
  it.each([
    ['dropdown-menu.tsx', dropdownSource],
    ['select.tsx', selectSource],
  ])('%s', (_name, source) => {
    expect(source).not.toMatch(/#\d{3}/);
  });
});

describe('a row pins what it would otherwise inherit', () => {
  it('keeps its own colour and weight when asChild puts an anchor in it', () => {
    // globals.scss styles every bare `a` at --primary-text and weight 500, and
    // inheritance from the popover loses to the element's own rule. The Help
    // flyout shipped four green rows at 500 among Ink rows at 400 before the
    // row pinned both.
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>{'Open'}</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild>
            <a href='/support'>{'Support'}</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const row = document.querySelector('[data-slot="dropdown-menu-item"]');
    expect(row?.tagName).toBe('A');
    // classList is a token array, so these are exact matches rather than
    // substring hits.
    expect([...(row?.classList ?? [])]).toContain('text-popover-foreground');
    expect([...(row?.classList ?? [])]).toContain('font-normal');
  });
});

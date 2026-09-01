import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';

import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// The three fields transitioned the shadow while both colours they actually
// change - the focus edge and the error edge - snapped, reddened an error with a
// step that reads 1.86:1 on the dark field interior, and drew the focus edge
// with a light-tuned literal that reads 2.12:1 on the light one.
//
// Assertions read the rendered class list, not the source: the source only says
// where a class is written, so moving one into another variant reintroduces the
// same defect while a source scan stays green. classList tokens also compare
// exactly, which closes the substring hole - `border-destructive` is a substring
// of `border-destructive-text`.
function classes(ui: React.ReactElement, slot: string): string[] {
  const { container, unmount } = render(ui);
  const el = container.querySelector(`[data-slot=${slot}]`);
  expect(el, `no [data-slot=${slot}] rendered`).toBeTruthy();
  const list = [...(el?.classList ?? [])];
  unmount();
  return list;
}

const FIELDS: [string, () => string[]][] = [
  ['input', () => classes(<Input />, 'input')],
  ['textarea', () => classes(<Textarea />, 'textarea')],
  [
    'select trigger',
    () =>
      classes(
        <Select>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>,
        'select-trigger'
      ),
  ],
];

const SOURCES = ['input', 'select', 'textarea'].map(
  n => `src/components/ui/${n}.tsx`
);

describe('the field transitions every colour it changes', () => {
  // A field declares two border colours - one on focus, one on aria-invalid -
  // so a list that names only `color, box-shadow` snaps both of them.
  it.each(FIELDS)('%s names border-color', (_name, list) => {
    expect(
      list().some(
        c => c.startsWith('transition-[') && c.includes('border-color')
      )
    ).toBe(true);
    expect(list()).not.toContain('transition-[color,box-shadow]');
  });

  // The same rule, applied to the one field that also changes a fill. The
  // select trigger is a button that opens a popover, not a box you type in, so
  // it answers the pointer - and the list has to name what it animates or the
  // fill snaps while the edge eases.
  it('the select trigger names the fill it changes', () => {
    const list = FIELDS[2][1]();
    expect(list).toContain('hover:bg-accent');
    expect(list).toContain(
      'transition-[color,background-color,border-color,box-shadow]'
    );
  });
});

describe('the error edge clears the non-text floor in both themes', () => {
  // --destructive reads 1.86:1 against the dark field interior (--input/30 over
  // --card) and 2.00:1 against the page, under WCAG 1.4.11's 3:1 floor.
  // --destructive-text reads 4.58:1 and 4.93:1 there, and in light the two are
  // the same value - 7.09:1 - so this is invisible in light and load-bearing in
  // dark. It is the step the selection controls already reach for.
  it.each(FIELDS)('%s reddens to the text step', (_name, list) => {
    expect(list()).toContain('aria-invalid:border-destructive-text');
    expect(list()).not.toContain('aria-invalid:border-destructive');
  });
});

describe('the field has one focus tone', () => {
  // Focus paints two things: `.focus-ring`'s 2px outline and the field's own
  // edge. One token for both, so a clipped outline still leaves a 7.81:1 edge.
  // --happy-500 read 2.12:1 on the light interior and --primary reads 2.95:1 -
  // both under the floor on their own, and neither has a dark twin worth the
  // divergence, since --ring and --primary are the same value in dark.
  it.each(FIELDS)('%s focuses on the ring token', (_name, list) => {
    expect(list()).toContain('focus-visible:border-ring');
    expect(list()).not.toContain('focus-visible:border-happy-500');
    expect(list()).not.toContain('focus-visible:border-primary');
  });

  it.each(FIELDS)('%s carries the outline the edge matches', (_name, list) => {
    expect(list()).toContain('focus-ring');
  });

  // The Light-Tuned Scale Rule: a --happy-* step is absolute and does not change
  // between themes, so a field - which renders in both - reads a semantic token.
  // Scoped to the field itself: the select popover pairs two steps of the scale
  // against each other, which the rule allows and the menus pass owns.
  it.each(FIELDS)('%s reaches for no --happy-* step', (_name, list) => {
    expect(list().filter(c => /happy-\d/.test(c))).toEqual([]);
  });
});

describe('the hairline is the sanctioned bordered exception', () => {
  // The resting edge is decorative, not a boundary: 1.29:1 in light and 1.19:1
  // in dark, with elevation-raised-subtle carrying the separation. It stays
  // because in light --card and --background are the same value, so an empty
  // field has nothing else, and because focus and error need a width to paint
  // into - the same reason the buttons carry a transparent one.
  it.each(FIELDS)('%s carries the hairline', (_name, list) => {
    expect(list()).toContain('border');
    expect(list()).toContain('border-border');
  });

  // tailwind-merge keeps the later of two competing border colours, so the dead
  // one never reaches the DOM and no classList assertion can watch it come back:
  // the trigger shipped `border-input` beside `border-border` and only the
  // second ever painted. This is the one guard here that has to read the source.
  it.each(SOURCES)('%s declares one border colour', file => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/\bborder-input\b/);
  });
});

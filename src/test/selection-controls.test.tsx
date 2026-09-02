import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';

// Checkbox, RadioGroupItem and Switch all drew their only boundary with the
// 2.94:1 fill step, tinted the tick and the dot with raw literals, transitioned
// the shadow while the colour they actually changed snapped, floated a lifted
// shadow under a 20px inline control, and declared a `size` scale no caller
// could reach.
//
// Assertions read the rendered class list, not the source: the source only says
// where a class is written, so moving one into another variant reintroduces the
// same defect while a source scan stays green. classList tokens also compare
// exactly, which closes the substring hole — `border-primary` is a substring of
// `border-primary-text`.
function classes(ui: React.ReactElement, slot: string): string[] {
  const { container, unmount } = render(ui);
  const el = container.querySelector(`[data-slot=${slot}]`);
  expect(el, `no [data-slot=${slot}] rendered`).toBeTruthy();
  const list = [...(el?.classList ?? [])];
  unmount();
  return list;
}

const checkbox = () => classes(<Checkbox />, 'checkbox');
const checkboxInvalid = () => classes(<Checkbox aria-invalid />, 'checkbox');
const radioItem = () =>
  classes(
    <RadioGroup>
      <RadioGroupItem value='a' />
    </RadioGroup>,
    'radio-group-item'
  );
const switchThumb = () => classes(<Switch />, 'switch-thumb');
const switchRoot = () => classes(<Switch />, 'switch');

// A class named in prose is not a class the browser sees.
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

const TRIO = ['checkbox', 'radio-group', 'switch'].map(
  n => `src/components/ui/${n}.tsx`
);

describe('the stroke carries the contrast floor, in every state', () => {
  // --primary is 2.94:1 on the page and misses WCAG 1.4.11; --primary-text is
  // 7.85:1 light / 6.44:1 dark. An unchecked box has no fill, so the stroke is
  // the only thing saying the control is there.
  it('all three stroke on the text step', () => {
    // The switch shipped `border-transparent`, so its only boundary was the
    // fill: 1.30:1 off and 2.94:1 lit on the page. It is in this loop now
    // because that is what the section's own rule always claimed.
    for (const list of [checkbox(), radioItem(), switchRoot()]) {
      expect(list).toContain('border-primary-text');
      expect(list).not.toContain('border-primary');
      expect(list).not.toContain('border-transparent');
    }
  });

  it('checking does not hand the boundary back to the fill step', () => {
    const list = checkbox();
    expect(list).not.toContain('data-[state=checked]:border-primary');
    expect(list).toContain('border-primary-text');
  });

  it('the invalid stroke uses the text step, on all three', () => {
    for (const list of [checkboxInvalid(), radioItem(), switchRoot()]) {
      expect(list).toContain('aria-invalid:border-destructive-text');
      expect(list).not.toContain('aria-invalid:border-destructive');
    }
  });
});

describe('the state indicator is a token, not a literal', () => {
  it('the tick reads on its own fill', () => {
    const list = checkbox();
    expect(list).toContain('data-[state=checked]:text-primary-foreground');
    expect(list).not.toContain('data-[state=checked]:text-white');
  });

  it('the switch knob keeps one colour and the track carries the state', () => {
    const thumb = switchThumb();
    // a fixed light knob, so it never darkens into a hole in either theme
    expect(thumb).toContain('bg-white');
    // a per-state knob colour reads as a hole rather than a moving part
    expect(thumb.filter(c => /^data-\[state=\w+\]:bg-/.test(c))).toHaveLength(
      0
    );

    // The track's 2px stroke is the boundary now, so the knob's outline only
    // has to find the knob on the pale off fill: --primary-text reads 6.06:1
    // light / 4.01:1 dark there. It used to be a near-black --foreground ring,
    // which was one patch over three separate holes.
    expect(thumb).toContain('border');
    expect(thumb).toContain('border-primary-text');
    expect(thumb).not.toContain('border-foreground');
    expect(thumb).not.toContain('dark:border-border');

    const root = switchRoot();
    expect(root).toContain('data-[state=unchecked]:bg-input');
    expect(root).toContain('data-[state=checked]:bg-primary');
    expect(root).not.toContain('data-[state=unchecked]:bg-muted-foreground');
    expect(root).not.toContain('dark:data-[state=unchecked]:bg-input/80');
  });

  it('the radio dot is painted, and on the text step', () => {
    // fill and text are both asserted: the icon paints with fill, and without
    // text- the stroke falls back to inherited ink.
    const { container, unmount } = render(
      <RadioGroup value='a'>
        <RadioGroupItem value='a' />
      </RadioGroup>
    );
    const dot = container.querySelector(
      '[data-slot=radio-group-indicator] svg'
    );
    expect(dot, 'no dot rendered on a checked radio item').toBeTruthy();
    const list = [...(dot?.classList ?? [])];
    expect(list).toContain('fill-primary-text');
    expect(list).toContain('text-primary-text');
    unmount();
  });

  it('the radio dot names no palette step directly', () => {
    const text = stripComments(
      readFileSync('src/components/ui/radio-group.tsx', 'utf8')
    );
    expect(text.match(/happy-\d/g) ?? []).toHaveLength(0);
  });
});

describe('what changes colour also transitions', () => {
  it('the checkbox transitions its fill and its stroke, not just the shadow', () => {
    const list = checkbox();
    const t = list.find(c => c.startsWith('transition-['));
    expect(t, 'no transition-[…] on the checkbox').toBeTruthy();
    for (const prop of ['background-color', 'border-color', 'color']) {
      expect(t).toContain(prop);
    }
    expect(list).not.toContain('transition-shadow');
  });

  it('the radio item transitions its stroke', () => {
    const t = radioItem().find(c => c.startsWith('transition-['));
    expect(t).toContain('border-color');
  });

  it('no one in the trio reaches for transition-all', () => {
    // transition-all on the switch also animated its 44px ::before and every
    // layout property the root owns.
    for (const list of [checkbox(), radioItem(), switchRoot()]) {
      expect(list).not.toContain('transition-all');
      expect(list.find(c => c.startsWith('transition-['))).toBeTruthy();
    }
  });

  it('the switch transitions its fill and its stroke, and the knob its travel', () => {
    const t = switchRoot().find(c => c.startsWith('transition-['));
    for (const prop of ['background-color', 'border-color']) {
      expect(t).toContain(prop);
    }
    expect(switchThumb()).toContain('transition-transform');
  });
});

describe('an inline control does not float', () => {
  it('no elevation level rides any of the three', () => {
    for (const list of [checkbox(), radioItem(), switchRoot()]) {
      expect(list.filter(c => c.startsWith('elevation-'))).toHaveLength(0);
    }
  });
});

describe('the hit area is 44px and the box is not', () => {
  it('each control carries the widened target without resizing', () => {
    for (const list of [checkbox(), radioItem(), switchRoot()]) {
      expect(list).toContain('before:size-11');
      expect(list).toContain('before:-translate-x-1/2');
      expect(list).toContain('before:-translate-y-1/2');
      expect(list).toContain('relative');
    }
  });

  it('the visual box stays 20px on checkbox and radio', () => {
    for (const list of [checkbox(), radioItem()]) {
      expect(list).toContain('size-5');
    }
  });

  it('stacked 44px targets do not overlap inside a radio group', () => {
    // 20px box + 44px target needs >=24px between centres; gap-3 was 12px.
    const list = classes(
      <RadioGroup>
        <RadioGroupItem value='a' />
      </RadioGroup>,
      'radio-group'
    );
    expect(list).toContain('gap-6');
    expect(list).not.toContain('gap-3');
  });
});

describe('a variant nobody can reach is not shipped', () => {
  it('none of the three declares a size scale behind an unforwarded prop', () => {
    for (const file of TRIO) {
      const text = stripComments(readFileSync(file, 'utf8'));
      expect(text, `${file} still builds variants`).not.toContain('cva');
    }
  });
});

describe('the 2.94:1 step is gone from every control boundary', () => {
  it('no ui component strokes on the fill step', () => {
    // \b then (?!-) keeps border-primary-text out of the match; the dark twin
    // is spelled the same, so no lookbehind is needed here.
    // Stories are excluded on purpose: button.stories.tsx quotes the class in
    // prose that explains an old defect, and rewriting prose to appease a scan
    // is the wrong repair.
    const bare = /\bborder-primary\b(?!-)/g;
    const offenders: string[] = [];
    for (const file of sourceFiles('src/components/ui')) {
      if (file.endsWith('.stories.tsx')) continue;
      const hits = stripComments(readFileSync(file, 'utf8')).match(bare) ?? [];
      if (hits.length) offenders.push(`${file} (${hits.length})`);
    }
    expect(offenders).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useForm } from 'react-hook-form';

import { sourceFiles, stripComments } from './source-scan';

import { Label } from '@/components/ui/label';
import { CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// Label set its line box to the text height, so a label that wrapped in a
// narrow field collided with itself - the same defect the card pass removed
// from `CardTitle`, still shipped on `DialogTitle`. And the family reddened
// both its error label and its error message with `--destructive`, a fill tone
// that reads 2.51:1 on the dark page and 1.82:1 on a tinted dark card.
//
// Assertions read the rendered class list, not the source: the source only
// says where a class is written, so moving one into another variant
// reintroduces the same defect while a source scan stays green. classList
// tokens also compare exactly, which closes the substring hole -
// `text-destructive` is a substring of `text-destructive-text`.
function classes(ui: React.ReactElement, slot: string): string[] {
  const { unmount } = render(ui);
  // Dialog content lands in a portal, so query the document, not the container.
  const el = document.querySelector(`[data-slot=${slot}]`);
  expect(el, `no [data-slot=${slot}] rendered`).toBeTruthy();
  const list = [...(el?.classList ?? [])];
  unmount();
  return list;
}

function field(children: React.ReactNode) {
  function Harness() {
    const form = useForm({ defaultValues: { species: '' } });
    return (
      <Form {...form}>
        <FormField
          control={form.control}
          name='species'
          render={() => <FormItem>{children}</FormItem>}
        />
      </Form>
    );
  }
  return <Harness />;
}

const dialogTitle = () =>
  classes(
    <Dialog open>
      <DialogContent>
        <DialogTitle>{'Species'}</DialogTitle>
      </DialogContent>
    </Dialog>,
    'dialog-title'
  );

const sheetTitle = () =>
  classes(
    <Sheet open>
      <SheetContent>
        <SheetTitle>{'Species'}</SheetTitle>
      </SheetContent>
    </Sheet>,
    'sheet-title'
  );

// Every component whose job is to render a short piece of text that can wrap.
const WRAPPING_TEXT: [string, () => string[]][] = [
  ['label', () => classes(<Label>{'Species'}</Label>, 'label')],
  [
    'card title',
    () => classes(<CardTitle>{'Species'}</CardTitle>, 'card-title'),
  ],
  ['dialog title', dialogTitle],
  ['sheet title', sheetTitle],
];

describe('no wrapping text collides with itself', () => {
  it.each(WRAPPING_TEXT)('%s does not set leading-none', (_name, list) => {
    expect(list()).not.toContain('leading-none');
  });
});

// Dialog and Sheet are one primitive in two geometries, so a role named on
// one and left off the other is not a variation. SheetTitle set no size at
// all and rendered at whatever styles `h2` - 30px against its twin's 18px,
// which is a size nobody chose. `leading-none` absent is not the same as a
// leading named: assert the pair, not the absence.
describe('the twin panels title at one size', () => {
  it.each([
    ['dialog', dialogTitle],
    ['sheet', sheetTitle],
  ])('%s title names the Body Large role', (_name, list) => {
    const classList = list();
    expect(classList).toContain('text-lg');
    expect(classList).toContain('leading-snug');
  });
});

describe('destructive text clears 4.5:1 in both themes', () => {
  // --destructive is the fill tone: identical to --destructive-text in light,
  // so the shortfall is invisible there and only appears in dark, where it
  // reads 2.51:1 on --background and 1.82:1 on `bg-destructive/10` over
  // --card. --destructive-text is the step that clears the floor.
  it('the error label reddens with the text step', () => {
    const list = classes(
      field(<FormLabel>{'Species'}</FormLabel>),
      'form-label'
    );
    expect(list).toContain('data-[error=true]:text-destructive-text');
    expect(list).not.toContain('data-[error=true]:text-destructive');
  });

  it('the error message reddens with the text step', () => {
    const list = classes(
      field(<FormMessage>{'Pick a species.'}</FormMessage>),
      'form-message'
    );
    expect(list).toContain('text-destructive-text');
    expect(list).not.toContain('text-destructive');
  });
});

describe('nothing paints text with the destructive fill tone', () => {
  // The atom is guarded above; this catches the call sites, which have no
  // shared base to fix. `src/test` is excluded because the guards name the
  // class they forbid, inside strings that `stripComments` cannot reach.
  it('no bare text-destructive outside the guards', () => {
    const offenders = sourceFiles('src')
      .filter(f => !f.startsWith(join('src', 'test')))
      .filter(f =>
        /text-destructive(?![\w-])/.test(stripComments(readFileSync(f, 'utf8')))
      );
    expect(offenders).toEqual([]);
  });
});

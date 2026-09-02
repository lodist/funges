import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

// Three sides drew a 1px hairline on their exposed edge with square corners
// while the fourth was borderless and round: four lids answering "is a sheet a
// box glued to the screen edge, or a panel that floats?" two different ways.
// Measured in dark, the panel steps 1.23:1 off the scrim behind it with a
// 1px inset rim from the elevation token - the same figure Dialog has always
// shipped, so the shadow carries the edge on its own in both themes.
//
// Assertions read the rendered class list rather than the source: the source
// only says where a class is written, so moving one behind another condition
// reintroduces the defect while a source scan stays green.
const SIDES = [
  ['right', 'rounded-l-card'],
  ['left', 'rounded-r-card'],
  ['top', 'rounded-b-card'],
  ['bottom', 'rounded-t-card'],
] as const;

// `border`, `border-t`, `border-x`, `border-2` - a width, not `border-happy`.
const BORDER_WIDTH = /^border(-[xytrbl])?(-\d+)?$/;

function panel(side: (typeof SIDES)[number][0]) {
  const { unmount } = render(
    <Sheet open>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>{'Offline maps'}</SheetTitle>
          <SheetDescription>{'Pick a region.'}</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
  const el = document.querySelector('[data-slot=sheet-content]');
  expect(el, 'no sheet content rendered').toBeTruthy();
  const list = [...el!.classList];
  const header = [
    ...document.querySelector('[data-slot=sheet-header]')!.classList,
  ];
  const close = [
    ...document.querySelector('[data-slot=sheet-close-icon]')!.classList,
  ];
  unmount();
  return { list, header, close };
}

describe('a sheet floats, it is not glued to the edge', () => {
  it.each(SIDES)(
    '%s is borderless and rounds its inner corners',
    (side, radius) => {
      const { list } = panel(side);
      expect(list).toContain(radius);
      expect(list.filter(c => BORDER_WIDTH.test(c))).toEqual([]);
    }
  );
});

describe('the dismiss does not eat the header', () => {
  // The dismiss is absolute so it never scrolls away, which parks it on top
  // of the header row: 16px of inset plus its own 44px. It also carries the
  // panel's own background, so an unreserved gutter does not collide
  // visibly - it masks the text, and a wrapping description loses a word.
  it.each(SIDES)('%s reserves the gutter the dismiss occupies', side => {
    const { header, close } = panel(side);
    expect(close).toContain('size-11');
    expect(header).toContain('pr-11');
  });
});

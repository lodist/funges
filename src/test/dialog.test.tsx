import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

// The panel grew past the viewport instead of scrolling, the corner X was a
// 36px target that vanished into the background in dark, and the scrim carried
// a raw literal. Assert on what renders, not on what the file says.

const css = readFileSync('src/index.css', 'utf8');
const dialogSrc = readFileSync('src/components/ui/dialog.tsx', 'utf8');
const sheetSrc = readFileSync('src/components/ui/sheet.tsx', 'utf8');

function dialogTree() {
  const { baseElement, unmount } = render(
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{'Delete this region?'}</DialogTitle>
          <DialogDescription>{'Tiles will be removed.'}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant='outline'>{'Cancel'}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  const q = (sel: string) => baseElement.querySelector(sel);
  const result = {
    content: [...(q('[data-slot=dialog-content]')?.classList ?? [])],
    body: [...(q('[data-slot=dialog-body]')?.classList ?? [])],
    closeIcon: [...(q('[data-slot=dialog-close-icon]')?.classList ?? [])],
    overlay: [...(q('[data-slot=dialog-overlay]')?.classList ?? [])],
    bodyIsChildOfContent:
      q('[data-slot=dialog-body]')?.parentElement?.dataset.slot ===
      'dialog-content',
    footerCloseIsNotTheIcon:
      q('[data-slot=dialog-close]') !== q('[data-slot=dialog-close-icon]'),
  };
  unmount();
  return result;
}

function sheetTree() {
  const { baseElement, unmount } = render(
    <Sheet defaultOpen>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{'Export'}</SheetTitle>
          <SheetDescription>{'Pick a format.'}</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
  const q = (sel: string) => baseElement.querySelector(sel);
  const result = {
    content: [...(q('[data-slot=sheet-content]')?.classList ?? [])],
    body: [...(q('[data-slot=sheet-body]')?.classList ?? [])],
    closeIcon: [...(q('[data-slot=sheet-close-icon]')?.classList ?? [])],
    overlay: [...(q('[data-slot=sheet-overlay]')?.classList ?? [])],
    bodyIsChildOfContent:
      q('[data-slot=sheet-body]')?.parentElement?.dataset.slot ===
      'sheet-content',
  };
  unmount();
  return result;
}

describe('dialog and sheet contain their own content', () => {
  it('caps the dialog panel and scrolls its body', () => {
    const t = dialogTree();
    expect(t.content).toContain('bg-background');
    expect(t.content).toContain('max-h-[calc(100dvh-2rem)]');
    expect(t.content).toContain('flex');
    expect(t.content).toContain('flex-col');
    expect(t.body).toContain('overflow-y-auto');
    expect(t.body).toContain('min-h-0');
    expect(t.bodyIsChildOfContent).toBe(true);
  });

  it('caps the sheet panel and scrolls its body', () => {
    const t = sheetTree();
    expect(t.content).toContain('max-h-dvh');
    expect(t.body).toContain('overflow-y-auto');
    expect(t.body).toContain('min-h-0');
    expect(t.body).toContain('flex-1');
    expect(t.bodyIsChildOfContent).toBe(true);
  });

  it('keeps padding and gap off the element that caps the height', () => {
    const d = dialogTree();
    // p-6/gap-4 on the capped panel would fight the scroll box
    expect(d.content).not.toContain('p-6');
    expect(d.content).not.toContain('gap-4');
    expect(d.body).toContain('p-6');
    expect(d.body).toContain('gap-4');
    expect(sheetTree().body).toContain('gap-4');
  });
});

describe('the close button is reachable in both themes', () => {
  it('gives the corner X a 44px target in both panels', () => {
    expect(dialogTree().closeIcon).toContain('size-11');
    expect(sheetTree().closeIcon).toContain('size-11');
  });

  it('carries a dark twin for glyph and hover surface', () => {
    for (const icon of [dialogTree().closeIcon, sheetTree().closeIcon]) {
      expect(icon).toContain('text-happy-700');
      expect(icon).toContain('dark:text-happy-300');
      expect(icon).toContain('hover:bg-happy-50');
      expect(icon).toContain('dark:hover:bg-happy-900');
    }
  });

  it('masks scrolling body text behind the X and stacks above it', () => {
    for (const icon of [dialogTree().closeIcon, sheetTree().closeIcon]) {
      expect(icon).toContain('bg-background');
      expect(icon).not.toContain('bg-transparent');
      expect(icon).toContain('z-10');
    }
  });

  it('gives the corner X a slot of its own, apart from footer closers', () => {
    expect(dialogTree().footerCloseIsNotTheIcon).toBe(true);
  });
});

describe('overlay motion and scrim ride shared tokens', () => {
  it('animates both panels on the overlay duration', () => {
    const d = dialogTree();
    const s = sheetTree();
    for (const list of [d.content, d.overlay, s.content, s.overlay]) {
      expect(list).toContain('duration-slow');
      expect(list).not.toContain('duration-base');
    }
  });

  it('paints the scrim from the token, not a literal', () => {
    expect(dialogTree().overlay).toContain('bg-scrim');
    expect(sheetTree().overlay).toContain('bg-scrim');
    expect(dialogSrc).not.toContain('bg-black/');
    expect(sheetSrc).not.toContain('bg-black/');
  });

  it('registers the scrim token in both themes and in @theme', () => {
    expect(css.match(/--scrim:/g)).toHaveLength(2);
    expect(css).toContain('--color-scrim: var(--scrim);');
    // the .overlay component in globals.scss owns the heavier one
    expect(css).toContain('--background-overlay:');
  });
});

describe('comments carry no issue numbers', () => {
  it('leaves tracker references out of both sources', () => {
    for (const src of [dialogSrc, sheetSrc]) {
      expect(src).not.toMatch(/\(#\d+/);
    }
  });
});

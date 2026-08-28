import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';

// The disclosure snapped from 0 to its full height in a single frame while the
// primitive was already publishing the height needed to animate, and the shared
// motion tokens went unused. Assert on what renders, not on what the file says.

const CALLER_CLASS = 'text-muted-foreground pt-3 text-sm';

function tree(props: { disabled?: boolean } = {}) {
  const { container, unmount } = render(
    <Collapsible defaultOpen {...props}>
      <CollapsibleTrigger asChild>
        <Button variant='outline' size='sm'>
          {'Habitat notes'}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className={CALLER_CLASS}>
        {'Prefers damp shade.'}
      </CollapsibleContent>
    </Collapsible>
  );
  const content = container.querySelector('[data-slot=collapsible-content]');
  const trigger = container.querySelector('[data-slot=collapsible-trigger]');
  expect(content, 'no collapsible content rendered').toBeTruthy();
  expect(trigger, 'no collapsible trigger rendered').toBeTruthy();
  const result = {
    outer: [...(content?.classList ?? [])],
    inner: [...(content?.firstElementChild?.classList ?? [])],
    innerTag: content?.firstElementChild?.tagName ?? null,
    triggerDisabled: trigger?.hasAttribute('disabled') ?? false,
  };
  unmount();
  return result;
}

const css = () => readFileSync('src/index.css', 'utf8');

describe('the disclosure animates instead of snapping', () => {
  it('the content box carries both directions and clips', () => {
    const { outer } = tree();
    expect(outer).toContain('overflow-hidden');
    expect(outer).toContain('data-[state=open]:animate-collapsible-down');
    expect(outer).toContain('data-[state=closed]:animate-collapsible-up');
  });

  it('the animation rides the shared tokens, not a hardcoded duration', () => {
    const text = css();
    for (const name of [
      '--animate-collapsible-down',
      '--animate-collapsible-up',
    ]) {
      const decl = text.match(new RegExp(`${name}:([\\s\\S]*?);`))?.[1];
      expect(decl, `${name} is not declared`).toBeTruthy();
      expect(decl).toContain('var(--transition-duration-base)');
      expect(decl).toContain('var(--ease-standard)');
      // a literal duration would drift the moment the token is retuned
      expect(decl).not.toMatch(/\d+m?s/);
    }
  });

  it('the keyframes read the height the primitive publishes', () => {
    const text = css();
    for (const name of ['collapsible-down', 'collapsible-up']) {
      const body = text.match(
        new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`)
      )?.[1];
      expect(body, `@keyframes ${name} is missing`).toBeTruthy();
      expect(body).toContain('var(--radix-collapsible-content-height)');
      expect(body).toContain('height: 0');
    }
  });
});

describe('the disclosure rotates its own chevron', () => {
  it('the trailing glyph turns on the shared tokens', () => {
    const text = css();
    const base = text.match(
      /\[data-slot='collapsible-trigger'\] > svg:last-child \{([\s\S]*?)\n {2}\}/
    )?.[1];
    expect(base, 'the chevron transition rule is missing').toBeTruthy();
    // the same property Tailwind's own rotate-* utilities set, so a caller's
    // utility replaces this angle instead of composing with it
    expect(base).toContain('transition: rotate');
    expect(base).toContain('var(--transition-duration-base)');
    expect(base).toContain('var(--ease-standard)');
    expect(base).not.toMatch(/\d+m?s/);

    const open = text.match(
      /\[data-slot='collapsible-trigger'\]\[data-state='open'\] > svg:last-child \{([\s\S]*?)\n {2}\}/
    )?.[1];
    expect(open, 'the open-state rotation rule is missing').toBeTruthy();
    expect(open).toContain('rotate: 180deg');
  });

  it('a leading icon is not the one that turns', () => {
    const { container, unmount } = render(
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant='outline' size='sm'>
            <svg data-testid='leading' />
            <span>{'Habitat notes'}</span>
            <svg data-testid='chevron' />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>{'Prefers damp shade.'}</CollapsibleContent>
      </Collapsible>
    );
    const trigger = container.querySelector('[data-slot=collapsible-trigger]');
    const last = trigger?.querySelector(':scope > svg:last-child');
    expect(last?.getAttribute('data-testid')).toBe('chevron');
    unmount();
  });

  it('no call site hand-rolls the rotation any more', () => {
    const offenders: string[] = [];
    for (const file of [
      'src/components/Sidebar/nav-main.tsx',
      'src/components/ui/collapsible.stories.tsx',
    ]) {
      const text = readFileSync(file, 'utf8');
      if (/rotate-\d+/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe('padding never sits on the box that animates', () => {
  it("the caller's className goes to an inner box", () => {
    const { outer, inner, innerTag } = tree();
    expect(innerTag).toBe('DIV');
    for (const token of CALLER_CLASS.split(' ')) {
      expect(inner, `${token} should be on the inner box`).toContain(token);
      expect(outer, `${token} must not be on the animating box`).not.toContain(
        token
      );
    }
  });
});

describe('disabling the root is enough', () => {
  it('the trigger takes disabled through asChild', () => {
    expect(tree({ disabled: true }).triggerDisabled).toBe(true);
    expect(tree().triggerDisabled).toBe(false);
  });

  it('the stories do not re-declare it on the trigger', () => {
    // the doc string used to claim the trigger needed its own prop
    const stories = readFileSync(
      'src/components/ui/collapsible.stories.tsx',
      'utf8'
    );
    expect(stories).not.toMatch(/<Button[^>]*\bdisabled\b/);
  });
});

describe('every atom that names React imports it', () => {
  it('none of them lean on the global namespace', () => {
    const dir = 'src/components/ui';
    const offenders = readdirSync(dir)
      .filter(f => f.endsWith('.tsx') && !f.endsWith('.stories.tsx'))
      .filter(f => {
        const text = readFileSync(`${dir}/${f}`, 'utf8');
        return (
          /\bReact\./.test(text) &&
          !/^import \* as React from 'react';$/m.test(text)
        );
      });
    expect(offenders).toEqual([]);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * DESIGN.md gives buttons a 44px touch target, and the Button component's own
 * size ramp offered `xs` (28px) and `sm` (32px) — two statements that could not
 * both be true. 25 shipped call sites across 10 files were following the ramp.
 *
 * Measured before the change: the smallest were 134×28, and every one of them
 * sat 4–9px from its neighbour, against the 12–16px an enlarged hit area would
 * need. So the `::before` trick the selection controls use was not available
 * here; the boxes had to grow.
 *
 * `xs` and `sm` stay in the component: `button.stories.tsx` documents the ramp
 * and `collapsible.test.tsx` uses one as a fixture. This guard keeps them out
 * of shipped surfaces, which is where the floor applies.
 */
const button = readFileSync('src/components/ui/button.tsx', 'utf8');

const shipped = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .map(p => p.replace(/\\/g, '/'))
  .filter(
    p => /\.tsx$/.test(p) && !p.includes('.stories.') && !p.startsWith('test/')
  )
  .map(p => [`src/${p}`, readFileSync(`src/${p}`, 'utf8')] as const);

describe('the 44px floor', () => {
  it('the default button size is the floor, not a size above it', () => {
    // h-11 is 44px. If the default ever drops below it, every call site that
    // stopped passing a size silently falls under the floor at once.
    expect(button).toMatch(/default:\s*'h-11\b/);
  });

  it('no shipped surface asks for a sub-44px button size', () => {
    expect(shipped.length).toBeGreaterThan(20);
    const offenders = shipped
      .filter(([, body]) => /size=['"](?:xs|sm)['"]/.test(body))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('no shipped surface hand-rolls a sub-44px height onto a Button', () => {
    // A height in className beats the size variant through tailwind-merge, the
    // same way a stray rounded-* beat the shape and cost #225 three variants.
    const offenders = shipped
      .filter(([path]) => !path.startsWith('src/components/ui/'))
      .filter(([, body]) =>
        /<Button[^>]*className=(?:'[^']*|"[^"]*|\{`[^`]*)\bh-(?:[1-9]|10)\b/.test(
          body
        )
      )
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

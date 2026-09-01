import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { Slider } from '@/components/ui/slider';

// The slider is the one control a forager drags with a thumb, outdoors: it
// ships inside ForecastSlider on the map. It went out with a 16px target on a
// 44px floor, a track that measured 1.32:1 light and 1.02:1 dark against the
// card it sits on, two `disabled:` classes on a <span> that can never match,
// and an index where a date was announced.
//
// Assertions read the rendered class list and the rendered ARIA, not the
// source: the source only says where a class is written, and a classList token
// compares exactly — `bg-foreground` is a substring of `bg-foreground/50`.
function slot(ui: React.ReactElement, name: string) {
  const { container, unmount } = render(ui);
  const el = container.querySelector<HTMLElement>(`[data-slot=${name}]`);
  expect(el, `no [data-slot=${name}] rendered`).toBeTruthy();
  return { el: el as HTMLElement, container, unmount };
}

function classes(ui: React.ReactElement, name: string): string[] {
  const { el, unmount } = slot(ui, name);
  const list = [...el.classList];
  unmount();
  return list;
}

describe('the target is the bar, not the dot', () => {
  it('the root carries 44px of height it does not draw', () => {
    // Radix starts a slide from a pointerdown anywhere on the root, and the
    // root measures 358x6 — the thumb is absolutely positioned and does not
    // raise it. So the height is stated, not inset from the box you see.
    const list = classes(<Slider aria-label='Value' />, 'slider');
    expect(list).toContain('relative');
    expect(list).toContain('before:absolute');
    expect(list).toContain('before:inset-x-0');
    expect(list).toContain('before:h-11');
    expect(list).toContain('before:top-1/2');
    expect(list).toContain('before:-translate-y-1/2');
  });

  it('the thumb keeps its drawn size', () => {
    // The remedy is an invisible hit area, not a 44px pellet on a 6px track.
    expect(classes(<Slider aria-label='Value' />, 'slider-thumb')).toContain(
      'size-4'
    );
  });

  it('the hit area does not reach sideways onto the map', () => {
    // `inset-x-0` and not a negative x: the card's padding is 12px, so a
    // horizontal halo would hang over the map at either end of the travel.
    const list = classes(<Slider aria-label='Value' />, 'slider');
    expect(list.filter(c => /^before:-inset-x/.test(c))).toEqual([]);
    expect(list.filter(c => /^before:-(left|right)-/.test(c))).toEqual([]);
  });
});

describe('the extent of the control clears the non-text floor', () => {
  it('the track draws its boundary as a stroke, not as a fill', () => {
    // A fill cannot hold both boundaries on a glass card over the map: one
    // neutral axis, three levels. --muted was the old one and is a background
    // token besides — 1.32:1 light, 1.02:1 dark, the same value as --card.
    const list = classes(<Slider aria-label='Value' />, 'slider-track');
    expect(list).not.toContain('bg-muted');
    expect(list.filter(c => /^bg-/.test(c))).toEqual([]);
    expect(list).toContain('border');
    expect(list).toContain('border-foreground');
  });

  it('the interior stays tall enough to hold a fill', () => {
    // 1px of stroke on each side of an 8px pill leaves 6px of interior. At the
    // old 6px the fill would have been 4px.
    expect(classes(<Slider aria-label='Value' />, 'slider-track')).toContain(
      'h-2'
    );
  });

  it('the range reads against the untouched interior', () => {
    expect(classes(<Slider aria-label='Value' />, 'slider-range')).toContain(
      'bg-foreground'
    );
  });

  it('the ticks carry the track’s own stroke', () => {
    const { container, unmount } = render(
      <Slider aria-label='Day' min={0} max={3} step={1} showTicks />
    );
    const ticks = [...container.querySelectorAll('[aria-hidden] span')];
    expect(ticks).toHaveLength(4);
    for (const tick of ticks) {
      // bg-border measured 1.04:1 in dark — invisible on the surface where the
      // ticks are the only thing saying where the thumb can stop.
      expect([...tick.classList]).toContain('bg-foreground');
      expect([...tick.classList]).not.toContain('bg-border');
    }
    unmount();
  });
});

describe('a disabled state lands where a selector can reach it', () => {
  it('the thumb drops the two classes a <span> can never match', () => {
    // Radix marks `data-disabled`; `:disabled` only ever matches a form
    // control. Both classes rendered and neither did anything.
    const list = classes(
      <Slider aria-label='Value' disabled />,
      'slider-thumb'
    );
    expect(list).not.toContain('disabled:opacity-50');
    expect(list).not.toContain('disabled:pointer-events-none');
  });

  it('the root still dims the whole control', () => {
    expect(classes(<Slider aria-label='Value' disabled />, 'slider')).toContain(
      'data-[disabled]:opacity-50'
    );
  });
});

describe('a bare slider has one thumb', () => {
  it('no value and no defaultValue is not a range', () => {
    // The fallback was [min, max], which rendered two thumbs for a caller who
    // asked for none. Radix's own default is [min].
    const { container, unmount } = render(<Slider aria-label='Value' />);
    expect(container.querySelectorAll('[data-slot=slider-thumb]')).toHaveLength(
      1
    );
    unmount();
  });

  it('two entries still give two thumbs', () => {
    const { container, unmount } = render(
      <Slider aria-label='Range' defaultValue={[25, 75]} />
    );
    expect(container.querySelectorAll('[data-slot=slider-thumb]')).toHaveLength(
      2
    );
    unmount();
  });
});

describe('a date slider announces a date', () => {
  it('formatValue reaches aria-valuetext', () => {
    const { el, unmount } = slot(
      <Slider aria-label='Day' value={[0]} formatValue={d => `day ${d}`} />,
      'slider-thumb'
    );
    expect(el).toHaveAttribute('aria-valuetext', 'day 0');
    unmount();
  });

  it('the announced value follows an uncontrolled drag', () => {
    // The reason the atom mirrors the value at all: without it, aria-valuetext
    // would freeze on defaultValue while aria-valuenow moved.
    const { el, unmount } = slot(
      <Slider
        aria-label='Day'
        min={0}
        max={6}
        step={1}
        defaultValue={[2]}
        formatValue={d => `day ${d}`}
      />,
      'slider-thumb'
    );
    expect(el).toHaveAttribute('aria-valuetext', 'day 2');
    fireEvent.keyDown(el, { key: 'ArrowRight' });
    expect(el).toHaveAttribute('aria-valuenow', '3');
    expect(el).toHaveAttribute('aria-valuetext', 'day 3');
    unmount();
  });

  it('a slider with no formatValue leaves the attribute off', () => {
    // An empty aria-valuetext would override aria-valuenow with nothing.
    const { el, unmount } = slot(
      <Slider aria-label='Value' defaultValue={[50]} />,
      'slider-thumb'
    );
    expect(el).not.toHaveAttribute('aria-valuetext');
    unmount();
  });
});

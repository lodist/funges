import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

function Slider({
  className,
  defaultValue,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  showTicks = false,
  formatValue,
  // Radix puts role="slider" on the *thumb*, not on the root, so an
  // aria-label spread onto the root names an element that has no role and
  // leaves the actual slider anonymous (axe: aria-input-field-name). Pulled
  // out of props here so it can be forwarded to the thumbs below.
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** Render a tick mark under every legal step value (e.g. one per forecast day). */
  showTicks?: boolean;
  /** Spoken form of a value, for `aria-valuetext` — e.g. 0 becomes "Today". */
  formatValue?: (value: number) => string;
}) {
  // Radix hands the value out but never back in, and aria-valuetext has to
  // follow the drag. Mirroring the value here keeps an uncontrolled slider
  // announcing what a controlled one announces. One thumb per entry, and the
  // fallback is Radix's own default — a bare <Slider /> is not a range.
  const [uncontrolled, setUncontrolled] = React.useState(() =>
    Array.isArray(defaultValue) ? defaultValue : [min]
  );
  const values = Array.isArray(value) ? value : uncontrolled;

  const tickCount = showTicks ? Math.round((max - min) / step) + 1 : 0;

  return (
    <div className='w-full'>
      <SliderPrimitive.Root
        data-slot='slider'
        defaultValue={defaultValue}
        value={value}
        onValueChange={next => {
          setUncontrolled(next);
          onValueChange?.(next);
        }}
        min={min}
        max={max}
        step={step}
        className={cn(
          'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50',
          // Radix starts a slide from a pointerdown anywhere on the root, so
          // the root *is* the target — and the root is 358x6: the thumb is
          // absolutely positioned and does not raise it, so the whole control
          // was six pixels tall. ::before states 44px outright rather than
          // insetting from a height that is not the one you see. Vertical
          // only: it stays inside the card's padding, so the map underneath
          // keeps its own events at either end of the travel.
          'before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2',
          className
        )}
        {...props}
      >
        <SliderPrimitive.Track
          data-slot='slider-track'
          // Plain and neutral — deliberately no accent colour, so this control
          // never reads as part of the map's score/legend colour coding.
          //
          // A stroke rather than a fill, because a fill cannot carry both
          // boundaries here. The card is glass over the map, which leaves one
          // neutral axis for three levels: measured, a wash dark enough to hold
          // 3:1 against the card drops the range below 3:1 against itself, and
          // the reverse. An outline moves the track's boundary off that axis —
          // --foreground solid measures 14.5:1 light and 8.2:1 dark on any tile
          // the map can produce, and the range then reads against the untouched
          // card interior at the same numbers. bg-muted, the old fill, was a
          // background token: 1.32:1 light and 1.02:1 dark.
          className='border-foreground relative grow overflow-hidden rounded-full h-2 border'
        >
          <SliderPrimitive.Range
            data-slot='slider-range'
            className='bg-foreground absolute h-full'
          />
        </SliderPrimitive.Track>
        {values.map((thumbValue, index) => (
          <SliderPrimitive.Thumb
            data-slot='slider-thumb'
            // A thumb's identity *is* its position: thumb 0 is always the low
            // end. Keying by value would remount the thumb on every drag frame
            // and break the drag.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            // A range slider has two thumbs and one label, so each thumb gets
            // the label plus its 1-based position — otherwise both announce
            // identically and there is no telling which end has focus.
            aria-label={
              ariaLabel && values.length > 1
                ? `${ariaLabel} ${index + 1}`
                : ariaLabel
            }
            aria-labelledby={ariaLabelledBy}
            // Without this a date slider announces its index: "0" where the
            // label beside it reads "Today".
            aria-valuetext={formatValue?.(thumbValue)}
            className='border-background bg-foreground block size-4 shrink-0 rounded-full border-2 elevation-control transition-transform hover:scale-110 focus-ring'
          />
        ))}
      </SliderPrimitive.Root>
      {tickCount > 0 && (
        // Thumb radius (size-4 = 16px → 8px = px-2) insets the ticks to line up
        // under the track's actual travel range, not the full container width.
        // The track's own stroke, not bg-border, which measured 1.04:1 in dark
        // — invisible on the one surface where the ticks are the only thing
        // saying where the thumb can stop.
        <div aria-hidden className='flex justify-between px-2 mt-1.5'>
          {Array.from({ length: tickCount }, (_, i) => (
            <span key={i} className='h-1 w-px bg-foreground' />
          ))}
        </div>
      )}
    </div>
  );
}

export { Slider };

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step = 1,
  showTicks = false,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** Render a tick mark under every legal step value (e.g. one per forecast day). */
  showTicks?: boolean;
}) {
  const values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  );

  const tickCount = showTicks ? Math.round((max - min) / step) + 1 : 0;

  return (
    <div className='w-full'>
      <SliderPrimitive.Root
        data-slot='slider'
        defaultValue={defaultValue}
        value={value}
        min={min}
        max={max}
        step={step}
        className={cn(
          'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50',
          className
        )}
        {...props}
      >
        <SliderPrimitive.Track
          data-slot='slider-track'
          // Plain, neutral track — deliberately no accent color, so this control
          // never reads as part of the map's score/legend color coding.
          className='bg-muted relative grow overflow-hidden rounded-full h-1.5'
        >
          <SliderPrimitive.Range
            data-slot='slider-range'
            className='bg-foreground/25 absolute h-full'
          />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            data-slot='slider-thumb'
            key={index}
            className='border-background bg-foreground block size-4 shrink-0 rounded-full border-2 shadow-[0_1px_4px_rgba(0,0,0,0.25)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:pointer-events-none disabled:opacity-50'
          />
        ))}
      </SliderPrimitive.Root>
      {tickCount > 0 && (
        // Thumb radius (size-4 = 16px → 8px = px-2) insets the ticks to line up
        // under the track's actual travel range, not the full container width.
        <div aria-hidden className='flex justify-between px-2 mt-1.5'>
          {Array.from({ length: tickCount }, (_, i) => (
            <span key={i} className='h-1 w-px bg-border' />
          ))}
        </div>
      )}
    </div>
  );
}

export { Slider };

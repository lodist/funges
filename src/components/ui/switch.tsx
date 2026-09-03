import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

// The 2px stroke carries the 3:1 non-text floor in every state, exactly as it
// does on Checkbox and RadioGroupItem — the switch was the one of the three
// drawing its only boundary with a fill. --input reads 1.30:1 on the page and
// --primary 2.94:1, while --primary-text reads 7.85:1 light / 6.44:1 dark, so
// the boundary no longer rests on the track colour and the knob no longer has
// to carry it with a near-black ring. p-0 defeats the global button{padding}
// reset in globals.scss. ::before widens the hit area to 44px.
//
// 24×44 outside, 2px stroke, so the track interior is 20×40: a 16px knob insets
// 2px on every side and travels 20px (translate-x-5) between the two ends.
const SWITCH_CLASS =
  'peer relative p-0 inline-flex h-6 w-11 shrink-0 items-center ' +
  'rounded-full border-2 border-primary-text ' +
  'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input ' +
  'aria-invalid:border-destructive-text ' +
  'before:absolute before:top-1/2 before:left-1/2 before:size-11 ' +
  'before:-translate-x-1/2 before:-translate-y-1/2 ' +
  'transition-[background-color,border-color,box-shadow] focus-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

// One knob colour in both states: a knob that recolours per state reads as a
// hole punched in the track rather than a moving part. Its outline matches the
// track stroke rather than opposing it — 6.06:1 light / 4.01:1 dark against the
// off fill, which is the state where the knob has to be found. On the lit track
// it is a redundant cue, since the stroke already bounds the control there.
const SWITCH_THUMB_CLASS =
  'pointer-events-none block size-4 ml-0.5 rounded-full bg-white ' +
  'border border-primary-text ' +
  'transition-transform data-[state=checked]:translate-x-5 ' +
  'data-[state=unchecked]:translate-x-0';

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot='switch'
      className={cn(SWITCH_CLASS, className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot='switch-thumb'
        className={SWITCH_THUMB_CLASS}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

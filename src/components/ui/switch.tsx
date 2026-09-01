import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

// p-0 defeats the global button{padding} reset in globals.scss, which squashed
// this into a blob with no visible knob. ::before widens the hit area to 44px.
const SWITCH_CLASS =
  'peer relative p-0 inline-flex h-[1.15rem] w-8 shrink-0 items-center ' +
  'rounded-full border border-transparent ' +
  'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input ' +
  'before:absolute before:top-1/2 before:left-1/2 before:size-11 ' +
  'before:-translate-x-1/2 before:-translate-y-1/2 ' +
  'transition-all focus-ring disabled:cursor-not-allowed disabled:opacity-50';

// One knob colour in both states, and a fixed light one: a knob that changes
// colour reads as a hole punched in the track rather than a moving part. A pale
// off track leaves that knob at 1.32:1, so the knob carries its own outline.
// --foreground gives 12.37:1 off and 5.44:1 lit; in dark it collapses to 2.34:1
// on the lit track, so dark swaps to --border for 6.10:1 off and 3.40:1 lit.
// The shadow is depth only; a blur is not a measurable boundary.
const SWITCH_THUMB_CLASS =
  'pointer-events-none block size-4 rounded-full bg-white ' +
  'border border-foreground dark:border-border shadow-sm ' +
  'transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] ' +
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

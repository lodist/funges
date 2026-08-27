import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

// p-0 defeats the global button{padding} reset in globals.scss, which squashed
// this into a blob with no visible knob. ::before widens the hit area to 44px.
const SWITCH_CLASS =
  'peer relative p-0 inline-flex h-[1.15rem] w-8 shrink-0 items-center ' +
  'rounded-full border border-transparent ' +
  'data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground ' +
  'before:absolute before:top-1/2 before:left-1/2 before:size-11 ' +
  'before:-translate-x-1/2 before:-translate-y-1/2 ' +
  'transition-all focus-ring disabled:cursor-not-allowed disabled:opacity-50';

// One knob colour in both states, because a knob that changes colour reads as a
// hole punched in the track rather than a moving part. Making that work is the
// off track's job: --input left the knob at 1.32:1 and invisible, so the track
// carries the state and --muted-foreground gives 5.29:1 light / 9.81:1 dark.
// The lit state is 2.94:1 light / 5.46:1 dark — knowingly just under the 3:1
// non-text floor, since the track colour and the knob position also carry it.
const SWITCH_THUMB_CLASS =
  'pointer-events-none block size-4 rounded-full ring-0 bg-background ' +
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

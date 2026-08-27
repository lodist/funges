import * as React from 'react';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';

// The height animation reads --radix-collapsible-content-height, which the
// primitive already publishes, and rides the shared duration and easing tokens.
const CONTENT_CLASS =
  'overflow-hidden data-[state=open]:animate-collapsible-down ' +
  'data-[state=closed]:animate-collapsible-up';

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot='collapsible' {...props} />;
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot='collapsible-trigger'
      {...props}
    />
  );
}

// The caller's className goes on an inner box, never on the element that
// animates: padding does not collapse with height and would leave the closed
// state its own padding tall.
function CollapsibleContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot='collapsible-content'
      className={CONTENT_CLASS}
      {...props}
    >
      <div className={className}>{children}</div>
    </CollapsiblePrimitive.CollapsibleContent>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };

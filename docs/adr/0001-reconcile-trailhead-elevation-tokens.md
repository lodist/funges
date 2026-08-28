# Reconcile Trailhead's shipped shadows onto the elevation/glass tokens

`#213` ("Trailhead") shipped hardcoded, light-mode-only shadow values across several `src/components/ui/*` primitives (Card, Button, Input, Select, Dialog, DropdownMenu, Sheet) before `#195`/`#200`'s semantic elevation/glass token system (`raised`/`floating`/`overlay`, aliasing `#199`'s `--shadow-*` scale) had been implemented in code. Rather than ship the two systems in parallel or revert Trailhead's already-live look, `#201`'s component inventory canonicalizes Trailhead's shipped rgba values as the elevation tokens' source of truth: `raised` and `raised-subtle` (a quieter sub-token for input-style chrome — Card/Button's punchier hover-escalating shadow would visibly regress Input/Select Trigger's whisper-quiet pill shadow if collapsed onto one value, and vice versa) both trace to Trailhead's values, `floating` and `overlay` were already consistent across their components and needed no split. `glass` eligibility is restricted per-component (Card, Sidebar, Button's icon/map-control compound variant, Input, Select Trigger) rather than blanket-enabled on every `raised`/`floating` primitive, since several floating primitives are text-heavy menus/dialogs where glass would risk WCAG 1.4.11 contrast failures.

## Considered Options

- **Revert Trailhead's hardcoded shadows and implement `#200`'s tokens against the original `--shadow-*` scale as written.** Rejected: would visibly regress components already shipped to users for the sake of matching a spec that predates Trailhead; the token system's job is to formalize what's live, not to override it.
- **One shared `raised` token instead of `raised`/`raised-subtle`.** Rejected: Trailhead shipped genuinely different shadow weights for "chrome you press" (Card, Button) vs. "chrome you look through" (Input, Select Trigger) — forcing one value regresses whichever side loses.

## Consequences

Dark-mode elevation — previously broken (dark shadow values were byte-identical to light) — gets fixed as a side effect, via `#200`'s `--glass-highlight` inset border applied to these same canonicalized levels, rather than as a separate follow-up.

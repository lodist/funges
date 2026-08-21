// PROTOTYPE — throwaway. See ./README.md.
//
// Two concrete, AllTrails-grounded class recipes. Every real shadcn/Radix
// atom in src/components/ui/* already accepts a `className` prop that's
// merged with tailwind-merge (see src/lib/utils.ts `cn`), so this prototype
// doesn't fork or touch a single production atom — it just hands each real
// atom a different set of utility classes per variant. That's also exactly
// how a "winning" direction would get folded in for real: as className
// tweaks on the existing components, not a rewrite.
//
// Every oklch(...) value below is written out literally in each class
// string on purpose — see palette.ts for why (Tailwind can't discover a
// class name assembled via template-literal interpolation).

export type Variant = 'trailhead' | 'ridge';

export const VARIANTS: { id: Variant; label: string; blurb: string }[] = [
  {
    id: 'trailhead',
    label: 'A — Trailhead',
    blurb:
      'Faithful AllTrails mapping, recoloured per review: a happy, lighter green scale — no red anywhere, no borders except the one true outline button.',
  },
  {
    id: 'ridge',
    label: 'B — Ridge',
    blurb:
      'Same AllTrails DNA (photo-first cards, chip filters) recomposed with our forest palette + Space Grotesk, structured borders instead of pills, trail-blaze accent bars.',
  },
];

interface Recipe {
  // Buttons — AllTrails' "Hit the Trail" pill CTA vs. a bordered, display-type,
  // trail-signage-flavoured button.
  btnPrimary: string;
  btnSecondary: string;
  btnGhost: string;
  // Same shape as btnPrimary, but the deepest step of the green scale —
  // stands in for "destructive" without introducing red.
  btnDestructive: string;
  // Icon colour for danger/warning callouts (also green-scale, no red).
  dangerIcon: string;
  // Circular floating icon button, à la AllTrails' map zoom/locate controls.
  btnIcon: string;
  // Species result card — AllTrails' trail card: photo-first, badge overlaid
  // on the image, soft shadow, no border.
  card: string;
  cardImageWrap: string;
  cardBody: string;
  // Save/heart toggle overlaid on the photo corner.
  saveButton: string;
  // Colour-coded edibility pill (AllTrails' green/amber/red difficulty pill,
  // recoloured to a green-only scale: light = safe, mid = caution,
  // deep = avoid).
  badgeBase: string;
  badgeSuccess: string;
  badgeWarning: string;
  badgeDestructive: string;
  // Horizontally-scrolling filter chip row.
  chip: string;
  chipSelected: string;
  // Form atoms
  input: string;
  textarea: string;
  selectTrigger: string;
  selectContent: string;
  selectItem: string;
  // Checkbox: square + a genuinely visible tick. Radio: circular. Both need
  // p-0 for the same reason as saveButton (global button{} padding reset).
  checkbox: string;
  radio: string;
  // radio-group.tsx hardcodes the selected centre dot as `fill-primary` with
  // no className passed through, so it can't be recoloured via a class —
  // only by overriding the --primary CSS var the class reads from, scoped
  // to the RadioGroup wrapper (see AtomsKitchenSink.tsx). Empty = don't
  // override (Ridge keeps the app's own --primary).
  radioIndicatorColor: string;
  // Overlay atoms
  dialogContent: string;
  // Dialog renders with showCloseButton={false} and this styles our own
  // <DialogClose> instead — the built-in one has no className passthrough.
  dialogClose: string;
  sheetContent: string;
  sheetHandle: string;
  // Sheet has no showCloseButton escape hatch at all (unlike Dialog), so
  // its built-in close button can only be reached by a scoped CSS override
  // (see the <style> tag in AtomsKitchenSink.tsx) — this is that CSS, as a
  // template string of declarations, not a Tailwind class list.
  sheetCloseCss: string;
  // The plain <button> list rows inside the sheet ("Weekend spots" etc.) —
  // same global button{} bg-muted reset as everywhere else if left unset.
  sheetListItem: string;
  tooltipContent: string;
  switchRoot: string;
  separator: string;
  skeleton: string;
}

export const recipes: Record<Variant, Recipe> = {
  trailhead: {
    // Text is a deep green from the same scale (not white/black, and NOT
    // changing to white on hover) — on a bright "happy" green, dark text
    // reads far better than white, and it keeps every colour on the button
    // within the green scale, per review.
    // Hover is a deliberately BIG jump down the scale (0.74 → 0.58), not a
    // token nudge — review wanted the hover state to actually read as a
    // colour change, on both this and the destructive button below.
    btnPrimary:
      'rounded-full px-6 h-11 font-semibold border-0 bg-[oklch(0.74_0.17_150)] text-[oklch(0.24_0.07_150)] shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:bg-[oklch(0.58_0.18_150)] hover:shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-[background-color,box-shadow]',
    // Border lives ONLY here — this is the one button that's semantically
    // "outline" (Share). Every other button below is border-0, at rest and
    // on hover alike; hover only ever shifts a fill, never adds an outline.
    // hover:text is pinned explicitly — Button's `outline` variant base
    // classes include `hover:text-white`, which otherwise wins (nothing in
    // this recipe used to contest it) and goes invisible on the pale hover
    // fill.
    btnSecondary:
      'rounded-full px-6 h-11 font-semibold border-2 border-[oklch(0.65_0.18_150)] bg-transparent text-[oklch(0.42_0.13_150)] shadow-none hover:bg-[oklch(0.97_0.03_152)] hover:text-[oklch(0.42_0.13_150)]',
    btnGhost:
      'rounded-full px-6 h-11 font-medium border-0 text-foreground bg-transparent hover:bg-[oklch(0.97_0.03_152)] hover:text-[oklch(0.42_0.13_150)] transition-colors',
    btnDestructive:
      'rounded-full px-6 h-11 font-semibold border-0 bg-[oklch(0.24_0.07_150)] text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:bg-[oklch(0.36_0.10_150)] hover:shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-[background-color,box-shadow]',
    dangerIcon: 'text-[oklch(0.24_0.07_150)]',
    btnIcon:
      'rounded-full size-11 p-0 border-0 shadow-[0_2px_10px_rgba(0,0,0,0.18)] bg-card text-[oklch(0.42_0.13_150)] hover:bg-[oklch(0.97_0.03_152)] hover:text-[oklch(0.42_0.13_150)]',
    card: 'rounded-[1.25rem] overflow-hidden border-0 p-0 gap-0 shadow-[0_2px_16px_rgba(0,0,0,0.10)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.14)] transition-shadow',
    cardImageWrap: 'relative h-40 w-full overflow-hidden bg-muted',
    cardBody: 'px-4 py-4 gap-2',
    // p-0 matters: a global `button{padding:.6em 1.2em}` reset (see README)
    // otherwise pads this off-centre inside its fixed size-9 circle.
    saveButton:
      'absolute top-3 right-3 rounded-full size-9 p-0 border-0 shrink-0 leading-none grid place-items-center bg-white/90 text-[oklch(0.42_0.13_150)] shadow-[0_2px_8px_rgba(0,0,0,0.18)] backdrop-blur-sm hover:bg-white transition-colors',
    badgeBase:
      'rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide border-0',
    badgeSuccess: 'bg-[oklch(0.74_0.17_150)] text-[oklch(0.24_0.07_150)]',
    badgeWarning: 'bg-[oklch(0.93_0.06_152)] text-[oklch(0.42_0.13_150)]',
    badgeDestructive: 'bg-[oklch(0.24_0.07_150)] text-white',
    chip: 'rounded-full border-0 bg-card px-4 py-2 text-sm font-medium text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.08)] shrink-0 whitespace-nowrap hover:bg-[oklch(0.97_0.03_152)]',
    // Selected state stays the same neutral fill as the default chip — no
    // colour swap — and is marked only by weight + the check icon rendered
    // next to the label (see AtomsKitchenSink.tsx).
    chipSelected:
      'rounded-full border-0 bg-card px-4 py-2 text-sm font-semibold text-foreground shrink-0 whitespace-nowrap shadow-[0_1px_4px_rgba(0,0,0,0.08)]',
    input:
      'rounded-full h-12 pl-11 pr-4 border border-border shadow-[0_1px_6px_rgba(0,0,0,0.06)] bg-card focus-visible:border-[oklch(0.74_0.17_150)]',
    textarea:
      'rounded-2xl border border-border bg-card p-4 focus-visible:border-[oklch(0.74_0.17_150)]',
    // data-[size=default]:h-12 (not just h-12) is deliberate: the base
    // component sets data-[size=default]:h-9, a data-attribute-scoped
    // class with higher specificity than a bare height utility, so a plain
    // h-12 alone loses to it in the cascade even though it comes later —
    // it has to be overridden with a class at the same specificity.
    // justify-between (not the base's justify-center) is what actually
    // left-aligns the label against the trigger's right-aligned chevron.
    selectTrigger:
      'rounded-full data-[size=default]:h-12 h-12 px-4 justify-between border border-border bg-card focus-visible:border-[oklch(0.74_0.17_150)]',
    selectContent: 'rounded-2xl border-0 shadow-[0_4px_20px_rgba(0,0,0,0.16)]',
    // focus:bg/text override Radix's own focus:bg-accent/focus:text-accent-
    // foreground (the warm tan token) — same green-only rule as everywhere
    // else. pl-4 lines item text up with the trigger's px-4. Applies to
    // DropdownMenuItem too (reused there).
    selectItem:
      'rounded-xl pl-4 focus:bg-[oklch(0.93_0.06_152)] focus:text-[oklch(0.24_0.07_150)]',
    // Square with a visible tick: p-0 cancels the global button{} padding
    // that was stretching this into a pill; checked state uses the scale
    // instead of the app's old dark-forest --primary, and the tick is
    // explicitly white so it actually shows against the fill.
    checkbox:
      'p-0 size-5 rounded-[5px] border-2 border-[oklch(0.65_0.18_150)] data-[state=checked]:bg-[oklch(0.65_0.18_150)] data-[state=checked]:border-[oklch(0.65_0.18_150)] data-[state=checked]:text-white',
    // Circular: same p-0 fix, plus a bit bigger. text-[...] matters here:
    // the dot is Lucide's Circle icon, which is stroke-based — fill-primary
    // (hardcoded in radio-group.tsx) fills it, but the stroke still follows
    // `currentColor`, which without an explicit text colour on this Item
    // resolves to the page's dark --foreground, not the fill colour —
    // giving the dot a stray dark ring. Pinning text-[...] here fixes it
    // directly rather than relying on the --primary var override to also
    // flow through to `color` (it fills fine but the colour cascade for
    // `color` didn't follow, unlike `fill`).
    radio:
      'p-0 size-5 border-2 border-[oklch(0.65_0.18_150)] text-[oklch(0.65_0.18_150)]',
    radioIndicatorColor: 'oklch(0.65 0.18 150)',
    dialogContent: 'rounded-2xl border-0 shadow-[0_8px_32px_rgba(0,0,0,0.24)]',
    dialogClose:
      'absolute top-4 right-4 rounded-full size-9 p-0 border-0 shadow-[0_2px_8px_rgba(0,0,0,0.15)] bg-card text-[oklch(0.42_0.13_150)] hover:bg-[oklch(0.97_0.03_152)] grid place-items-center leading-none',
    sheetContent:
      'rounded-t-[1.75rem] border-0 shadow-[0_-4px_24px_rgba(0,0,0,0.18)] pt-3',
    sheetHandle: 'mx-auto mb-2 h-1.5 w-10 rounded-full bg-border',
    sheetCloseCss: `
      top: 1rem; right: 1rem; width: 2.25rem; height: 2.25rem; padding: 0;
      border-radius: 9999px; background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15); opacity: 1;
      color: oklch(0.42 0.13 150); display: grid; place-items: center;
    `,
    sheetListItem:
      'text-left px-4 py-3 rounded-2xl bg-card text-sm font-medium shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:bg-[oklch(0.97_0.03_152)] transition-colors',
    tooltipContent:
      'rounded-full px-3 py-1.5 bg-[oklch(0.24_0.07_150)] text-white',
    // p-0 is the fix — same global button{padding} reset as everything
    // else on this page was squashing the track/thumb proportions into a
    // blob with no visible knob.
    switchRoot: 'p-0 data-[state=checked]:bg-[oklch(0.65_0.18_150)]',
    separator: '',
    skeleton: 'rounded-2xl',
  },
  ridge: {
    btnPrimary:
      'rounded-xl px-6 h-11 font-display font-bold uppercase tracking-wide border-2 border-primary shadow-none',
    btnSecondary:
      'rounded-xl px-6 h-11 font-display font-bold uppercase tracking-wide border-2 bg-transparent',
    btnGhost:
      'rounded-lg px-4 h-11 font-display font-semibold uppercase text-xs',
    // No red here either — the deepest green step stands in for destructive.
    btnDestructive:
      'rounded-xl px-6 h-11 font-display font-bold uppercase tracking-wide border-2 border-[oklch(0.24_0.07_150)] bg-[oklch(0.24_0.07_150)] text-white shadow-none',
    dangerIcon: 'text-[oklch(0.24_0.07_150)]',
    btnIcon:
      'rounded-lg size-11 p-0 border-2 border-border bg-card text-foreground shadow-none hover:bg-accent hover:border-accent-foreground',
    card: 'rounded-2xl overflow-hidden border-2 border-border p-0 gap-0 shadow-none',
    cardImageWrap:
      'relative h-40 w-full overflow-hidden bg-muted border-b-2 border-border',
    cardBody: 'px-4 py-4 gap-2',
    saveButton:
      'absolute top-3 right-3 rounded-lg size-9 p-0 shrink-0 leading-none grid place-items-center border-2 border-foreground/20 bg-card/90 text-foreground hover:border-foreground transition-colors',
    badgeBase:
      'rounded-md px-2.5 py-1 text-[11px] font-display font-bold uppercase tracking-wide border-2',
    badgeSuccess:
      'bg-[oklch(0.93_0.06_152)] text-[oklch(0.42_0.13_150)] border-[oklch(0.65_0.18_150)]',
    badgeWarning:
      'bg-[oklch(0.97_0.03_152)] text-[oklch(0.42_0.13_150)] border-[oklch(0.85_0.12_151)]',
    badgeDestructive:
      'bg-[oklch(0.24_0.07_150)] text-white border-[oklch(0.24_0.07_150)]',
    chip: 'rounded-md border-2 border-border bg-card px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide text-foreground shrink-0 whitespace-nowrap',
    chipSelected:
      'rounded-md border-2 border-accent-foreground bg-accent px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide text-accent-foreground shrink-0 whitespace-nowrap',
    input:
      'rounded-lg h-12 border-2 border-border focus-visible:border-primary bg-background px-4',
    textarea:
      'rounded-lg border-2 border-border focus-visible:border-primary bg-background p-4',
    selectTrigger:
      'rounded-lg data-[size=default]:h-12 h-12 px-4 justify-between border-2 border-border bg-background',
    selectContent: 'rounded-lg border-2 shadow-none',
    selectItem: 'rounded-md pl-4',
    checkbox: 'p-0 size-5 rounded-[3px] border-2',
    radio: 'p-0 size-5 border-2',
    radioIndicatorColor: '', // unthemed — Ridge keeps the app's own --primary
    dialogContent: 'rounded-2xl border-2 shadow-none',
    dialogClose:
      'absolute top-4 right-4 rounded-md size-9 p-0 border-2 border-border bg-card text-foreground hover:bg-accent grid place-items-center leading-none',
    sheetContent: 'rounded-none border-l-2 shadow-none',
    sheetHandle: 'hidden',
    sheetCloseCss: `
      top: 1rem; right: 1rem; width: 2.25rem; height: 2.25rem; padding: 0;
      border-radius: 0.375rem; background: var(--card);
      border: 2px solid var(--border); opacity: 1;
      color: var(--foreground); display: grid; place-items: center;
    `,
    sheetListItem:
      'text-left px-4 py-3 rounded-md border-2 border-border bg-card font-display text-sm font-bold uppercase tracking-wide hover:bg-accent transition-colors',
    tooltipContent: 'rounded-md',
    switchRoot: 'p-0 data-[state=checked]:bg-primary',
    separator: '',
    skeleton: 'rounded-lg',
  },
};

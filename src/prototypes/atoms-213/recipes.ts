// PROTOTYPE — throwaway. See ./README.md.
//
// Two concrete, AllTrails-grounded class recipes. Every real shadcn/Radix
// atom in src/components/ui/* already accepts a `className` prop that's
// merged with tailwind-merge (see src/lib/utils.ts `cn`), so this prototype
// doesn't fork or touch a single production atom — it just hands each real
// atom a different set of utility classes per variant. That's also exactly
// how a "winning" direction would get folded in for real: as className
// tweaks on the existing components, not a rewrite.

export type Variant = 'trailhead' | 'ridge';

export const VARIANTS: { id: Variant; label: string; blurb: string }[] = [
  {
    id: 'trailhead',
    label: 'A — Trailhead',
    blurb:
      'Faithful AllTrails mapping: pill buttons/chips/search, soft floating shadows, circular map-style icon buttons, bottom-sheet-first modals.',
  },
  {
    id: 'ridge',
    label: 'B — Ridge',
    blurb:
      'Same AllTrails DNA (photo-first cards, colour-coded status pills, chip filters) recomposed with our forest palette + Space Grotesk, structured borders instead of pills, trail-blaze accent bars.',
  },
];

interface Recipe {
  // Buttons — AllTrails' "Hit the Trail" pill CTA vs. a bordered, display-type,
  // trail-signage-flavoured button.
  btnPrimary: string;
  btnSecondary: string;
  btnGhost: string;
  // Circular floating icon button, à la AllTrails' map zoom/locate controls.
  btnIcon: string;
  // Species result card — AllTrails' trail card: photo-first, badge overlaid
  // on the image, soft shadow, no border.
  card: string;
  cardImageWrap: string;
  cardBody: string;
  // Save/heart toggle overlaid on the photo corner.
  saveButton: string;
  // Colour-coded edibility pill (AllTrails' green/amber/red difficulty pill).
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
  // Overlay atoms
  dialogContent: string;
  dialogClose: string;
  sheetContent: string;
  sheetHandle: string;
  tooltipContent: string;
  switchRoot: string;
  separator: string;
  skeleton: string;
}

export const recipes: Record<Variant, Recipe> = {
  trailhead: {
    btnPrimary:
      'rounded-full px-6 h-11 font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.18)] hover:shadow-[0_3px_12px_rgba(0,0,0,0.22)] transition-shadow',
    btnSecondary:
      'rounded-full px-6 h-11 font-semibold border-2 bg-card shadow-none',
    btnGhost: 'rounded-full px-4 font-medium',
    btnIcon:
      'rounded-full size-11 p-0 shadow-[0_2px_10px_rgba(0,0,0,0.18)] bg-card border border-border/60 text-foreground hover:bg-card',
    card: 'rounded-[1.25rem] overflow-hidden border-0 p-0 gap-0 shadow-[0_2px_16px_rgba(0,0,0,0.10)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.14)] transition-shadow',
    cardImageWrap: 'relative h-40 w-full overflow-hidden bg-muted',
    cardBody: 'px-4 py-4 gap-2',
    saveButton:
      'absolute top-3 right-3 rounded-full size-9 grid place-items-center bg-black/35 text-white backdrop-blur-sm hover:bg-black/50 transition-colors',
    badgeBase:
      'rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide border-0',
    badgeSuccess: 'bg-status-success text-white',
    badgeWarning:
      'bg-[var(--status-warning-background)] text-status-warning-text',
    badgeDestructive: 'bg-destructive text-destructive-foreground',
    chip: 'rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shrink-0 whitespace-nowrap',
    chipSelected:
      'rounded-full border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shrink-0 whitespace-nowrap',
    input:
      'rounded-full h-12 pl-11 pr-4 border border-border shadow-[0_1px_6px_rgba(0,0,0,0.06)] bg-card',
    textarea: 'rounded-2xl border border-border bg-card p-4',
    selectTrigger: 'rounded-full h-11 px-4 border border-border bg-card',
    selectContent: 'rounded-2xl border-0 shadow-[0_4px_20px_rgba(0,0,0,0.16)]',
    selectItem: 'rounded-xl',
    dialogContent: 'rounded-2xl border-0 shadow-[0_8px_32px_rgba(0,0,0,0.24)]',
    dialogClose: 'rounded-full',
    sheetContent:
      'rounded-t-[1.75rem] border-0 shadow-[0_-4px_24px_rgba(0,0,0,0.18)] pt-3',
    sheetHandle: 'mx-auto mb-2 h-1.5 w-10 rounded-full bg-border',
    tooltipContent: 'rounded-full px-3 py-1.5',
    switchRoot: '',
    separator: '',
    skeleton: 'rounded-2xl',
  },
  ridge: {
    btnPrimary:
      'rounded-xl px-6 h-11 font-display font-bold uppercase tracking-wide border-2 border-primary shadow-none',
    btnSecondary:
      'rounded-xl px-6 h-11 font-display font-bold uppercase tracking-wide border-2 bg-transparent',
    btnGhost: 'rounded-lg px-4 font-display font-semibold uppercase text-xs',
    btnIcon:
      'rounded-lg size-11 p-0 border-2 border-border bg-card text-foreground shadow-none hover:bg-accent hover:border-accent-foreground',
    card: 'rounded-2xl overflow-hidden border-2 border-border p-0 gap-0 shadow-none',
    cardImageWrap:
      'relative h-40 w-full overflow-hidden bg-muted border-b-2 border-border',
    cardBody: 'px-4 py-4 gap-2',
    saveButton:
      'absolute top-3 right-3 rounded-lg size-9 grid place-items-center border-2 border-foreground/20 bg-card/90 text-foreground hover:border-foreground transition-colors',
    badgeBase:
      'rounded-md px-2.5 py-1 text-[11px] font-display font-bold uppercase tracking-wide border-2',
    badgeSuccess:
      'bg-status-success/15 text-status-success border-status-success',
    badgeWarning:
      'bg-[var(--status-warning-background)] text-status-warning-text border-status-warning-border',
    badgeDestructive: 'bg-destructive/10 text-destructive border-destructive',
    chip: 'rounded-md border-2 border-border bg-card px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide text-foreground shrink-0 whitespace-nowrap',
    chipSelected:
      'rounded-md border-2 border-accent-foreground bg-accent px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide text-accent-foreground shrink-0 whitespace-nowrap',
    input:
      'rounded-lg h-12 border-2 border-border focus-visible:border-primary bg-background px-4',
    textarea:
      'rounded-lg border-2 border-border focus-visible:border-primary bg-background p-4',
    selectTrigger: 'rounded-lg h-11 px-4 border-2 border-border bg-background',
    selectContent: 'rounded-lg border-2 shadow-none',
    selectItem: 'rounded-md',
    dialogContent: 'rounded-2xl border-2 shadow-none',
    dialogClose: 'rounded-md',
    sheetContent: 'rounded-none border-l-2 shadow-none',
    sheetHandle: 'hidden',
    tooltipContent: 'rounded-md',
    switchRoot: 'data-[state=checked]:bg-primary',
    separator: '',
    skeleton: 'rounded-lg',
  },
};

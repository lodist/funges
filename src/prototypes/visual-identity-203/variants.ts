// PROTOTYPE — #203 color palette & typography directions. See README.md in
// this directory for what's real (pulled from the #202 research doc) vs
// approximated (everything not explicitly given a hex/oklch value there).

export interface VisualIdentityVariant {
  key: string;
  label: string;
  sublabel: string;
  /** class applied to <html>; 'current' applies none (baseline). */
  className: string | null;
}

export const VARIANTS: VisualIdentityVariant[] = [
  {
    key: 'current',
    label: 'Current',
    sublabel: 'shipped palette, unchanged',
    className: null,
  },
  {
    key: 'a',
    label: 'A',
    sublabel: 'Forest/Moss + Warm Neutral',
    className: 'pvi-a',
  },
  {
    key: 'b',
    label: 'B',
    sublabel: 'Deep Teal + Terracotta',
    className: 'pvi-b',
  },
  {
    key: 'c',
    label: 'C',
    sublabel: 'Sage + Charcoal (editorial)',
    className: 'pvi-c',
  },
];

// Token overrides per direction. Only the tokens SpeciesPage + the app shell
// (Sidebar) actually render are covered — see README for the full list.
// Values marked "doc" are lifted straight from the research doc's step 9/11
// hex+oklch table; everything else is a hand-extrapolated tint/shade of the
// same hue, in the pattern src/index.css already uses between --primary and
// --accent.
export const VARIANT_CSS = `
html.pvi-a {
  --background: #fdfdfc;
  --foreground: #21201c;
  --card: #fdfdfc;
  --card-foreground: #21201c;
  --primary: oklch(0.526 0.129 147); /* doc: grass11 #2a7e3b */
  --primary-foreground: #ffffff;
  --secondary: #e9f5ea;
  --secondary-foreground: oklch(0.526 0.129 147);
  --muted: #f1efe9;
  --muted-foreground: #6f6a61;
  --accent: #ad7f58; /* doc: brown9, terracotta-tan accent/badge fill */
  --accent-foreground: #ffffff;
  --border: #e3e0d9;
  --input: #e3e0d9;
  --ring: oklch(0.651 0.147 147); /* doc: grass9 #46a758 */
  --sidebar: #f5f3ee;
  --sidebar-foreground: #21201c;
  --sidebar-primary: oklch(0.526 0.129 147);
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #ad7f58;
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #e3e0d9;
  --sidebar-ring: oklch(0.651 0.147 147);
  --font-sans: 'Public Sans', sans-serif;
  --font-display: 'Space Grotesk', sans-serif;
}

html.pvi-b {
  --background: #fafaf9;
  --foreground: #1a1a1a;
  --card: #fafaf9;
  --card-foreground: #1a1a1a;
  --primary: oklch(0.552 0.101 179); /* doc: teal11 #008573 */
  --primary-foreground: #ffffff;
  --secondary: #e3f4f1;
  --secondary-foreground: oklch(0.552 0.101 179);
  --muted: #f0efec;
  --muted-foreground: #52514c;
  --accent: #f76b15; /* doc: orange9, Strava-style single high-vis accent */
  --accent-foreground: #ffffff;
  --border: #e2e0dc;
  --input: #e2e0dc;
  --ring: oklch(0.649 0.114 182); /* doc: teal9 #12a594 */
  --sidebar: #f4f4f2;
  --sidebar-foreground: #1a1a1a;
  --sidebar-primary: oklch(0.552 0.101 179);
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #a18072; /* doc: bronze9 terracotta */
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #e2e0dc;
  --sidebar-ring: oklch(0.649 0.114 182);
  --font-sans: 'Public Sans', sans-serif;
  --font-display: 'Space Grotesk', sans-serif;
}

html.pvi-c {
  --background: #f9faf9;
  --foreground: #363a38;
  --card: #f9faf9;
  --card-foreground: #363a38;
  /* doc: sage alone is too low-energy for primary actions; pairing with B's
     teal per the doc's explicit "pair with A or B's primary" note. */
  --primary: oklch(0.552 0.101 179); /* teal11 #008573 */
  --primary-foreground: #ffffff;
  --secondary: #eceeed;
  --secondary-foreground: #5f6563; /* doc: sage11 */
  --muted: #eceeed;
  --muted-foreground: #5f6563; /* doc: sage11 #5f6563 */
  --accent: #868e8b; /* doc: sage9 #868e8b */
  --accent-foreground: #ffffff;
  --border: #dcdedd;
  --input: #dcdedd;
  --ring: oklch(0.649 0.114 182); /* teal9 */
  --sidebar: #f1f2f1;
  --sidebar-foreground: #363a38;
  --sidebar-primary: oklch(0.552 0.101 179);
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #868e8b;
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #dcdedd;
  --sidebar-ring: oklch(0.649 0.114 182);
  --font-sans: 'Libre Franklin', sans-serif;
  --font-display: 'Fraunces', serif;
}

/* Headings pick up the display face; body text stays on --font-sans, which
   every variant above also repoints. Nothing changes for the 'current'
   baseline since no html.pvi-* class is present. */
html[class*='pvi-'] h1,
html[class*='pvi-'] h2,
html[class*='pvi-'] h3 {
  font-family: var(--font-display);
}
`;

---
version: 1
slug: 'src-pages-identifypage-tsx'
primary_target: 'src/pages/IdentifyPage.tsx'
related_targets:
  [
    'src/components/IdentifyResults.tsx',
    'src/hooks/use-identify-flow.ts',
    'src/lib/isolation.ts',
  ]
---

# Identify: the find as a specimen plate

Status: the owner asked on 18 Oct 2026 for photo ID to leave the map's dialog for its own page, in the house style, reachable from the sidebar and the phone bar, and chose the "Specimen plate" layout from a dealt hand.

## Scope and mode

Operate surface for the moment a forager is holding something: in the field on a phone, or at home with photos on a laptop. Success is a reader who compares the matches with their dangerous look-alikes and does not eat on the strength of a percentage. The page must keep the safety notice permanent and every toxic match as prominent as an edible one.

## Direction contract

- THESIS: the find laid out like a field-guide plate — two labelled frames for the two views that matter (top and cap; underside or stem base), the matches set beside it. Refuses the dialog over the map, and refuses a hero "top match": every match is an equal plate, because the interface never implies a certainty the model does not have.
- OWN-WORLD: the Trailhead, unchanged. The deep-green band (`BAND_SURFACE_CLASS`) with the landing's lingonberry forest photo beside it from md up, warm paper, 4:5 `rounded-card` frames, pill actions, the permanent-notice treatment (`bg-status-warning-background`, `ring-status-warning-border/60`) for safety, `ring-destructive` on toxic plates.
- STORY: the reader downloads the model once (size shown, progress, cancel), fills frame one (the camera on a phone, a file or a drop on desktop), optionally frame two once frame one holds a photo, taps Identify, and reads "Possible matches": the toxic banner and the "easily confused" pair alert first, then equal plates with photo, names, match share and a link to the species page. "Try another photo" starts over; the model stays downloaded until "Remove downloaded model".
- FIRST VIEWPORT: phone: band with title, lead and the three on-device facts, the safety notice, the plate's two frames (square below sm) and its Identify button clear of the bottom bar; on a first visit the download step and its button instead, without the frames. Desktop: the band split with the forest photo, the safety notice, then a sticky plate (5/11) beside the guide or the results (6/11); on a first visit the frames show as a 3:2 outline strip above the download step, whose button takes Identify's slot.
- FORM: surface structure #3, "Two-frame specimen plate", seed key 88422509.
- FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, its verdict and DESIGN.md.

## Behaviour rules

- The page is served cross-origin isolated (COOP/COEP from a Cloudflare rule scoped to `/identify`) so ORT runs on several CPU threads: about 3× faster on a mid-range phone. Isolation is fixed per document, so every link into or out of the page is a full load (`reloadDocument`, plain `href`, and a boundary reload in the root route for back/forward).
- Workers start from blob URLs so they inherit the page's isolation; no asset needs the headers.
- The service worker never serves `/identify` from the precached shell (denylist) and fetches it NetworkFirst, so the headers come from the network, and offline from the last network copy.
- Entry points: sidebar (second, after Map), phone bar (centre slot; Data moved into Settings), landing step, PWA shortcut, and the old `?identify=true` link, which redirects. Not the map's tool rail: the bar and the sidebar already show Identify on the map, and the rail is for tools that act on the map.

## Content rules

- Match copy never says "safe" or "edible"; the notice says the tool never confirms that.
- No new rasters: the band photo is an existing landing asset, the frames show the reader's photos, result thumbnails are species assets.

## Open decisions

- Desktop's left column is empty under the sticky plate while results scroll; accepted, since the plate stays in view as the reference.

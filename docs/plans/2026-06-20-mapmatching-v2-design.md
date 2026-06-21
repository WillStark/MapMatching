# MapMatching V2 Design

## Direction

MapMatching V2 is a split atlas instrument: a calm configuration rail beside two large, equal visual fields. It takes the reference image's useful composition—list and explanation on the left, paired subjects on the right—without copying its ecommerce content or visual identity.

### Visual thesis

A contemporary editorial atlas reduced to paper, ink, fine rules, and two precise city colors; the maps feel expansive while the controls feel quiet and deliberate.

### Content plan

- Left rail: MapMatching wordmark, two city searches, swap/share actions, quick comparisons, one concise area summary, settings, and attribution.
- Compare stage: two equal map panes, city identity overlays, one shared-scale ruler, and compact map facts.
- Detail: boundary and source information appears on demand instead of occupying the default canvas.
- Mobile: the maps remain the primary content; cities and controls move into a bottom sheet opened from a persistent utility bar.

### Interaction thesis

- City identity and fact strips enter with a restrained 6px fade/slide once data is ready.
- The settings surface opens with a 180–220ms opacity/translate transition and returns focus to its trigger.
- The shared-scale ruler gives a brief visual acknowledgement when synchronized zoom changes settle.

All motion is disabled under `prefers-reduced-motion`.

## Responsive composition

At 1024px and wider, the app uses a full-height grid with a `clamp(320px, 25vw, 380px)` sidebar and a flexible compare stage. The sidebar has a single right rule and its own scroll area. The stage has two map columns separated by one rule. Maps retain non-zero dimensions and remain mounted across layout changes so MapLibre state is not discarded.

Below 1024px, maps stack at roughly 56svh each. A compact top bar carries the brand and current comparison. A safe-area-aware bottom utility bar exposes Cities & controls, Share, and Reset. The controls sheet opens by default in the empty state. Page padding reserves space for the utility bar so it cannot cover map facts or attribution.

## Visual system

- Bricolage Grotesque: wordmark, city names, comparison ratio.
- Instrument Sans: controls and explanatory text.
- IBM Plex Mono: areas, scale, and source details.
- Paper `#F5F1E8`, ink `#111827`, slate `#536070`, grid `#C9BBAA`.
- City A orange and City B green are limited to identity, boundary, and active state.
- Prefer rules and spacing over containers. Remove the page gradient, most shadows, large-radius cards, and the dark multi-button dock.
- Retain a single soft shadow for floating controls and the mobile sheet.

## Preserved behavior

- Empty start, URL restore, presets, manual search, keyboard listbox behavior, and City A to City B focus.
- Swap, share, reset, labels, boundary details, and scale-sync pause/resume.
- Independent panning with synchronized ground resolution.
- Geometry and basemap loading/error states, including WebGL boundary fallback.
- Solid City A and dashed City B boundary treatment so color is not the only cue.
- Attribution, provider notices, and the existing `/attribution` route.

## Accessibility

The rail is a named `aside`; controls use semantic buttons with 44px targets, visible focus, `aria-pressed`, and adjacent error text. The mobile sheet uses `aria-expanded`/`aria-controls`, closes on Escape, traps focus while open, and restores focus to the trigger. Scale, search, and share updates remain polite live regions. Map articles retain named headings and the skip link targets the compare stage.

## Alternatives considered

- Floating inspector over full-bleed maps: more map area, but it obscures map interaction and weakens search usability.
- Shallow horizontal toolbar: lowest implementation cost, but it preserves the current hierarchy and does not satisfy the requested left-list composition.

The split rail is the selected direction.

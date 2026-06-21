# GeoSync Design System

## Product Context

GeoSync is a public-facing web app for people who want to understand the real scale of two cities instantly.

Primary audience:
- travelers
- urbanists and city nerds
- students and educators
- journalists and creators who want a quick visual comparison

Core job to be done:
- "Show me two cities at the same real-world scale so I can feel their size right away."

MVP wedge:
- compare two cities at equal ground scale
- show clean administrative/place outlines
- support the visual with a few key metrics
- generate a shareable comparison URL

Non-goal for the first version:
- full GIS tooling
- route planning
- 3D mapping
- arbitrary polygon editing
- trying to explain every urban metric at once

## UX Thesis

The app should feel like a precision instrument, not a cluttered map dashboard.

Three UX principles drive everything:

1. Immediate comparison
The user should not need to learn the product. They search city A, search city B, and the app snaps into a trustworthy compare view.

2. Scale trust
The app's main promise is not "two maps" but "same real-world scale." That promise needs to be visible in the interface at all times through locked-scale messaging, rulers, and restrained motion.

3. Visual first, numbers second
The maps do the emotional work. Metrics explain what the user is seeing, but they should never overpower the comparison itself.

## Aesthetic Direction

Direction: Editorial Atlas

This should look like a contemporary city atlas crossed with a productized field guide.

Why this direction works:
- it makes the app feel thoughtful and credible
- it avoids the generic "dark GIS SaaS" look
- it supports both curiosity and education
- it makes shareable screenshots more distinctive

Safe choices:
- search-first top bar
- very quiet basemap
- north-up maps by default
- strong side-by-side compare pattern on desktop

Deliberate risks:
- warm paper-toned canvas instead of a cold white or dark map UI
- oversized scale indicator as a first-class UI object
- large editorial comparison sentence above the maps
- strong city color coding that feels branded, not purely utilitarian

## Visual Personality

The product should feel:
- precise
- calm
- legible
- a little surprising
- highly shareable

The product should not feel:
- busy
- corporate
- overly scientific
- toy-like
- dependent on dense sidebars

## Core Experience

### Entry State

The landing state should be extremely light:
- wordmark
- one-line promise
- two search fields
- a few preset comparisons

Suggested promise:
"Compare two cities at the same real-world scale."

### Result State

Once both places are chosen, the app becomes a compare workspace.

Core elements:
- persistent compare bar with both place inputs
- equal-scale lock chip
- share button
- summary sentence
- dual map panes
- small metric cards
- mode dock

Suggested summary sentence pattern:
"Tokyo covers about 4.3 times the area of Paris."

### Primary Mode

Primary mode: Equal Scale

Rules:
- both panes always represent the same ground resolution
- panning is independent
- zoom changes update both panes to preserve equal scale
- reset recenters both places without breaking the scale lock

### Secondary Modes

Phase 1:
- Equal Scale
- Reference Rings
- Labels On or Off

Phase 2:
- Ghost Overlay
- Compare by area fit
- Story mode with preset annotations

## Screen Architecture

### Desktop

The map is the hero. Chrome stays shallow and horizontal.

```text
+--------------------------------------------------------------------------------------+
| GeoSync  [ City A search................ ] [ City B search................ ] [Share] |
|            [ Equal ground scale locked ]  [ Swap ]                                   |
+--------------------------------------------------------------------------------------+
| Tokyo                                                           Paris                |
| Tokyo is about 4.3x the area of Paris.                                                |
+-------------------------------------------+------------------------------------------+
|                                           |                                          |
|   MAP A                                   |   MAP B                                  |
|   soft basemap                            |   soft basemap                           |
|   color A outline                         |   color B outline                        |
|                                           |                                          |
|                                           |                                          |
|                 ---- 5 km ---- shared scale cue ---- 5 km ----                      |
|                                           |                                          |
|  Area / Pop / Density card                |  Area / Pop / Density card               |
+-------------------------------------------+------------------------------------------+
| [Equal Scale] [Reference Rings] [Labels] [Reset View] [About This Boundary]          |
+--------------------------------------------------------------------------------------+
```

### Mobile

Do not force tiny side-by-side panes on mobile. Preserve the "at once" feel by stacking them.

```text
+---------------------------------------------------------------+
| GeoSync                                                       |
| [ City A search............................................ ] |
| [ City B search............................................ ] |
| [ Equal ground scale locked ] [Share]                        |
+---------------------------------------------------------------+
| Tokyo is about 4.3x the area of Paris.                       |
+---------------------------------------------------------------+
| MAP A                                                        |
| Tokyo                                                        |
| outline + quiet basemap                                      |
+---------------------------------------------------------------+
| ---- same scale ----                                         |
+---------------------------------------------------------------+
| MAP B                                                        |
| Paris                                                        |
| outline + quiet basemap                                      |
+---------------------------------------------------------------+
| [Equal Scale] [Rings] [Labels] [Reset]                       |
| Area / Pop / Density cards                                   |
+---------------------------------------------------------------+
```

## Interaction Rules

### Search

- Search should support fast free-form input.
- Selecting the first city should immediately focus the second field.
- Suggested comparisons should appear below empty search states.
- Recent comparisons can appear as pills, not a dense list.

### Map Behavior

- The map should animate into place quickly but not theatrically.
- All transitions should reinforce trust, not spectacle.
- When scale changes, the lock chip should react subtly so users understand what happened.
- Do not synchronize panning between cities. Synchronize scale only.

### Metrics

Keep only a few:
- area
- population when the source is reliable
- density when population is available and trustworthy

Optional fourth metric later:
- bounding width or height

Metrics should live in compact overlay cards with mono numerals and very plain labels.

### Empty and Error States

Error handling should feel calm:
- "We couldn't load a reliable boundary for this city."
- "Try a different city or use a preset."

Never dump raw provider errors into the UI.

## Typography

Display:
- Cabinet Grotesk

Body:
- Instrument Sans

Data and numeric details:
- IBM Plex Mono

Fallback stack:
- `ui-sans-serif`, `system-ui`, `sans-serif` for body
- `ui-monospace`, `SFMono-Regular`, `monospace` for data

Type roles:
- Display headlines are bold, short, and spacious
- Body text is restrained and conversational
- Numbers are mono and tabular wherever possible

## Color

### Core Palette

- Paper: `#F5F1E8`
- Chalk: `#E9E0D1`
- Ink: `#111827`
- Slate: `#536070`
- Water: `#BFD7EA`
- Grid: `#C9BBAA`

### Compare Colors

- City A: `#E4572E`
- City B: `#2A7F62`

### Semantic

- Success: `#2F7D4A`
- Warning: `#B7791F`
- Error: `#A63D40`

Usage rules:
- The basemap stays mostly neutral.
- Saturated color belongs to selected cities and interaction highlights.
- Avoid gradients as the primary identity device.
- Avoid purple as a default accent.

## Basemap Styling

The basemap should be quiet enough that outlines become the real subject.

Rules:
- land uses low-contrast parchment tones
- water uses a muted, dusty blue
- roads are thin and low-emphasis
- labels are minimal by default
- administrative boundaries outside the selected city stay faint

Selected cities:
- bold outline
- very light tinted fill
- optional label badge anchored near the centroid

## Spacing

Base spacing unit:
- 8px

Preferred rhythm:
- 8 / 12 / 16 / 24 / 32 / 48 / 64

Density target:
- medium-airy

The app should never feel cramped, but it also should not waste space. This is a tool, not a luxury marketing page.

## Layout

Desktop layout:
- top utility bar
- single main compare canvas
- bottom control dock

Mobile layout:
- compact header
- stacked compare panes
- sticky control row

Grid philosophy:
- disciplined
- symmetrical when comparing
- slightly editorial in the header and summary zones

## Motion

Motion approach: intentional and restrained

Use motion for:
- search result confirmation
- entering compare mode
- locked scale updates
- subtle outline fade-ins

Avoid:
- bouncy controls
- parallax
- decorative floating cards
- anything that implies the app is a toy

Reduced motion mode:
- remove animated map transitions longer than 120ms
- keep only instant or near-instant state changes

## Accessibility

- maintain strong contrast on every text element
- do not rely on color alone to distinguish city A and city B
- pair each city color with a label and outline style
- keyboard access for search, mode switches, reset, and share
- visible focus styles on every control
- use tabular numerals for metrics
- respect `prefers-reduced-motion`

## Content Style

The copy should sound:
- clear
- curious
- lightly editorial

The copy should not sound:
- like GIS software
- like a school textbook
- like a hype-heavy startup landing page

Good:
- "Tokyo covers about 4.3 times the area of Paris."
- "Both maps are locked to the same ground scale."

Bad:
- "Synchronized comparative geospatial analysis workspace."

## Decisions Log

1. Cities first
The idea becomes much stronger when the first version is clearly "city comparison" instead of "anything anywhere."

2. Equal ground scale is the product
That concept needs to be the most visible and best-explained interaction in the app.

3. Side-by-side on desktop, stacked on mobile
This preserves comprehension instead of shrinking both panes into unusable thumbnails.

4. Minimal metrics
The visual comparison is the star. Metrics support the insight.

5. Editorial atlas over generic map app
That gives the product a face and makes it more memorable in screenshots and social sharing.

## Design System

Always read this document before making visual or UX decisions.

If a future implementation choice conflicts with this file, prefer:
- calmer UI
- clearer scale trust
- fewer controls
- stronger compare hierarchy

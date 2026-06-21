# MapMatching

MapMatching is a Next.js app for comparing two cities at the same real-world scale.

Current shipped product:
- dual city search with preset comparisons
- normalized boundary geometry with derived area, bbox, and centroid
- side-by-side MapLibre panes with equal-ground-scale sync
- shareable compare URLs and OG image generation
- unit, e2e, and visual regression coverage

## Current Product Notes

- Visiting `/` starts in an empty search-first staging state.
- Search and place lookup run through server routes, with Nominatim-backed global city search enabled by default.
- Boundary sourcing currently uses bundled OpenStreetMap fixture geometry for presets/demo search and Nominatim for live search.
- Attribution is shown in each pane, in the compare data notice, and on `/attribution`.

## Stack

- Next.js 16
- React 19
- TypeScript
- MapLibre GL JS
- Turf helpers for geometry metrics
- Vitest for unit tests
- Playwright for e2e and visual regression

## Getting Started

Install dependencies:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Optional environment variables:

```bash
MAPCOMPARE_SEARCH_PROVIDER=nominatim
MAPCOMPARE_MAP_STYLE_URL=
MAPCOMPARE_EXPECT_BASEMAP=
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
NOMINATIM_EMAIL=
NOMINATIM_USER_AGENT=
NOMINATIM_POLYGON_THRESHOLD=0.0005
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SITE_URL=http://localhost:3000
```

Notes:
- Live Nominatim search is the default. Set `MAPCOMPARE_SEARCH_PROVIDER=demo` for deterministic local/demo search.
- `MAPCOMPARE_MAP_STYLE_URL` overrides the MapLibre style at server runtime.
- `MAPCOMPARE_EXPECT_BASEMAP=false` allows deterministic test styles with no live basemap sources.
- Nominatim requests should include a real user agent, and optionally an email, outside local testing.
- `NEXT_PUBLIC_SITE_URL` or `SITE_URL` should be set in production so canonical and OG URLs do not fall back to localhost.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

## Testing

- `npm test` runs the Vitest unit suite.
- `npm run test:e2e` runs Playwright against a production-style `build + start` server.
- The visual regression lane uses a deterministic local MapLibre style so the live compare surface is testable without external tile variance.

## Repo Pointers

- Compare shell: `src/app/_components/compare-shell.tsx`
- Map pane renderer: `src/app/_components/map-pane-basemap.tsx`
- Search route: `app/api/search/route.ts`
- Place route: `app/api/place/[placeId]/route.ts`
- OG image route: `app/api/og/route.tsx`

# GeoSync Implementation Status

This file is no longer a forward-looking build plan. Most planned phases have shipped.

It remains only because the repo is not fully aligned with the original plan yet, so deleting it would hide real gaps.

## Shipped

- Search API route and dual search UI
- URL restore, presets, share flow, and OG image generation
- Place geometry route with normalized area, bbox, centroid, and attribution
- Equal-ground-scale MapLibre compare with swap, reset, and lock behavior
- Mobile compare layout, boundary info drawer state, and area-first summaries
- Unit, e2e, and visual regression coverage

## Remaining Mismatches Against the Original Plan

1. Boundary sourcing is demo plus Nominatim only. The original plan mentions `geoBoundaries` fallback/enrichment, but that is not implemented in this repo.

2. The launch-oriented preset list is still four curated comparisons, not the larger hand-picked launch set described in the original plan.

## Delete This File When

Delete this file once those mismatches are either:
- intentionally accepted and moved into a different product spec, or
- implemented in the product itself.

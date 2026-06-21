# Map Reliability, Boundary Fixtures, and Scale References

## Goal

Make the compare maps visibly reliable, derive overlays from real place geometry, and add session-only scale reference drawing.

## Implementation Notes

- Map style selection now resolves through a server route so local/test style overrides are not frozen into the client bundle.
- A loaded style only counts as live-ready when it contains a source-backed basemap layer, unless the server explicitly marks the style as a no-basemap deterministic test style.
- Demo and preset boundaries use bundled OpenStreetMap relation fixtures instead of synthetic area-derived rings.
- Scale references support multiple session-only line or circle marks. Circle distance means radius. Marks can be selected, deleted, cleared, and translated in the opposite pane.
- Reference marks intentionally do not serialize into share URLs.

## Verification

- Unit tests cover style config, basemap detection, fixture metadata, and scale-reference geometry math.
- Browser coverage includes drawing multiple line/circle marks, URL non-persistence, and clearing marks.
- Final acceptance should include typecheck, unit tests, lint, production build, focused Playwright coverage, and visual inspection of a live-style map.

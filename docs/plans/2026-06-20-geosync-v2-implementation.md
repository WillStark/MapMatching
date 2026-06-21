# GeoSync V2 Frontend Implementation Plan

**Goal:** Replace the card-heavy GeoSync interface with a responsive left-rail/two-map workspace while preserving all search, URL, geometry, MapLibre, and equal-scale behavior.

**Architecture:** Keep `app/page.tsx` as the Next.js 16 Server Component and `CompareShell` as the client state owner. Extract or add presentational primitives where they reduce markup, but do not rewrite the state machine or remount map instances between responsive layouts. Use existing Tailwind v4/global CSS, fonts, and MapLibre dependencies.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Tailwind CSS 4, MapLibre GL, Vitest, Playwright.

---

### Task 1: Lock the V2 layout contract in tests

**Files:**
- Modify: `e2e/search.spec.ts`
- Modify: `e2e/visual.spec.ts`

**Steps:**

1. Add failing assertions for a named comparison setup sidebar, a split compare workspace, a floating utility group, two map panes on restored comparisons, and an accessible mobile controls trigger/surface.
2. Change visual capture from only `compare-surface` to the complete V2 workspace.
3. Run the focused Playwright tests and confirm they fail because the new landmarks and controls do not exist.

### Task 2: Build presentational V2 chrome

**Files:**
- Create: `src/app/_components/compare-sidebar.tsx`
- Create: `src/app/_components/floating-controls.tsx`
- Modify: `app/globals.css`

**Steps:**

1. Create typed, controlled presentational components for the sidebar sections and floating actions; no search, map, or URL state belongs in these files.
2. Add V2 surface, rule, focus, entry, ruler, and responsive utilities using the existing palette and fonts.
3. Keep utility classes compatible with reduced motion and avoid new runtime dependencies.
4. Run `npm run typecheck` and `npm run lint`.

### Task 3: Recompose CompareShell around the split workspace

**Files:**
- Modify: `src/app/_components/compare-shell.tsx`

**Steps:**

1. Preserve all state/effects/handlers and replace the top header + stacked compare card with the desktop rail and compare stage.
2. Put both searches, presets, summary/ratio, and settings in the rail.
3. Render the scale cue over the map seam and share/settings utilities as a small floating group.
4. Keep existing labels, roles, test IDs, URL synchronization, request race protection, and boundary information behavior.
5. Add the mobile sheet state, Escape close, focus restoration, and safe-area-aware trigger bar without conditionally remounting map panes.
6. Run the focused Playwright search/restore tests until green.

### Task 4: Make map panes fill the workspace

**Files:**
- Modify: `src/app/_components/compare-shell.tsx`
- Modify: `src/app/_components/map-pane-basemap.tsx`

**Steps:**

1. Replace rounded card framing with full-height pane articles separated by rules.
2. Move city identity into a quiet top overlay and area/source facts into a compact bottom strip.
3. Change the basemap container from fixed desktop heights to parent-driven responsive sizing while retaining a mobile minimum height.
4. Preserve fallback SVG, attribution controls, ResizeObserver reporting, solid/dashed outlines, and all MapLibre event wiring.
5. Run scale unit tests and restored-comparison E2E tests.

### Task 5: Verify responsive interactions and update baselines

**Files:**
- Modify: `e2e/visual.spec.ts`
- Update: `e2e/visual.spec.ts-snapshots/*.png`

**Steps:**

1. Verify desktop at 1440px: full-height rail, two equal map fields, no overlapping chrome, readable ruler and utilities.
2. Verify mobile at 430px: stacked maps, working controls sheet, focus return, and no bottom-bar overlap.
3. Update visual snapshots only after the DOM/interaction assertions pass.
4. Run `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`.
5. Inspect the final desktop and mobile screenshots before reporting completion.

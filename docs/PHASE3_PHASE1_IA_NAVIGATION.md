# Phase 1 — Information Architecture and Navigation

This implementation applies the first IA phase directly in the source files.

## What changed
- Reduced first-level sidebar emphasis to six workspaces:
  - Executive Dashboard
  - Operations Hub
  - Commercial Hub
  - Budget & Forecast
  - Compliance & Data Quality
  - Report Library
- Preserved detailed report pages, but moved them behind progressive-disclosure groups and the new Report Library.
- Added three new landing pages inside the app shell:
  - Operations Hub
  - Commercial Hub
  - Report Library
- Updated breadcrumb logic so hidden detailed reports still show the correct section and title.
- Updated sidebar activation logic so detailed pages highlight their parent workspace while still showing the current report.
- Kept Administration hidden for non-admin users.

## Files edited
- `app/static/index.html`
- `app/static/assets/js/app-core.js`
- `app/static/assets/css/base.css`

## What this phase does not yet do
- It does not yet collapse detailed report content into summary / analysis / detail modes.
- It does not yet rebuild the Executive Dashboard into a smaller first-view summary.
- It does not yet change backend report data structures.

## Recommended next phase
Phase 2 should declutter the Executive Dashboard itself by reducing first-view content to:
- a tighter KPI strip
- one dominant trend
- one exception strip
- one ranked comparison
- expandable narrative and standards content

# Annual Budget 2025/26 Dashboard Polish

## Files updated
- `app/static/index.html`
- `app/static/assets/css/reports.css`
- `app/static/assets/js/app-core.js`

## What was improved
### Visual consistency
- Renamed the page heading to **Annual Budget 2025/26** for alignment with the sidebar label.
- Added a cleaner methodology panel and assumption chips below the header.
- Tightened card, section, and chart spacing to improve rhythm and hierarchy.
- Strengthened table/card border radius and surface treatment for a more board-ready appearance.

### Data visualisation
- Added benchmark/context notes to budget charts through the chart note injector.
- Added benchmark mode labels to budget charts so users can quickly see whether a chart contains a target line or reading note.
- Improved chart accessibility by assigning `role="img"` and descriptive `aria-label` text to canvases.

### Tables
- Added hidden captions/ARIA labels for accessibility.
- Improved sticky headers, zebra striping, numeric readability, and row hover states.
- Tightened key column widths and metric-note handling for scannability.

### KPI cards
- Increased minimum card height and improved internal spacing so benchmark notes do not feel cramped.
- Kept headline KPIs visually aligned with the rest of the reporting pages.

### Layout and flow
- Converted dense chart groups to clearer responsive layouts using existing grid utilities.
- Preserved the detailed analytical content while improving the “read top-to-bottom” narrative flow.

## Follow-up refinements worth considering
- Add explicit export/print tuning for the budget page only.
- Replace the radar chart with a compact weighted score bar view if maximum executive readability is preferred.
- Add small “why this matters” callouts beside the highest-risk metrics (NRW, chemical overrun, revenue gap).

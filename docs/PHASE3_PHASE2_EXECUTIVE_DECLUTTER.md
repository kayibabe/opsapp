# Phase 2 — Executive Dashboard Declutter

This phase implements a summary-first executive landing experience.

## What changed
- Replaced the dense overview with one executive shell focused on six decision KPIs.
- Added a compact exception strip so management can see the highest-pressure items immediately.
- Replaced multiple first-view charts with one focus chart that switches between operations and commercial views.
- Replaced the default full zone table with a ranked zone-priority panel.
- Moved the narrative and benchmark scorecard into disclosure panels so detail is still available without dominating first view.
- Extended the executive panel payload with summary fields used by the new landing page:
  - active customers
  - average supply hours per day
  - total breakdowns
  - zones covered
  - schemes covered
  - months with data
  - production time series

## Files edited
- `app/routers/panels.py`
- `app/static/index.html`
- `app/static/assets/js/app-core.js`
- `app/static/assets/css/reports.css`

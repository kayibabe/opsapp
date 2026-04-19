# Phase 3 Phase 7C — Sidebar Executive Refinement

This pass makes the sidebar calmer and more professional.

## What changed
- Reduced sidebar icon size and moved top-level icons to a single restrained SVG line style
- Removed child-report icons and replaced them with small bullet markers
- Tightened row spacing and alignment
- Promoted clearer top-level items with stronger hierarchy
- Kept only Operations Hub and Commercial Hub as collapsible report groups
- Simplified Budget, Compliance, Reports, and Administration into cleaner top-level entries

## Files changed
- `app/static/index.html`
- `app/static/assets/css/base.css`
- `app/static/assets/js/app-core.js`

## Notes
- Existing saved open/closed group state now applies only to `operations` and `commercial`
- The sidebar keeps the previous navigation logic and last-page behavior

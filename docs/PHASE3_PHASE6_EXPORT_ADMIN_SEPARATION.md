# Phase 3 · Phase 6 — Export and Admin Separation

## Objective
Reduce information overload by separating export intent from live analysis and keeping data-management actions inside the admin workspace.

## What was implemented
- Preserved **last visited page** behavior on login by removing the forced role-home redirect.
- Suppressed the role-home helper notes for now so the interface does not imply role-based landing while that feature is deferred.
- Upgraded **Report Library** into an explicit **Export Centre** with three clearer paths:
  - **Board Pack** for executive print outputs
  - **Working Report** for current-page print or Excel export
  - **Data Extract** for detail-density Excel export
- Added an admin-only **Data Management workspace** inside Administration.
- Added admin-only quick links from Report Library into Data Management and Upload History.

## Files changed
- `app/static/index.html`
- `app/static/assets/js/app-core.js`
- `app/static/assets/css/base.css`
- `app/static/assets/css/reports.css`

## Notes
- This phase keeps the current **last login / last visited page** behavior intact.
- Upload remains visible only for admins.
- The new export paths are additive and use the existing print / Excel export pipeline.

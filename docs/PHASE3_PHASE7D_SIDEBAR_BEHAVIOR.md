PHASE 3 PHASE 7D SIDEBAR BEHAVIOR DIRECT PATCH

Purpose
- Enforce a disciplined sidebar navigation model with only two expandable groups:
  Operations Hub and Commercial Hub.

Behavior now implemented
- Only one expandable group may remain open at a time.
- Clicking Operations Hub expands only Operations and redirects to Water Production.
- Clicking Commercial Hub expands only Commercial and redirects to Customer Accounts.
- Standalone items collapse all groups:
  Executive Dashboard, Budget & Forecast, Compliance & Data Quality, Report Library, Administration.
- Direct hub-page navigation is suppressed. If the app attempts to open page `operations`
  or `commercial`, it redirects to the correct default child page instead.
- Active-state styling now distinguishes:
  - active child page
  - current parent group
  - standalone active page

Files
- app/static/index.html
- app/static/assets/css/base.css
- app/static/assets/js/app-core.js

Apply
- Replace the matching files in your project.
- Hard refresh the browser after deployment.

Notes
- Existing Operations Hub and Commercial Hub pages remain in the codebase, but the sidebar
  no longer treats them as direct content destinations.
- Last visited page behavior is preserved. If an old session points to `operations`
  or `commercial`, the app now redirects cleanly to the default child page.
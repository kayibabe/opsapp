# Phase 4 — Quick Filters and Advanced Filters

This implementation reduces information overload by splitting filter controls into two tiers.

## What changed

- Added quick filters to the top toolbar for:
  - Zone
  - Period
  - Report density mode remains alongside them
- Renamed the filter drawer action to **Advanced**
- Refocused the drawer toward:
  - Scheme selection
  - Custom multi-zone scope
  - Custom quarter/month refinement
- Repurposed the active filter chip so it only appears when advanced filtering is active
- Kept full filter power available without forcing all users into the heavy drawer first

## Information architecture effect

This aligns the dashboard with the target summary-first pattern:

- **Quick scope first**: FY, Zone, Period, View mode
- **Advanced scope second**: Scheme and custom combinations
- **Heavy filtering only when needed**

## User experience outcome

Managers and operations staff can now answer most routine questions from the top bar without opening the drawer.
Analysts still retain detailed filter controls when they need them.

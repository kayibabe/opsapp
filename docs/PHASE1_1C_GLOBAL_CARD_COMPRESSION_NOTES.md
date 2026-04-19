# Phase 1.1c Global Card Compression Patch

This patch reduces the visible height of the system card family to approximately 75% of the prior Phase 1.1 size.

## Main changes
- KPI cards reduced from the prior tall executive format to a denser board-ready format
- Chart cards compressed with smaller shells and tighter internal plot wrappers
- Table and narrative card padding tightened to better match the reduced card scale
- Badge, icon, benchmark, legend, and helper elements reduced proportionally
- Mobile card spacing also tightened

## Main target values
- KPI card min-height: 132px
- Chart card min-height: 225px
- Full chart card min-height: 252px
- Plot wrapper min-height: 165px

## Apply
Replace the matching files in your project and hard refresh the browser.

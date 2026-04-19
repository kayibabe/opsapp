# Phase 1.4 Patch Notes — Benchmarks, Status Chips, and Legends

Included files:
- `app/static/assets/css/reports.css`
- `app/static/assets/css/print.css`
- `app/static/assets/js/app-core.js`

What changed:
- standardized benchmark-note shells so every report page uses the same executive note treatment
- unified status-chip rhythm across KPI badges, report chips, benchmark pills, upload result chips, and budget variance badges
- normalized chart legend styling through the shared chart factory so legends read more consistently across line, bar, and doughnut charts
- upgraded HTML legends into compact executive pills for charts that use in-page legend rows
- tightened print/PDF behavior so benchmark notes, chips, and legends stay presentation-ready in board-pack exports
- updated chart benchmark pill wording to read more formally: `Benchmark line`, `Threshold band`, and `Interpretation note`

Apply by replacing the matching files, then hard refresh the browser.
For export testing, open any report page and print to PDF to confirm note boxes, chips, and legends remain readable.

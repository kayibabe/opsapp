# Phase 2.3 — Data Quality and Export Governance

This pass adds governed data-quality and evidence-status chips directly into page summaries and report exports.

## Direct file edits
- `app/services/governance.py`
- `app/routers/compliance.py`
- `app/static/assets/js/app-core.js`
- `app/static/assets/css/reports.css`
- `app/static/assets/css/print.css`

## What changed
- Added a page-export governance builder that combines global data-quality state with page-level evidence treatment.
- Added a new compliance endpoint: `/api/compliance/page-export-governance`.
- Injected governed chips into page headers so every report page carries data-quality and evidence status at summary level.
- Added governed chips into print headers for board-pack/PDF output.
- Added governance rows and a dedicated Governance sheet to Excel exports.

## Governance intent
- Data-quality status now remains visible alongside evidence treatment.
- Board-pack exports now carry the same governance discipline as live pages.
- Compliance pages continue to show evidence caveats where statutory laboratory-result data is not yet onboarded.

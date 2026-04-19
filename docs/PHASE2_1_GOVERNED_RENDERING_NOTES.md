Phase 2.1 — Governed benchmark rendering and page-standard strip

Direct edits made
- app/static/assets/js/app-core.js
- app/static/assets/css/reports.css

What changed
1. Chart governance is now enforced at render time.
   - Charts whose governance mode is context or none automatically suppress decorative target / benchmark / budget-line datasets.
   - Band-governed charts keep control/limit style references but suppress simple target lines.
   - Line-governed charts keep legitimate target-line datasets.

2. Suppressed-reference note added.
   - When a decorative reference line is removed by governance, the chart note now states that the reference line was suppressed under the governance rule.

3. Page-level governance strip added.
   - Active pages now show compact governance chips under the page metadata line:
     - Benchmark rules governed
     - Legends standardized
     - Board-pack print rule active
   - Compliance page also shows an evidence caveat chip.

4. Report-pack header chips extended.
   - Governed report pages now also show a legends-standardized chip in the report header area.

Validation
- JavaScript syntax checked with node --check
- Existing Python governance/compliance modules compile successfully

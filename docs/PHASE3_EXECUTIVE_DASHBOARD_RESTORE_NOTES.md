Phase 3 Executive Dashboard Restore Merge

Issue fixed
- Phase 3 report-density changes had overwritten the Phase 2 summary-first Executive Dashboard.
- This merge restores the summary-first Executive Dashboard while keeping the later IA/navigation and report-density changes in place.

Directly edited
- app/static/index.html
- app/static/assets/js/app-core.js
- app/static/assets/css/reports.css
- app/routers/panels.py

What was restored
- Summary-first Executive Dashboard layout
- 6 executive KPI cards
- exception strip
- operations/commercial focus switch
- ranked zone priorities panel
- data coverage panel
- immediate action prompts panel
- disclosure sections for executive commentary and benchmark scorecard/zone detail

What was preserved
- sidebar IA/navigation restructuring
- report density controls for detailed report pages
- governance and print/export work already added later

Validation
- JavaScript syntax check passed
- Python compile check passed for app/routers/panels.py

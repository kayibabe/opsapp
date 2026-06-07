---
name: srwb-opsapp-js-crash-resolution
description: Use when SRWB OpsApp login hangs at "Contacting server", charts are missing, or dashboard fails after editing index.html.
---

# SRWB OpsApp JS Crash and Login Hang Resolution

## Diagnostic Sequence (run in this order every time)

### Step 1 - JS Syntax Check
```powershell
cd "D:\WebApps\opsapp"
python -c "c=open('app/static/index.html',encoding='utf-8').read(); s=c.find('<script>')+8; e=c.rfind('</script>'); open('data/script_check.js','w',encoding='utf-8').write(c[s:e])"
node --check data\script_check.js
```
Any output = broken JS. Fix before anything else.

### Step 2 - Global variable + function audit
Run: `python data\full_audit.py` (kept in D:\WebApps\opsapp\data\full_audit.py)

### Step 3 - Live API test
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing
$r = Invoke-WebRequest -Uri "http://localhost:8000/" -UseBasicParsing
[regex]::Match($r.Content, "base: '([^']+)'").Groups[1].Value
```
If server is DOWN: run run.bat.
If no POST appears in server log after clicking Sign in: browser cache issue (see Cause 7).

---

## Root Causes and Fixes

### Cause 1 - Escaped backtick (after Python string edits)
Symptom: `SyntaxError: Invalid or unexpected token` on a line with backtick
Fix: Remove the backslash - change `\`` to `` ` `` in the JS

### Cause 2 - Missing global variables (after cleanup/duplicate removal)
Symptom: Browser console: `ReferenceError: ZONES is not defined`
Fix: Run `python data\restore_globals.py`

Required globals block (must all exist in index.html):
```javascript
const ZONES = [];
const ZONE_SCHEMES = {};
const MONTHS_ORDER = ['April','May','June',...,'March'];
const MONTH_SHORT  = ['Apr','May','Jun',...,'Mar'];
let selZones = new Set();
let selSchemes = new Set();
let selMonths = new Set();
let selYear = null;
let openDP = null;
const panelFns = {};
```

### Cause 3 - Missing chart helper functions
Symptom: Audit shows MISSING for mkColumn, mkTrend, mkStack, mkDonut, _rptMVals, _rptMLabsFY, _mLabels, _mVal
Fix: Run `python data\restore_fns.py`
Recovery source: `git show b02fc78:app/static/index.html`

### Cause 4 - Missing _updateStatusBar function  
Symptom: Login gets past auth but fails with `_updateStatusBar is not defined`
Fix: Add the function before the Dashboard section. It updates the status bar with record count, collection rate, and filter summary.

### Cause 5 - Duplicate function definitions
Symptom: Audit shows DUPES. JS uses LAST definition, earlier correct copy is overwritten.
Fix: Find second occurrence, find its closing brace, remove that block.
Check for: doLogin, toggleSlicer, toggleReportsMenu, gotoReportPage, updateClock

### Cause 6 - Server not running
Symptom: Connection refused. Login hangs immediately with no server log.
Fix: Run run.bat. Use the auto-restart version that has a :restart loop.

### Cause 7 - Browser serving stale cached page
Symptom: GET / 200 OK in logs but no POST /api/auth/login appears.
Fix: Incognito window (Ctrl+Shift+N) or Ctrl+Shift+Delete > All time > Cached files.
Prevention: main.py now has Cache-Control: no-store header.

---

## After Every Fix

```powershell
cd "D:\WebApps\opsapp"
python -c "c=open('app/static/index.html',encoding='utf-8').read(); s=c.find('<script>')+8; e=c.rfind('</script>'); open('data/script_check.js','w',encoding='utf-8').write(c[s:e])"
node --check data\script_check.js
python -c "from app.main import app; print('Backend OK')"
git add app/static/index.html
git commit -m "Fix: describe what was broken"
git push
```

---

## Key Reference Commits

| Commit  | Description |
|---------|-------------|
| b02fc78 | Last stable version - use as recovery source for globals and functions |
| 657e4bd | Globals restored (ZONES, ZONE_SCHEMES etc.) |
| bc0e1d5 | Chart functions restored, duplicates removed, no-cache headers |
| 2e335cf | Escaped backtick fix |
| 00b95ee | _updateStatusBar restored |

---

## Credentials (reset 2025-04-03)
Username: Cromwell | Password: SRWB@2025! | Role: Admin
Username: dchitaukali | Password: SRWB@2025! | Role: Admin

### Cause 2b - Missing chart globals (CHART_COLORS, TOOLTIP_DEFAULTS, AXIS_X, AXIS_Y)
Symptom: Browser console: `CHART_COLORS is not defined` — all report charts blank except Customers.
Fix: Run `python data\restore_chart2.py`

Required chart constants (must all exist in index.html just before `function mkColumn`):
```javascript
const CHART_COLORS = { blue:'#0077b6', teal:'#0d9488', green:'#16a34a', amber:'#d97706', ... };
const CHART_PALETTE = Object.values(CHART_COLORS);
const TOOLTIP_DEFAULTS = { backgroundColor:'rgba(15,23,42,0.92)', ... };
const LEGEND_DEFAULTS  = { display:true, position:'bottom', ... };
const AXIS_X = (opts={}) => ({ grid:{display:false}, ... });
const AXIS_Y = (opts={}) => ({ grid:{color:'rgba(0,0,0,0.04)'}, ... });
```
Recovery source: `git show b02fc78:app/static/index.html`
Extract from `const CHART_COLORS` to `function mkColumn(`.

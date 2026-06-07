@echo off
REM ============================================================
REM  Push opsapp to GitHub (origin/main)
REM  Run from D:\WebApps\opsapp  (double-click or: push_to_github.bat)
REM  If git complains about a lock, CLOSE VS Code / any git GUI first.
REM ============================================================

cd /d "%~dp0"

echo.
echo [1/5] Clearing any stale git lock...
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo.
echo [2/5] Staging changes (respecting .gitignore)...
git add -A

echo.
echo [3/5] Current status:
git status --short

echo.
set /p MSG="[4/5] Commit message (press Enter for default): "
if "%MSG%"=="" set MSG=Add fiscal-year and report-generator modules, rework dashboard UI, add rate limiter and scripts; update deps

git commit -m "%MSG%"

echo.
echo [5/5] Pushing to origin/main...
git push origin main

echo.
echo ============================================================
echo  Done. If you saw an auth prompt, complete it in the browser
echo  or paste a Personal Access Token as the password.
echo ============================================================
pause

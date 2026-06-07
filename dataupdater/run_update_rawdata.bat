@echo off
setlocal EnableDelayedExpansion

echo ============================================================
echo   OpsApp DataUpdater  -  RawData Smart-Diff Update Tool
echo ============================================================
echo.

REM Change to the folder containing this .bat file
cd /d "%~dp0"

REM ── Parse optional flags ─────────────────────────────────────
REM   run_update_rawdata.bat              normal run (fill missing only)
REM   run_update_rawdata.bat --test       dry-run, nothing saved
REM   run_update_rawdata.bat --force      overwrite ALL values (full refresh)
REM   run_update_rawdata.bat --setup-task register Windows Task Scheduler job
set "EXTRA_FLAGS="
set "SETUP_TASK=0"

:parse_args
if "%~1"=="--test"        set "EXTRA_FLAGS=%EXTRA_FLAGS% --test"  & shift & goto parse_args
if "%~1"=="--force"       set "EXTRA_FLAGS=%EXTRA_FLAGS% --force" & shift & goto parse_args
if "%~1"=="--setup-task"  set "SETUP_TASK=1"                      & shift & goto parse_args

if "%SETUP_TASK%"=="1" goto :register_task

REM ── Dependency checks ─────────────────────────────────────────
echo [%date% %time%] Checking Python...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Python is not installed or not on PATH.
    echo  Please install Python 3.x from https://python.org
    echo.
    pause
    exit /b 1
)

echo [%date% %time%] Checking dependencies...
pip show pandas   >nul 2>&1 || pip install pandas   --quiet
pip show openpyxl >nul 2>&1 || pip install openpyxl --quiet

REM ── Run the update script ─────────────────────────────────────
echo.
echo [%date% %time%] Running smart-diff update...
echo   (Only records missing or zero in RawData will be updated)
echo.

python update_rawdata_master.py%EXTRA_FLAGS%
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if %EXIT_CODE% EQU 0 (
    echo  [OK]  Finished successfully.
) else (
    echo  [!!]  Finished with errors  (exit code: %EXIT_CODE%)
    echo        Review the output above for details.
)

echo.
echo ============================================================
echo   DONE  -  %date%  %time%
echo ============================================================
echo.
pause
exit /b %EXIT_CODE%


REM ─────────────────────────────────────────────────────────────
:register_task
REM  Creates a Windows Task Scheduler job named OpsApp_RawData_Update
REM  that runs on the 1st of every month at 07:00 AM.
REM  Must be run once as Administrator.
REM ─────────────────────────────────────────────────────────────
echo.
echo  Registering Windows Task Scheduler job...
echo  Task name : OpsApp_RawData_Update
echo  Schedule  : 1st of every month at 07:00
echo  Script    : "%~f0"
echo.

schtasks /Create ^
  /TN "OpsApp_RawData_Update" ^
  /SC MONTHLY /D 1 /ST 07:00 ^
  /TR "cmd /c \"%~f0\"" ^
  /RU "%USERNAME%" ^
  /RL HIGHEST ^
  /F

if %ERRORLEVEL% EQU 0 (
    echo.
    echo  Task registered! It will run on the 1st of each month at 07:00.
    echo  You can view or edit it in Task Scheduler ^> OpsApp_RawData_Update.
) else (
    echo.
    echo  ERROR: Registration failed. Run this .bat as Administrator and retry.
)
echo.
pause
exit /b

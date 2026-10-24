@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PY=C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
if not exist "%PY%" (
    echo [ERROR] Python not found: %PY%
    pause & exit /b 1
)

if not exist "%~dp0.github_token" (
    echo [NOTE] .github_token not found, will try Git Credential Manager.
    echo       If deploy fails, create .github_token in this folder with your
    echo       GitHub Personal Access Token. See README for details.
    echo.
)

echo ============================================
echo   KPI Report - One-Click Update (GitHub Pages)
echo   Reading latest files from 3 data sources
echo ============================================
echo.
echo [1/2] Reading data and generating report...
echo       (this takes about 3-4 minutes, please wait)
echo.
"%PY%" "%~dp0report_data.py"
if errorlevel 1 (
    echo.
    echo [ERROR] report_data.py failed.
    echo        Please check whether source files exist and format is correct.
    pause & exit /b 1
)

echo.
echo [2/2] Deploying to GitHub Pages via API...
echo.
"%PY%" "%~dp0_deploy_api.py"
if errorlevel 1 (
    echo.
    echo [ERROR] Deploy failed. See the message above for the fix.
    echo        Most common cause: no GitHub token available.
    echo        Fix: create a file named .github_token in this folder,
    echo              paste a GitHub Personal Access Token into it.
    echo              Token needs repo scope. See README for details.
    pause & exit /b 1
)

echo.
echo ============================================
echo   [DONE] Report updated and deployed.
echo   Online: https://manfen-phf.github.io/kpi-report/
echo   (GitHub Pages usually takes 30-60 seconds)
echo   Local archive: report-MMDD-HHMM.html in this folder
echo   (single self-contained file, can be opened directly)
echo ============================================
echo.
pause
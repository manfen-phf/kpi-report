@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PY=C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
if not exist "%PY%" (
    echo [ERROR] Python not found: %PY%
    pause & exit /b 1
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
    echo [ERROR] Deploy failed.
    echo        Please make sure you are logged in to github.com via Git Credential Manager,
    echo        or set the GITHUB_TOKEN environment variable, then retry.
    pause & exit /b 1
)

echo.
echo ============================================
echo   [DONE] Report updated and deployed.
echo   Online: https://manfen-phf.github.io/kpi-report/
echo   (GitHub Pages usually takes 30-60 seconds)
echo ============================================
echo.
pause
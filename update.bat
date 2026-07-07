@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "PY=C:\Users\ZhuanZ\.workbuddy\binaries\python\versions\3.13.12\python.exe"
set "SCRIPT=%~dp0generate_report.py"

echo ============================================
echo   商品运营分析报告 - 一键更新
echo ============================================
echo.
echo [1/3] 读取最新数据并生成报告...
"%PY%" "%SCRIPT%"
if errorlevel 1 (
    echo.
    echo [错误] 报告生成失败，请检查数据源文件是否存在/格式是否正确。
    pause
    exit /b 1
)

echo.
echo [2/3] 提交到 Git...
git add -A
git diff --cached --quiet
if errorlevel 1 (
    for /f %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "STAMP=%%a"
    git commit -q -m "auto-update report %STAMP%"
    echo   已提交: %STAMP%
) else (
    echo   无内容变更，跳过提交。
)

echo.
echo [3/3] 推送到 GitHub Pages...
git push
if errorlevel 1 (
    echo.
    echo [提示] 推送失败：请确认网络/凭据，或手动执行 git push。
    pause
    exit /b 1
)

echo.
echo [完成] 报告已更新并推送。在线地址:
echo   https://manfen-phf.github.io/kpi-report/
echo.
pause

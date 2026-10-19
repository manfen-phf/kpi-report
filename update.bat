@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PY=C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
if not exist "%PY%" (
    echo [错误] 未找到 Python: %PY%
    pause & exit /b 1
)

echo ============================================
echo   商品运营分析报告 - 一键更新 (GitHub Pages)
echo   数据截至 3 个数据源最新文件
echo ============================================
echo.
echo [1/2] 读取最新数据并生成报告...
"%PY%" "%~dp0report_data.py"
if errorlevel 1 (
    echo.
    echo [错误] 报告生成失败，请检查数据源文件是否存在/格式是否正确。
    pause & exit /b 1
)

echo.
echo [2/2] 部署到 GitHub Pages (通过 GitHub API)...
"%PY%" "%~dp0_deploy_api.py"
if errorlevel 1 (
    echo.
    echo [错误] 部署失败：请确认已通过 Git Credential Manager 登录 github.com
    echo        或设置环境变量 GITHUB_TOKEN 后重试。
    pause & exit /b 1
)

echo.
echo [完成] 报告已更新并部署。在线地址:
echo        https://manfen-phf.github.io/kpi-report/
echo        (GitHub Pages 通常在 30-60 秒后刷新生效)
echo.
pause

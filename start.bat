@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动 AI Society（首次启动会自动安装依赖，请稍候）...
where py >nul 2>nul
if %errorlevel%==0 (
  py run.py
) else (
  python run.py
)
echo.
echo 程序已退出。按任意键关闭本窗口。
pause >nul

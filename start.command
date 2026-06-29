#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "正在启动 AI Society（首次启动会自动安装依赖，请稍候）..."
if command -v python3 >/dev/null 2>&1; then
  python3 run.py
else
  python run.py
fi

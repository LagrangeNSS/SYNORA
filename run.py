#!/usr/bin/env python3
"""
SYNORA 一键启动器。

直接运行即可，无需手动装依赖：

    python run.py          (Windows 可双击 start.bat)
    python3 run.py         (macOS 可双击 start.command)

它会自动在本文件夹内创建虚拟环境 .venv、把依赖装进去、
并把 pip 缓存也留在本文件夹（.pip-cache）。也就是说：
本程序运行所产生的一切——虚拟环境、依赖、缓存、数据库——
全部落在这个项目文件夹内，不污染你的系统 Python。

想完全清空重来：删掉 .venv / .pip-cache / data 即可。
"""

from __future__ import annotations

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
VENV_DIR = os.path.join(ROOT, ".venv")
PIP_CACHE = os.path.join(ROOT, ".pip-cache")
REQS = os.path.join(ROOT, "requirements.txt")
BOOT_FLAG = "AI_SOCIETY_BOOTSTRAPPED"
HOST, PORT = "127.0.0.1", 8000


def _venv_python() -> str:
    if os.name == "nt":
        return os.path.join(VENV_DIR, "Scripts", "python.exe")
    return os.path.join(VENV_DIR, "bin", "python")


def _in_our_venv() -> bool:
    try:
        return os.path.samefile(sys.executable, _venv_python())
    except OSError:
        return False


def _banner():
    print("=" * 60)
    print("  SYNORA — Synthetic Agora · 只有 AI 在其中生活的合成社会")
    print(f"  访问 http://{HOST}:{PORT}")
    print("  默认 mock 模式无需任何 API Key；支持接入 DeepSeek 等模型")
    print("=" * 60)


def _has_deps(python: str) -> bool:
    return subprocess.run(
        [python, "-c", "import uvicorn, fastapi, httpx, pydantic"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode == 0


def _bootstrap_and_relaunch():
    """在项目内建 venv、装依赖，然后用该 venv 重新启动本脚本。"""
    vpy = _venv_python()

    if not os.path.exists(vpy):
        print("· 正在本文件夹内创建虚拟环境 .venv …")
        try:
            subprocess.run([sys.executable, "-m", "venv", VENV_DIR], check=True)
        except subprocess.CalledProcessError:
            print("创建虚拟环境失败。请确认你的 Python 安装包含 venv 模块。")
            sys.exit(1)

    env = dict(os.environ)
    env["PIP_CACHE_DIR"] = PIP_CACHE          # pip 下载缓存也留在文件夹内
    env[BOOT_FLAG] = "1"

    if not _has_deps(vpy):
        print("· 正在安装依赖（仅首次需要，请稍候）…")
        os.makedirs(PIP_CACHE, exist_ok=True)
        subprocess.run([vpy, "-m", "pip", "install", "--upgrade", "pip"],
                       env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        r = subprocess.run([vpy, "-m", "pip", "install", "-r", REQS], env=env)
        if r.returncode != 0:
            print("依赖安装失败，请检查网络后重试。")
            sys.exit(1)
        print("· 依赖安装完成。")

    # 用虚拟环境的解释器重新运行本脚本（这次会直接进入启动分支）
    os.chdir(ROOT)
    sys.exit(subprocess.run([vpy, os.path.abspath(__file__)], env=env).returncode)


def _serve():
    import webbrowser
    from threading import Timer

    try:
        import uvicorn
    except ImportError:
        # 极端情况下仍缺依赖：回到自举流程
        _bootstrap_and_relaunch()
        return

    _banner()
    Timer(1.5, lambda: webbrowser.open(f"http://{HOST}:{PORT}")).start()
    # 让 backend 包可被导入
    sys.path.insert(0, ROOT)
    uvicorn.run("backend.app:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    # 已经在本项目的 venv 里（或被自举流程二次拉起）→ 直接启动
    if _in_our_venv() or os.getenv(BOOT_FLAG) == "1":
        _serve()
    else:
        _bootstrap_and_relaunch()

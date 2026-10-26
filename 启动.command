#!/bin/bash
# 双击启动：在本地 8899 端口起一个静态服务并打开拼贴台
cd "$(dirname "$0")" || exit 1
PORT=8899
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT + 1)); done
(sleep 1; open "http://127.0.0.1:$PORT/index.html") &
echo "拼贴台已启动：http://127.0.0.1:$PORT/index.html"
echo "关闭此终端窗口或按 Ctrl+C 停止服务。"
exec python3 -m http.server "$PORT"

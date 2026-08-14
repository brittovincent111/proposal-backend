#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
PID_PATH="$ROOT_DIR/.mongo/27021/mongod.pid"
PORT="${MONGO_PORT:-27021}"

find_listener_pid() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

LISTENER_PID="$(find_listener_pid)"
if [ -n "$LISTENER_PID" ]; then
  printf '%s\n' "$LISTENER_PID" > "$PID_PATH"
  echo "MongoDB is running on port $PORT (pid $LISTENER_PID)."
  exit 0
fi

if [ -f "$PID_PATH" ]; then
  PID="$(cat "$PID_PATH")"
  echo "MongoDB is not running on port $PORT (stale pid $PID)."
  exit 1
fi

echo "MongoDB is not running on port $PORT."
exit 1

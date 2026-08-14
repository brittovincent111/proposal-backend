#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.mongo/27021"
PID_PATH="$DATA_DIR/mongod.pid"
PORT="${MONGO_PORT:-27021}"

find_listener_pid() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

LISTENER_PID="$(find_listener_pid)"
if [ -z "$LISTENER_PID" ]; then
  if [ -f "$PID_PATH" ]; then
    PID="$(cat "$PID_PATH")"
    echo "MongoDB is not running on port $PORT (stale pid $PID)."
    exit 0
  fi

  echo "MongoDB is not running on port $PORT."
  exit 0
fi

mongod --shutdown --dbpath "$DATA_DIR"
rm -f "$PID_PATH"
echo "MongoDB on port $PORT has been stopped."

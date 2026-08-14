#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.mongo/27021"
LOG_PATH="$DATA_DIR/mongod.log"
PID_PATH="$DATA_DIR/mongod.pid"
PORT="${MONGO_PORT:-27021}"

find_listener_pid() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

mkdir -p "$DATA_DIR"

LISTENER_PID="$(find_listener_pid)"
if [ -n "$LISTENER_PID" ]; then
  printf '%s\n' "$LISTENER_PID" > "$PID_PATH"
  echo "MongoDB is already running on port $PORT (pid $LISTENER_PID)."
  exit 0
fi

if [ -f "$PID_PATH" ]; then
  PID="$(cat "$PID_PATH")"
  if kill -0 "$PID" 2>/dev/null; then
    echo "MongoDB is already running on port $PORT (pid $PID)."
    exit 0
  fi

  STALE_PATH="$DATA_DIR/mongod.pid.stale.$(date +%s)"
  mv "$PID_PATH" "$STALE_PATH"
  echo "Moved stale pid file to $STALE_PATH."
fi

mongod \
  --dbpath "$DATA_DIR" \
  --port "$PORT" \
  --bind_ip 127.0.0.1 \
  --nounixsocket \
  --logpath "$LOG_PATH" \
  --logappend \
  --fork \
  --pidfilepath "$PID_PATH" || {
  status=$?
  echo "MongoDB failed to start on port $PORT. Recent log output:" >&2
  tail -n 40 "$LOG_PATH" >&2 || true
  exit "$status"
}

echo "MongoDB is listening at mongodb://127.0.0.1:$PORT/qtn"

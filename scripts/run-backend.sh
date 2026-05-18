#!/usr/bin/env bash
set -euo pipefail

# Judge Agent backend-only development runner
#
# Usage:
#   ./scripts/run-backend.sh
#   BACKEND_PORT=19002 ./scripts/run-backend.sh
#   BACKEND_HOST=127.0.0.1 ./scripts/run-backend.sh
#   PYTHON=.venv/bin/python ./scripts/run-backend.sh
#
# This script starts only the FastAPI backend and does not start the frontend.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-19001}"
PYTHON="${PYTHON:-python3}"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/.logs}"
PID_FILE="$LOG_DIR/backend.pid"
LOG_FILE="$LOG_DIR/backend.log"
APP_MODULE="${APP_MODULE:-judgeagent.backend.api:app}"
RELOAD="${RELOAD:-1}"

log() { printf '\033[1;34m[backend]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[backend:warn]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[backend:error]\033[0m %s\n' "$*" >&2; exit 1; }

cd "$ROOT_DIR"
mkdir -p "$LOG_DIR"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    fail "backend가 이미 실행 중입니다. PID=$OLD_PID / 중지: kill $OLD_PID 또는 ./stop.sh"
  fi
  rm -f "$PID_FILE"
fi

if ! command -v "$PYTHON" >/dev/null 2>&1; then
  fail "Python 실행 파일을 찾을 수 없습니다: $PYTHON"
fi

if ! "$PYTHON" - <<'PY' >/dev/null 2>&1
import importlib.util
raise SystemExit(0 if importlib.util.find_spec('uvicorn') else 1)
PY
then
  fail "uvicorn이 설치되어 있지 않습니다. 예: $PYTHON -m pip install -e '.[api]'"
fi

UVICORN_ARGS=("$APP_MODULE" --host "$BACKEND_HOST" --port "$BACKEND_PORT")
if [[ "$RELOAD" != "0" ]]; then
  UVICORN_ARGS+=(--reload)
fi

log "프로젝트: $ROOT_DIR"
log "Backend:  http://localhost:$BACKEND_PORT"
log "API 문서: http://localhost:$BACKEND_PORT/docs"
log "로그:     $LOG_FILE"
log "Frontend는 실행하지 않습니다."

nohup env BACKEND_PORT="$BACKEND_PORT" "$PYTHON" -m uvicorn "${UVICORN_ARGS[@]}" \
  > "$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

log "시작 완료. PID=$PID"
log "로그 확인: tail -f '$LOG_FILE'"
log "중지: kill $PID  또는  ./stop.sh"

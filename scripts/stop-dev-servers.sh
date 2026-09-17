#!/usr/bin/env bash
# Stops any api/web dev server (tsup --watch / vite) still running from a previous
# `pnpm dev` or the "api"/"web" VS Code tasks — used by the "dev" task so it's a real
# "make sure the latest code is running" button instead of one that silently reuses
# whatever's already up.
#
# Matches each dev server by its own resolved binary path under this checkout (so it
# only ever targets processes belonging to THIS repo, never some other project's dev
# server), then kills the whole process group rather than just the matched process —
# tsup's `onSuccess` hook spawns "node dist/main.js" as a separate child that shares
# the group but wouldn't be caught by a plain `pkill -f`, and would otherwise be left
# behind still holding the port.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"

stop_group() {
  local pattern="$1" name="$2" pid pgid

  pid="$(pgrep -f "$pattern" | head -1 || true)"
  [ -n "$pid" ] || return 0
  pgid="$(ps -o pgid= -p "$pid" | tr -d ' ')"
  [ -n "$pgid" ] || return 0

  echo "==> stopping existing $name dev server (pgid $pgid)"
  kill -TERM -- "-$pgid" 2>/dev/null || true
  # A dev restart should be fast, not wait out the api's own graceful-shutdown grace
  # period — give it a couple seconds, then force it so the port is free either way.
  for _ in $(seq 1 20); do
    kill -0 -- "-$pgid" 2>/dev/null || return 0
    sleep 0.1
  done
  echo "==> $name didn't stop in time, forcing"
  kill -KILL -- "-$pgid" 2>/dev/null || true
}

stop_group "$repo_root/apps/api/node_modules" "api"
stop_group "$repo_root/apps/web/node_modules" "web"

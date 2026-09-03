#!/usr/bin/env bash
# Deploy the stack on the target host. Pulls CI-built images; never builds.
#
#   ./deploy.sh              deploy :latest
#   ./deploy.sh sha-<40hex>  deploy / roll back to a specific commit's images
#
# Migrations run as an explicit step before api is recreated (ADR-0010): a bad
# migration aborts here with the old api/web still serving.
#
# Rollback caveats: rolling the image back does NOT roll migrations back, and
# rollback across the DAMN-2 baseline-migration regeneration is unsupported.
set -euo pipefail
cd "$(dirname "$0")"

TAG="${1:-latest}"
export TAG

dc() { docker compose --env-file .env "$@"; }

echo "==> deploy TAG=$TAG"
dc pull
dc up -d postgres --wait
dc run --rm migrate
dc up -d --wait api web    # named explicitly so `up` doesn't re-run the migrate service

# Fail loudly if api isn't actually on the requested tag — a stale checkout plus
# a healthy old container would otherwise leave staging silently frozen.
cid="$(dc ps -q api)"
running="$(docker inspect -f '{{.Config.Image}}' "$cid")"
if [ "${running##*:}" != "$TAG" ]; then
  echo "!! api is running '$running', expected tag ':$TAG'" >&2
  exit 1
fi
echo "==> api running $running"

# End-to-end check through web (Caddy) -> api — the api container's own
# healthcheck only hits :3000 directly; this exercises the proxied path.
web_port="$(sed -n 's/^WEB_PORT=//p' .env)"
web_port="${web_port:-8080}"
ok=
for _ in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:${web_port}/api/health" 2>/dev/null | grep -q '"status":"ok"'; then
    ok=1
    break
  fi
  sleep 3
done
if [ -z "$ok" ]; then
  echo "!! health check failed at http://127.0.0.1:${web_port}/api/health" >&2
  exit 1
fi
echo "==> health OK (http://127.0.0.1:${web_port}/api/health)"

docker image prune -f >/dev/null
dc ps

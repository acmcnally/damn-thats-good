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
API_IMAGE="ghcr.io/acmcnally/damn-thats-good-api:${TAG}"

dc() { docker compose --env-file .env "$@"; }

echo "==> deploy TAG=$TAG"
dc pull
dc up -d postgres --wait --wait-timeout 60
dc run --rm migrate
dc up -d --wait --wait-timeout 120 api web # named so `up` doesn't re-run migrate

# Fail loudly if api isn't actually the image we just pulled — a stale checkout,
# a partial pull, or a no-op recreate would otherwise freeze staging silently.
# Compare image digests (not the tag string, which is a no-op for `latest`).
cid="$(dc ps -q api)"
[ -n "$cid" ] || {
  echo "!! api container is not running" >&2
  exit 1
}
want="$(docker image inspect -f '{{.Id}}' "$API_IMAGE" 2>/dev/null || true)"
got="$(docker inspect -f '{{.Image}}' "$cid")"
if [ -n "$want" ] && [ "$want" != "$got" ]; then
  echo "!! api container ($got) is not the pulled $API_IMAGE ($want)" >&2
  exit 1
fi
echo "==> api on $API_IMAGE"

# End-to-end check through web (Caddy) -> api. The port comes from compose itself
# (authoritative, immune to .env quoting / CRLF), not from parsing .env.
web_port="$(dc port web 8080 | tail -1)"
web_port="${web_port##*:}"
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

#!/usr/bin/env bash
# Run a command against a throwaway Tinybird Local container, as the workflows'
# `services: tinybird` block does. Use it instead of `act` for the jobs that need
# Tinybird: act starts service containers in the host checkout path, the image's
# healthcheck only works from /app, so act reports "service container failed to start".
#
#   scripts/ci/with-tinybird-local.sh pnpm run test:acceptance:tinybird
#   scripts/ci/with-tinybird-local.sh pnpm run test:e2e
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 2
fi

readonly PORT=7181
readonly IMAGE="${TB_LOCAL_IMAGE:-tinybirdco/tinybird-local:latest}"
readonly NAME="tb-local-ci-$$"
readonly TIMEOUT_SECONDS=180

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $PORT is already in use; stop that container first (docker ps)" >&2
  exit 1
fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -p "$PORT:7181" "$IMAGE" >/dev/null

deadline=$((SECONDS + TIMEOUT_SECONDS))
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = "healthy" ]; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Tinybird Local not healthy after ${TIMEOUT_SECONDS}s" >&2
    docker logs --tail 40 "$NAME" >&2
    exit 1
  fi
  sleep 2
done

"$@"

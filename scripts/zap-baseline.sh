#!/usr/bin/env bash
# OWASP ZAP baseline scan against a live URL, run from the owner's computer (needs Docker).
# Usage: scripts/zap-baseline.sh https://<shop domain>/he
# Exit: 0 no High alerts, 1 at least one High alert, 2 run error (usage, Docker, timeout, no report).
# The report is written to test-results/zap/report.json. Counts per risk level are printed.
# The image tag is pinned by hand: bump it once a year (docs/launch-checklist.md > Later).
set -euo pipefail

ZAP_IMAGE="ghcr.io/zaproxy/zaproxy:2.17.0"
TIMEOUT_SECONDS=900

if [ "$#" -lt 1 ] || [ -z "${1:-}" ]; then
  echo "usage: scripts/zap-baseline.sh <url>   (for example https://shop.example/he)" >&2
  exit 2
fi
case "$1" in
  http://* | https://*) ;;
  *)
    echo "error: the address must start with http:// or https://" >&2
    exit 2
    ;;
esac

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "error: Docker is not installed or not running" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "error: node is needed to read the report" >&2
  exit 2
fi

REPORT_DIR="$PWD/test-results/zap"
mkdir -p "$REPORT_DIR"
# The container runs as another user; it must be able to write the report here.
chmod 777 "$REPORT_DIR"
rm -f "$REPORT_DIR/report.json"

NAME="ac-zap-$$"

# Run in the background and wait, so the time limit works without GNU `timeout` (not on macOS).
# On timeout the container itself is stopped: killing only the docker client would leave it running.
docker run --rm --name "$NAME" -v "$REPORT_DIR:/zap/wrk:rw" "$ZAP_IMAGE" \
  zap-baseline.py -t "$1" -J report.json -I &
RUN_PID=$!

cleanup() {
  docker stop "$NAME" >/dev/null 2>&1 || true
}
trap 'cleanup; exit 2' INT TERM

elapsed=0
while kill -0 "$RUN_PID" 2>/dev/null; do
  if [ "$elapsed" -ge "$TIMEOUT_SECONDS" ]; then
    echo "error: the scan took longer than $((TIMEOUT_SECONDS / 60)) minutes and was stopped" >&2
    cleanup
    wait "$RUN_PID" 2>/dev/null || true
    exit 2
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done
# ZAP's own exit code is not used: with -I warnings do not fail it, and a missing report below
# covers the real errors.
wait "$RUN_PID" 2>/dev/null || true
trap - INT TERM

if [ ! -s "$REPORT_DIR/report.json" ]; then
  echo "error: ZAP produced no report (is the address reachable?)" >&2
  exit 2
fi

node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const names = { 3: "High", 2: "Medium", 1: "Low", 0: "Informational" };
const counts = { 3: 0, 2: 0, 1: 0, 0: 0 };
for (const site of report.site ?? []) {
  for (const alert of site.alerts ?? []) {
    const level = Number(alert.riskcode);
    if (level in counts) counts[level] += 1;
  }
}
for (const level of [3, 2, 1, 0]) console.log(`${names[level]}: ${counts[level]}`);
process.exit(counts[3] > 0 ? 1 : 0);
' "$REPORT_DIR/report.json"

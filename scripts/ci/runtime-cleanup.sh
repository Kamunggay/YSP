#!/usr/bin/env bash
source scripts/ci/runtime-compose.sh

[[ ${CI_RUNTIME_OWNED:-false} == true ]] || {
  echo 'No runtime resources claimed; cleanup skipped.'
  exit 0
}

if [[ ${RUNTIME_RESULT:-failure} != success ]]; then
  # Never dump environments, resolved Compose config or database contents.
  docker ps -a --filter "label=com.docker.compose.project=$CI_RUNTIME_PROJECT" \
    --format 'container={{.Names}} status={{.Status}}' || true
  "${compose[@]}" logs --no-color --tail 40 backend mysql 2>&1 | python3 -c '
import os, sys
secrets = [os.environ.get(key, "") for key in ("APP_KEY", "DB_PASSWORD", "MYSQL_ROOT_PASSWORD")]
for line in sys.stdin:
    for secret in sorted(filter(None, secrets), key=len, reverse=True):
        line = line.replace(secret, "[REDACTED]")
    print(line[:2000], end="" if line.endswith("\n") else "\n")
' || echo '::warning::Runtime diagnostics were unavailable.'
fi

# always() schedules this on ordinary failure/cancellation. Forced termination
# can prevent execution; disposal of the GitHub-hosted VM is the final boundary.
# This separate step preserves the failed runtime step if cleanup also fails.
"${compose[@]}" down --volumes --timeout 10
assert_runtime_resources_absent
echo "Runtime cleanup verified: $CI_RUNTIME_PROJECT containers, networks and volume absent."

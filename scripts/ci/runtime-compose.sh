#!/usr/bin/env bash
# Sourced by the runtime and its independently scheduled cleanup step.
set -euo pipefail

[[ ${GITHUB_RUN_ID:-} =~ ^[0-9]+$ && ${GITHUB_RUN_ATTEMPT:-} =~ ^[0-9]+$ ]] || {
  echo 'Numeric run ID and attempt are required.' >&2
  exit 1
}
export CI_RUNTIME_PROJECT="ysp-ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
runtime_volume="${CI_RUNTIME_PROJECT}-mysql-data"
runtime_image="${CI_RUNTIME_PROJECT}-backend:ci"
compose=(docker compose --env-file /dev/null -p "$CI_RUNTIME_PROJECT" -f compose.yaml -f compose.ci.yaml)

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

assert_runtime_resources_absent() {
  local containers networks volumes
  # Assign separately: [[ -z $(docker ...) ]] would hide a failed Docker query.
  containers=$(docker ps -aq --filter "name=^/${CI_RUNTIME_PROJECT}-(backend|mysql)$")
  networks=$(docker network ls -q --filter "name=^${CI_RUNTIME_PROJECT}_")
  volumes=$(docker volume ls -q --filter "name=^${runtime_volume}$")
  [[ -z $containers && -z $networks && -z $volumes ]] || {
    echo 'Runtime containers, networks or volume still exist.' >&2
    return 1
  }
}

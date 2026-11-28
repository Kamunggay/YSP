#!/usr/bin/env bash
source scripts/ci/runtime-compose.sh

printf 'Runtime project=%s volume=%s image=%s containers=%s-backend,%s-mysql\n' \
  "$CI_RUNTIME_PROJECT" "$runtime_volume" "$runtime_image" "$CI_RUNTIME_PROJECT" "$CI_RUNTIME_PROJECT"

# Refuse reuse before allowing the cleanup step to delete anything.
assert_runtime_resources_absent
# The workflow builds and loads this attempt's image before runtime setup.
# Fail instead of silently building an uncached or differently tagged image.
docker image inspect "$runtime_image" --format 'Prepared image {{.Id}}'
echo 'CI_RUNTIME_OWNED=true' >> "${GITHUB_ENV:?GitHub environment file required}"

docker version --format 'Docker server {{.Server.Version}}'
docker compose version
sha256sum backend/composer.lock frontend/package-lock.json
"${compose[@]}" config --quiet
"${compose[@]}" up -d --no-build --wait --wait-timeout 180 backend mysql

# The image's vendor files belong to root. Install again in this disposable
# container, even when the build reused its dependency layer.
"${compose[@]}" exec -T --user root -e COMPOSER_ALLOW_SUPERUSER=1 backend \
  composer install --no-interaction --prefer-dist --no-progress
"${compose[@]}" exec -T backend php --version
"${compose[@]}" exec -T backend composer --version
"${compose[@]}" exec -T mysql mysql --version

schema_state() {
  "${compose[@]}" exec -T backend php <<'PHP'
<?php
$pdo = new PDO('mysql:host='.getenv('DB_HOST').';dbname='.getenv('DB_DATABASE'), getenv('DB_USERNAME'), getenv('DB_PASSWORD'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$tables = $pdo->query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME')->fetchAll(PDO::FETCH_COLUMN);
$migrations = in_array('migrations', $tables, true) ? $pdo->query('SELECT id, migration, batch FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) : [];
echo json_encode(['tables' => $tables, 'migrations' => $migrations], JSON_THROW_ON_ERROR);
PHP
}

initial_state=$(schema_state)
[[ $initial_state == '{"tables":[],"migrations":[]}' ]] || {
  echo 'Application database was not empty before migration.' >&2
  exit 1
}
echo 'Fresh application database has no tables.'
"${compose[@]}" exec -T backend php artisan migrate --force
first_state=$(schema_state)
FIRST_STATE="$first_state" python3 - <<'PY'
import json
import os
from pathlib import Path
import sys

state = json.loads(os.environ['FIRST_STATE'])
expected_migrations = sorted(p.stem for p in Path('backend/database/migrations').glob('*.php'))
tables = state.get('tables', [])
migrations = state.get('migrations', [])
recorded = [m['migration'] for m in migrations]

if 'migrations' not in tables:
    sys.exit('Initial migration did not create the migrations table.')
if recorded != expected_migrations or any(int(m['batch']) != 1 for m in migrations):
    sys.exit(f'Recorded migrations mismatch: expected {expected_migrations}, got {migrations}')
if expected_migrations and len(tables) <= 1:
    sys.exit('Initial migration recorded migrations but created no application tables.')
if not expected_migrations and tables != ['migrations']:
    sys.exit(f'Empty scaffold migration created unexpected tables: {tables}')
print(f'Initial migration applied {len(recorded)} migrations and created {len(tables)} tables.')
PY
"${compose[@]}" exec -T backend php artisan migrate --force
repeat_state=$(schema_state)
[[ $repeat_state == "$first_state" ]] || {
  echo 'Repeat migration changed the migration state.' >&2
  exit 1
}
echo 'Repeat migration preserved schema and migration state.'
"${compose[@]}" exec -T backend php artisan test --stop-on-failure --do-not-cache-result --filter=ConnectivityTest

# Run Stage 1A, Stage 1B, and Stage 3 suites against real MySQL 8.4 as unprivileged `ysp`.
# OpeningBaselineMysqlConcurrencyTest runs separately below with root MySQL privileges for InnoDB lock-wait inspection.
"${compose[@]}" exec -T backend php artisan test --stop-on-failure --do-not-cache-result \
  tests/Feature/Stage1A/BrowserSessionTest.php \
  tests/Feature/Stage1A/CombinedBackendMergeVerificationTest.php \
  tests/Feature/Stage1A/ControlledSetupTest.php \
  tests/Feature/Stage1A/HandoverInfrastructureTest.php \
  tests/Feature/Stage1A/InventoryStage1ATest.php \
  tests/Feature/Stage1A/OpeningAuthorizeAndMatchTest.php \
  tests/Feature/Stage1A/OpeningBaselinePostAndRecoveryTest.php \
  tests/Feature/Stage1A/OpeningDraftAndCountTest.php \
  tests/Feature/Stage1A/SalesOrderIntakeTest.php \
  tests/Feature/Stage1B \
  tests/Feature/Stage2 \
  tests/Feature/Stage3

# Run real InnoDB LOCK WAIT opening-baseline concurrency verification with root observer privileges.
"${compose[@]}" exec -T \
  -e DB_USERNAME=root \
  -e "DB_PASSWORD=${MYSQL_ROOT_PASSWORD}" \
  backend php artisan test --stop-on-failure --do-not-cache-result \
  tests/Feature/Stage1A/OpeningBaselineMysqlConcurrencyTest.php

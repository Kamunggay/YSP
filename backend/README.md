# Laravel/MySQL local health baseline

The backend supplies a modular Laravel layout, private intended MySQL, a migration runner and a read-only health endpoint. The React frontend uses the same browser origin. Business workflows and production deployment are developed separately.

## Prerequisites and pinned versions

Use Git, Docker Engine/Desktop in Linux-container mode with BuildKit and a verified Compose version (2.38.2 or 5.1.3), and PowerShell 5.1+ on Windows or PowerShell 7 (`pwsh`) on Linux/macOS. Allow at least 4 GB Docker memory and disk for the PHP/MySQL images. Docker must be running. XAMPP, host PHP/Composer, Node and an existing database are unnecessary.

Verified 24 October 2026: [Laravel 13 supports PHP 8.3–8.5 and receives security fixes through March 2028](https://laravel.com/docs/13.x/releases), [PHP 8.4 receives security support through December 2028](https://www.php.net/supported-versions.php), and [MySQL 8.4 is an LTS series](https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html). The Composer lock resolves Laravel 13.38.0 and all PHP packages; its platform is PHP 8.4.27. Dockerfile pins PHP 8.4.27 and Composer 2.10.3; Compose pins official MySQL 8.4 by immutable index digest. The indexes contain Linux amd64/arm64; only the recorded local architecture is tested. When upgrading, verify support, resolve new digests, regenerate the lock and rerun checks. Builds require registry/Packagist access; runtime uses a private network.

## Clean checkout setup

Run from repository root. On Linux/macOS replace `powershell -NoProfile -File` with `pwsh -File`.

```powershell
powershell -NoProfile -File scripts/init-local.ps1
docker compose --env-file backend/.env build backend frontend
docker compose --env-file backend/.env up -d --wait --wait-timeout 180
docker compose --env-file backend/.env run --rm --no-deps migrate
docker compose --env-file backend/.env exec -T backend php artisan baseline:verify
docker compose --env-file backend/.env exec -T backend php scripts/http-smoke.php
Invoke-RestMethod http://localhost:8080/api/v1/health
```

If 8080 is busy, set `$env:YSP_HTTP_PORT = '18080'` before Compose. Only the frontend gateway loopback port is published; `/api` is proxied to Laravel. Laravel joins a local bridge shared with the gateway and an internal network shared with MySQL. MySQL joins only that internal network and has no host port. `docker compose --env-file backend/.env down` retains the named database volume. Do not run `down --volumes` on a database you intend to keep. Standalone backend diagnostics may opt into `compose.backend.yaml`; `scripts/verify-backend.ps1` uses that override on its isolated project and starts only backend/MySQL.

`init-local.ps1` creates ignored `backend/.env` and `frontend/.env` from their committed `.env.example` files. Backend credentials are generated once; existing files are preserved. When migrating an older checkout, existing `.runtime` credentials are reused so its database remains accessible. Keep populated `.env` files private and uncommitted. Compose reads `backend/.env` via `--env-file` and provides only the required values as mounted secrets; Laravel never receives the root password. The frontend currently needs no variables; never put secrets in `VITE_*` values, which are public browser configuration. Secrets are excluded from the image build context. This is local development configuration; production credential deployment is a later package. The application account has privileges scoped to `ysp_local.*`, including migration DDL, and has no global/root grants. Production runtime/migration credential separation remains a deployment responsibility.

Existing MySQL volumes retain first-initialization passwords. Restore the original files if lost, or explicitly recreate a disposable local project/volume; regenerating files alone cannot rotate an existing database. Never use live data here.

## Configuration and HTTP contract

`backend/.env.example` is the complete nonsecret inventory loaded by Compose: local environment, localhost:8080 URL, UTC, MySQL at `mysql:3306`, database `ysp_local`, user `ysp_app`, mounted key/password paths, database session/job adapter selections, file cache and stderr logs. Debug is hard disabled. MySQL root's secret path exists only on its service. No root `.env`, operational data or approved business policy is required. Blank credential fields in the example are populated only in the ignored backend `.env`; the example itself is safe to commit. `YSP_HTTP_PORT` changes the host port; `APP_URL` is informational.

`GET /api/v1/health` is a read-only infrastructure endpoint without session/chapter/business authority. Success: HTTP 200, `{"status":"ok","database":"ok"}`. Failed configuration/connectivity: HTTP 503, `{"status":"unavailable","database":"unavailable"}`. Both use `Cache-Control: no-store, private`. Responses contain no credentials, version/schema/exception details or operational data. GET/HEAD is registered; no business mutation, operation result or session is created. This health contract is separate from business ActionResult and does not fabricate an operation ID. Health establishes configuration/connectivity; schema identity is checked separately.

The PHP built-in server is for local backend reproduction. Nginx serves the built frontend and proxies API requests. Production serving/TLS, worker/scheduler execution, backup/recovery, four-user capacity and host monitoring remain in their owning packages. Local container resource/restart/log limits are declared; no production readiness is claimed.

## Local and CI verification

```powershell
powershell -NoProfile -File scripts/verify-backend.ps1
```

The [combined verification entry point](../scripts/README.md), also used by `.github/workflows/backend.yml`, reuses this backend check and adds frontend/contract/browser checks. This backend command builds from the lock; runs strict Composer validation, PHP syntax, Pint, PHPStan level 6, locked dependency audit and config/secret checks; starts a unique disposable project with a fresh MySQL volume and random local HTTP port; migrates twice; verifies MySQL/InnoDB and the baseline checkpoint; runs backend tests once; checks real container/host HTTP; stops MySQL to prove safe 503 and restarts it to prove recovery; checks cached configuration; and removes only its own disposable project/volume. The normal development database is preserved.

The config check verifies private networking, immutable DB identity, ignored/untracked secret paths and that actual generated local secret values are absent from source. These bounded checks do not establish that every possible secret or vulnerability is detectable. The combined GitHub Actions job runs this check together with contracts and the frontend/browser checks. Use the PR check result for the exact submitted revision.

For TDD, target one file. PHPUnit 12 rejects `--bail`; its equivalent is:

```powershell
docker compose --env-file backend/.env exec -T backend php artisan test --stop-on-failure tests/Feature/HealthTest.php
```

Images contain source: rebuild/recreate after edits, or copy changed files into a disposable development container before targeted tests. Do not use a host vendor tree as reproduction evidence. Use `composer install`, never `composer update`, to reproduce the lock.

## Schema and adapter handoff

The only table is Laravel's InnoDB `migrations` repository, with checkpoint `0001_01_01_000000_health_baseline`. That migration intentionally has no domain DDL. No users, chapters, health domain table, sessions, jobs, results or outbox is introduced. `baseline:verify` checks this P01-only checkpoint; revise it when later owned migrations land.

Seven reserved boundaries under `app/Modules/` match TR-02. Health and baseline verification are infrastructure; no speculative business services or cross-module writable models exist.

The MySQL-backed session adapter is selected, but P02 owns `sessions`, browser auth/CSRF, attribution, revocation and MFA. The stateless health route never starts that driver. The MySQL job adapter is selected, but P03 and later packages own `jobs`, `job_batches`, `failed_jobs`, worker/scheduler wiring, operation results, audit and discoverable durable outbox/task replay. Do not start a worker or claim durable behavior now. MySQL 8.4/InnoDB is compatible with the framework adapters; adapter selection is not execution evidence. Dispatch-after-commit does not replace transactional durable intent.

Reserve later migration names/order in the existing schema registers: P02 identity/session, P03 registry/results/audit/follow-up, P04 evidence, P05/P06 inventory/receiving integrity. No later constraint, opening-stock or AC-04 execution is certified here.

# Reproduce the Stage 0 app on your machine

Follow these steps in order to reproduce the submitted React/Laravel/MySQL baseline. The current app is a health page with connected, pending and unavailable states. Business workflows and login belong to later stages.

The author can follow this procedure. Stage 0 P01 acceptance requires Glenn or Efren to independently reproduce the submitted revision and record the result. See the [Stage 0 specification](https://github.com/Kamunggay/YSP/issues/2), especially Implementation Decision 15 and P01 completion evidence.

## 1. Prepare your machine

Install Git, Docker Desktop/Engine with Compose and BuildKit, and PowerShell. On Windows, use PowerShell 5.1 or newer. On Linux/macOS, use PowerShell 7 (`pwsh`).

Start Docker and select Linux containers. Allow at least 4 GB of Docker memory, enough disk space for images, and internet access for dependency/image downloads. Compose 2.38.2 and 5.1.3 have been exercised by this project.

Open PowerShell and check the tools:

```powershell
git --version
docker version
docker compose version
$PSVersionTable.PSVersion
```

`docker version` must report a reachable server. You do not need host PHP, Composer, Node or an XAMPP database. Use a browser for the manual inspection in step 8.

The commands below use Windows PowerShell. On Linux/macOS, replace `powershell -NoProfile -File` with `pwsh -File` and choose suitable absolute paths.

## 2. Get the exact submitted commit

Ask the author for the full commit hash being reviewed, or copy it from the pull request's Commits tab. The author can obtain it by running this in their submitted checkout:

```powershell
git rev-parse HEAD
```

The commit must be available in the remote repository. A local, unpushed commit cannot be reproduced through the clone below. Record the full hash; use that same revision when checking CI results.

## 3. Clone into a new directory

Replace the commit placeholder and choose a new absolute directory that does not already exist. The sample Windows directory is outside the author's existing checkout and does not require XAMPP.

```powershell
$reviewRevision = 'FULL_COMMIT_HASH_BEING_REVIEWED'
$reviewDirectory = 'C:/ysp-review'

if (Test-Path -LiteralPath $reviewDirectory) {
    throw 'Choose a new review directory that does not already exist'
}

git clone --no-checkout https://github.com/Kamunggay/YSP.git $reviewDirectory
if ($LASTEXITCODE -ne 0) { throw 'Clone failed' }

Set-Location $reviewDirectory
git checkout --detach $reviewRevision
if ($LASTEXITCODE -ne 0) { throw 'Review revision unavailable' }
```

If Git requests authentication, use an account with repository access. A detached HEAD message is expected when reviewing an exact commit. Run all remaining commands from this fresh repository root, in the same PowerShell session.

## 4. Confirm the checkout is clean

```powershell
git rev-parse HEAD
git status --porcelain
Test-Path backend/.env
Test-Path frontend/.env
```

Expected results:

- The first command prints the submitted commit hash.
- `git status --porcelain` prints nothing.
- Both `Test-Path` commands return `False`.

Do not copy dependencies, generated builds, environment files, credentials or a database from the author's machine. Docker layer caches may be reused; record that reuse in your evidence.

## 5. Run verification and save the evidence

Choose a new evidence directory outside the checkout. This command captures output to a log, so the terminal may remain quiet while checks run. You can inspect the log from another window.

```powershell
$evidenceDirectory = 'C:/ysp-review-results'
New-Item -ItemType Directory -Path $evidenceDirectory -ErrorAction Stop

$capturePreference = $ErrorActionPreference
try {
    # Windows PowerShell may wrap ordinary Docker stderr as an error.
    # The verifier checks process exit codes for actual failures.
    $ErrorActionPreference = 'Continue'
    powershell -NoProfile -File scripts/verify.ps1 *> (Join-Path $evidenceDirectory 'verification.log')
    $verificationExit = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $capturePreference
}

"Verification exit: $verificationExit" | Set-Content (Join-Path $evidenceDirectory 'exit.txt')
if ($verificationExit -ne 0) { throw 'Verification failed; retain and inspect the log' }

git status --short
```

Expected result: exit `0`, all required checks complete, and no tracked changes. The verifier generates ignored local configuration, builds locked dependencies, checks contracts, runs backend/frontend/browser checks, and tests fresh intended MySQL databases. Its disposable verification projects are removed automatically. Run verification serially because the scripts share local image tags.

In the log, confirm:

- Initial migrations succeed and a repeated migration makes no further changes.
- The checkpoint is `0001_01_01_000000_health_baseline` on intended MySQL 8.4/InnoDB.
- The built frontend reaches the API/database through the same browser origin.
- MySQL, backend and missing-application-key outage checks show safe unavailability followed by recovery.

If a check fails, retain the log and fix or report the first failing command before claiming a pass. See the [build and CI guide](scripts/README.md) for check descriptions and troubleshooting. Preserve failed attempts as well as successful reruns.

## 6. Initialize local configuration for manual startup

The verifier normally creates these files already. Running initialization again preserves existing configuration:

```powershell
powershell -NoProfile -File scripts/init-local.ps1
if ($LASTEXITCODE -ne 0) { throw 'Local initialization failed' }
```

Expected result: ignored `backend/.env` and `frontend/.env` files exist. Backend credentials are generated locally; the frontend currently needs no variables. Keep populated environment files private and uncommitted.

## 7. Build and start the app

The default browser port is `8080`. If it is occupied, run this before the Compose commands and use port `18084` in step 8:

```powershell
$env:YSP_HTTP_PORT = '18084'
```

Build, start, migrate and verify the baseline:

```powershell
docker compose --env-file backend/.env build backend frontend
if ($LASTEXITCODE -ne 0) { throw 'Application build failed' }

docker compose --env-file backend/.env up -d --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Application startup failed' }

docker compose --env-file backend/.env exec -T backend php artisan migrate --force
if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }

docker compose --env-file backend/.env exec -T backend php artisan baseline:verify
if ($LASTEXITCODE -ne 0) { throw 'Baseline verification failed' }
```

Expected result: all commands succeed, services become healthy and the baseline checkpoint is verified. The current database contains the migration repository, without business tables. See the [backend setup guide](backend/README.md) for configuration and schema details.

## 8. Inspect the app in your browser

Open `http://localhost:8080` and confirm the health page reaches its connected state. If you selected another port, replace `8080` with that port.

Open `http://localhost:8080/api/v1/health`. Expected HTTP status is `200`, with:

```json
{"status":"ok","database":"ok"}
```

You can also check it in PowerShell:

```powershell
$appPort = if ($env:YSP_HTTP_PORT) { $env:YSP_HTTP_PORT } else { '8080' }
Invoke-RestMethod "http://localhost:$appPort/api/v1/health"
```

No login or chapter data is required. During configuration/database failure, the endpoint returns HTTP `503` with `{"status":"unavailable","database":"unavailable"}`. The automated verification in step 5 exercises outage and recovery behavior. See the [frontend guide](frontend/README.md) for focused browser checks.

## 9. Record the reproduction result

Save a review note alongside `verification.log` and `exit.txt` in your evidence directory. Include:

| Item | What to record |
| --- | --- |
| Reviewer | Actual name, date, and whether you authored the implementation |
| Revision | Full commit hash and initial clean-checkout result |
| Machine | OS/architecture, Docker/Compose/PowerShell versions, allocated resources and cache reuse |
| Procedure | Commands, port overrides, deviations, failures and reruns |
| Verification | Exit code, completed checks and retained log locations |
| Build identity | Lock/schema/frontend hashes and image/runtime identities printed in the verification log |
| Manual inspection | Browser URL, connected page result and API response |
| CI | Actual result and run link for the same reviewed revision |
| Decision | Accepted, rejected or pending, with findings and subsequent review/merge reference when available |

Review logs before sharing them. Exclude populated environment files, environment dumps and credential values. A successful author run is author evidence; independent Glenn/Efren reproduction, contract-maintainer validation and reviewed merge remain separate acceptance requirements.

For the detailed evidence procedure, see [independent clean-checkout verification](scripts/P01-REPRODUCTION.md).

## 10. Stop the app when finished

From the review checkout root:

```powershell
docker compose --env-file backend/.env down
```

This stops/removes the local app containers and network while retaining its database volume. Do not add `--volumes` if you intend to keep the data. Existing database volumes retain their original passwords; regenerating configuration does not rotate them. See the [backend guide](backend/README.md) if you lose the matching configuration.

This reproduction establishes the Stage 0 health baseline for the tested revision. Business transactions, full MVP acceptance, production deployment and live activation retain their own gates.

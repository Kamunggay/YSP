# Independent clean-checkout verification

Use this procedure to verify that another developer can build and run the baseline without the author's local files. Passing CI and an author run do not replace this independent check.

## Start from the submitted revision

Install Git, Docker with Linux containers/Compose/BuildKit, PowerShell and Node 24 (including npm). Allow package/image downloads, at least 4 GB of Docker memory and adequate image disk space. Compose 2.38.2 and 5.1.3 have been exercised. Host PHP, Composer and a browser installation are unnecessary.

In PowerShell, choose a new absolute directory and replace the commit placeholder with the full revision being reviewed:

```powershell
$reviewRevision = 'FULL_COMMIT_HASH_BEING_REVIEWED'
$reviewDirectory = 'C:/path/to/new/ysp-review'
git clone --no-checkout https://github.com/Kamunggay/YSP.git $reviewDirectory
if ($LASTEXITCODE -ne 0) { throw 'Clone failed' }
Set-Location $reviewDirectory
git checkout --detach $reviewRevision
if ($LASTEXITCODE -ne 0) { throw 'Review revision unavailable' }
git rev-parse HEAD
if ((git status --porcelain)) { throw 'Expected a clean checkout' }
if ((Test-Path backend/.env) -or (Test-Path frontend/.env)) {
    throw 'Expected no preexisting local configuration'
}
```

Do not copy dependencies, generated builds, credentials or a database from the author's checkout. Docker layer caches may be reused; record that this is not a cold-cache build.

## Run verification and retain the result

Run the following from the fresh repository root. Choose an evidence directory outside the checkout. On Linux/macOS replace `powershell -NoProfile -File` with `pwsh -File`.

```powershell
$evidenceDirectory = 'C:/path/to/new/ysp-review-results'
New-Item -ItemType Directory -Path $evidenceDirectory -ErrorAction Stop
$capturePreference = $ErrorActionPreference
try {
    # Windows PowerShell can wrap Docker progress on stderr as an error.
    # The child verifier checks native exit codes and stops on real failures.
    $ErrorActionPreference = 'Continue'
    powershell -NoProfile -File scripts/verify.ps1 *> (Join-Path $evidenceDirectory 'verification.log')
    $verificationExit = $LASTEXITCODE
} finally { $ErrorActionPreference = $capturePreference }
"Verification exit: $verificationExit" | Set-Content (Join-Path $evidenceDirectory 'exit.txt')
if ($verificationExit -ne 0) { throw 'Verification failed; retain the log' }
git status --short
```

The command initializes separate backend/frontend environment files, builds the application and verifier, checks contracts and dependencies, and runs backend/session/enrollment/browser tests against fresh disposable MySQL projects. Expected success is exit 0 with `Full verification passed` and disposable resources removed. See [stage usage](README.md#what-runs-in-order) for targeted debugging; selected stages report partial verification and do not replace a complete reproduction.

Confirm initial migrations and the second no-op migration passed. The checkpoint verifier must report intended MySQL 8.4/InnoDB and `0001_01_01_000000_health_baseline`. The baseline has only the migration repository, not business tables.

The browser must reach the real API/database through the built frontend origin. Stopped MySQL, stopped backend and missing application-key configuration must each produce safe unavailability and then recover. The health endpoint returns HTTP 200 with `{"status":"ok","database":"ok"}` or HTTP 503 with `{"status":"unavailable","database":"unavailable"}`.

## Record the review

| Record | Required information |
| --- | --- |
| Reviewer | Actual name, date and whether the reviewer authored the implementation |
| Source | Full Git revision, initial clean status and any changes made during the run |
| Environment | OS/architecture, Docker/Compose/PowerShell versions, resources and cache reuse |
| Inputs | Generated local configuration, any shell/Compose overrides and deviations from the procedure; never credential values |
| Results | Exact commands, process exit, completed checks, failures and reruns |
| Build identity | Lock/schema/frontend hashes and image/runtime identities printed in the log |
| CI | Actual result and run identity for the same reviewed revision |
| Findings | Unresolved errors, compatibility concerns and requested corrections |
| Acceptance | Actual reviewer decision and subsequent review/merge reference when available |

Retain failures as well as reruns. An absent response is not approval. A successful run by the author is author evidence, not independent reproduction. Preserve corresponding local images if exact built artifacts are needed; browser OS packages are resolved at build time.

## Local data and cleanup

`backend/.env` contains the generated application/database credentials. `frontend/.env` currently needs no variables. Both remain private and uncommitted. Compose mounts only the needed secrets into each service; the backend does not receive the actual root database credential. Ignored `.runtime/` files hold enrollment ownership, retained lock files and failure diagnostics; preserve ownership records for explicit cleanup after interruptions.

The scripts create uniquely named verification projects and remove only their own containers, networks and volumes. They preserve ordinary development data. If interrupted, identify the exact project name in the log before cleaning it up. Review logs before sharing; do not include populated environment files, environment dumps or resolved secret values.

A successful reproduction establishes this runnable baseline. Actual contract-maintainer validation and reviewed merge remain separate requirements. It does not certify business transactions, live activation, production/recovery readiness, full accessibility or complete MVP acceptance.

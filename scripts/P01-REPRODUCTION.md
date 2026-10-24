# P01 clean-checkout reproduction handoff

Local ticket `stage-0-leader/07`; [parent spec #2](https://github.com/Kamunggay/YSP/issues/2).
Requirements: TR-01–TR-05, TR-19–TR-20, TR-29; UX-01–UX-04; Q6.
This procedure prepares Glenn or Efren's independent reproduction. Leader's
authored run is local evidence only. P01 acceptance remains **pending** until
actual nonauthor reproduction, applicable green CI and reviewed merge exist.

## Obtain the exact committed input

Use a new destination directory outside an existing checkout. Until publication
is authorized, clone the author's local repository or an explicitly supplied
Git bundle; a remote branch is not assumed available. The author supplies the
full handoff commit hash separately with the results. Do not use remote master
as a substitute. No push, PR, review message or workflow dispatch is required.

In PowerShell, replace the three example values below with the supplied source,
full commit hash and a new absolute destination. The source may be a repository
path or bundle path. Git must already be installed.

```powershell
$sourceRepository = 'C:/path/to/supplied/repository-or.bundle'
$handoffCommit = 'FULL_COMMIT_HASH_FROM_HANDOFF'
$reproductionRoot = 'C:/path/to/new/p01-review'
git clone --no-hardlinks --no-checkout $sourceRepository $reproductionRoot
if ($LASTEXITCODE -ne 0) { throw 'Clone failed' }
Set-Location $reproductionRoot
git checkout --detach $handoffCommit
if ($LASTEXITCODE -ne 0) { throw 'Handoff revision unavailable' }
git rev-parse HEAD
git status --short
if ((git status --porcelain)) { throw 'Expected a clean checkout' }
if (Test-Path .runtime) { throw 'Expected no preexisting local configuration' }
```

The clone must have no host dependencies, generated frontend, credentials or
database copied into it. Existing Docker image/layer caches may be reused;
this is a clean source/configuration/database run, not proof of a cold-cache
build or byte-identical OS package resolution. Record cache reuse honestly.

## Run and retain actual results

Prerequisites and the complete check sequence are in [verification](README.md).
Use Docker with Linux containers, Compose/BuildKit, download access, at least
4 GB Docker memory and adequate image disk space. Windows uses PowerShell 5.1+;
Linux/macOS uses PowerShell 7 and `pwsh -File` in place of `powershell` below.
No host Node, PHP, Composer, browser, XAMPP or existing database is an input.
Run serially because verification shares local Docker image tags.

Create an evidence directory outside the checkout. Record reviewer name/role,
date/time, OS/architecture, Docker resources, source/hash, initial clean status,
commands, process exit codes and any deviations. Never copy `.runtime` or dump
environment/Compose secret values. Capture the combined console output:

```powershell
$evidenceDirectory = 'C:/path/to/new/p01-review-evidence'
New-Item -ItemType Directory -Path $evidenceDirectory -ErrorAction Stop
$capturePreference = $ErrorActionPreference
try {
    # Windows PowerShell wraps native stderr (including Docker progress) as errors.
    # The child verifier sets Stop internally and checks each real command exit.
    $ErrorActionPreference = 'Continue'
    powershell -NoProfile -File scripts/verify.ps1 *> (Join-Path $evidenceDirectory 'verification.log')
    $verificationExit = $LASTEXITCODE
} finally { $ErrorActionPreference = $capturePreference }
"Verification exit: $verificationExit" | Set-Content (Join-Path $evidenceDirectory 'exit.txt')
if ($verificationExit -ne 0) { throw 'Reproduction failed; retain the log and report the failure' }
git status --short
```

Expected: exit 0, both application builds and static/type/lint checks pass,
contract and client checks pass, and two distinct disposable Compose projects
start intended MySQL with fresh volumes. Migrations run twice, and
`baseline:verify` reports MySQL 8.4/InnoDB, PHP/Laravel versions and checkpoint
`0001_01_01_000000_health_baseline`. Only the migration repository exists;
there are no business tables. Backend tests run once in the combined command.
The browser checks the built React/Nginx origin through Laravel to MySQL.
Stopped MySQL, stopped backend and missing application key must yield safe
unavailability and recover. Success JSON is
`{"status":"ok","database":"ok"}`; failure is HTTP 503 with
`{"status":"unavailable","database":"unavailable"}`. Tests reject leaked
internal details. Inspect the log rather than treating an exit code alone as
evidence of every expected check.

Retain the complete paths and SHA-256 values printed for dependency locks,
health/transport schemas/examples and built frontend files, Git revision,
image IDs, Node, Nginx, Docker/Compose and schema/runtime identity. Preserve the
corresponding local images if the reviewer needs the exact built artifacts:
Debian browser OS packages are resolved at build time. Record all failures and
reruns, without replacing an earlier failure with an invented passing result.
PowerShell 5.1 may annotate Docker progress on stderr as NativeCommandError;
use the actual process exit and checker results to distinguish a failure.

## Configuration inventory and cleanup

| Input | Source / handling |
| --- | --- |
| Application/runtime/dependencies | Committed Dockerfiles, Compose digests, Composer and both npm locks |
| Backend nonsecret configuration | `backend/.env.example`, loaded by Compose; no host `.env` required |
| Database | Intended private MySQL, `ysp_local`, application user `ysp_app`; fresh disposable volumes, no fixtures/live data |
| Local secrets | `init-local.ps1` generates `.runtime/app_key`, `db_password`, `db_root_password`; independent local values, never evidence artifacts |
| Frontend | Relative `/api`; no frontend environment/secrets or API URL input |
| Port | Verification selects ephemeral loopback ports and restores `YSP_HTTP_PORT` |
| Browser | Locked verifier container; scripts manage/restore `YSP_BROWSER_URL` and `YSP_EXPECT_HEALTH` |
| Extra configuration | Report any shell-level Compose/Docker overrides; use a fresh shell without unrelated overrides |

Each verification script removes only its own uniquely named project/network/
volume in `finally`. Verify the logged cleanup succeeded. Do not remove normal
development volumes. On interruption, identify the exact project name from the
log and inspect its containers/volumes before cleaning that project only.
Ignored `.runtime` stays private in the reproduction checkout. Review logs
before sharing; do not package credentials or an entire runtime directory.
For optional interactive startup after verification, follow
[frontend setup](../frontend/README.md); the automated projects have exited.

## Review record and package gates

Supply this record with the actual log, rather than marking blanks as passes:

| Field | Value to supply |
| --- | --- |
| Author run | Leader; exact revision, date, commands, log, exit and identities |
| Independent run | Pending: Glenn or Efren, actual identity/date/revision/log/outcomes/deviations |
| Applicable CI | Pending: actual run URL, revision, job results; configuration alone is insufficient |
| Reviewed merge | Pending: review/PR/merge references and accepted revision |
| P01 acceptance | Pending until the required evidence above is reviewed |

Review `.github/workflows/backend.yml`: the read-only `backend` job runs the
same `scripts/verify.ps1` on pull requests and master pushes, including fresh
migrations. Local results are not remote CI. This handoff does not authorize
publication or sending a review request. A later authorized reviewer records
their own run and unresolved findings; the author cannot sign as nonauthor.

No Stage 1 identity, chapter authorization, durable operation/result, evidence
readiness or stock effect is implemented by this skeleton. Contract examples
are not executed business behavior. No AC-04, live activation, production,
recovery or full accessibility acceptance is claimed. The complete P00–P29
roadmap, all AC/MIG/source requirements and candidate statuses remain intact.

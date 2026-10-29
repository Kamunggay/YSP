# Build and CI verification

The same command runs the application's verification locally and in GitHub Actions. It checks the current React/Laravel/MySQL baseline. It does not deploy the app.

## Run the checks

Run from the repository root with Docker running in Linux-container mode:

```powershell
# Windows PowerShell 5.1 or newer
powershell -NoProfile -File scripts/verify.ps1

# Linux/macOS with PowerShell 7
pwsh -File scripts/verify.ps1

# Rerun one stage, or that stage and the remaining stages.
powershell -NoProfile -File scripts/verify.ps1 -Stage enrollment
powershell -NoProfile -File scripts/verify.ps1 -From sessions
```

Install Git, Docker with Compose/BuildKit, and PowerShell. Full verification also requires Node 24 (including npm) for the existing enrollment and script regression checks; their locked transport dependencies are installed automatically once per invocation. Other stages require no host Node. No host PHP, Composer or browser installation is required. Allow dependency/image downloads, at least 4 GB of Docker memory and enough disk space for images. Compose 2.38.2 and 5.1.3 have been exercised; other versions have not been verified.

The session verifier builds a pinned Node/Docker CLI test image and uses the Docker socket to target disposable containers. Schema migrations run through the short-lived `migrate` service; its elevated database secret is never mounted into the HTTP backend. Ordinary runtime credentials have DML privileges only, with database guards protecting identity history.

Setup creates missing `backend/.env` and `frontend/.env` files from their committed examples. Existing files are preserved. Use generated local credentials and disposable data. The frontend currently requires no variables. Never commit populated environment files or put credentials in browser configuration.

## What runs, in order

| Stage name (execution order) | Checks | Prerequisites prepared on selection |
| --- | --- | --- |
| `preflight` | Revision/tool versions and lock/schema hashes; environment initialization; Compose structure, private MySQL networking, loopback gateway, ignored secrets and secret scan | None |
| `toolchain` | Locked verification image, Chromium and image/Node identities | Preflight |
| `script-tests` | Script execution, focused-test runner, native-output and enrollment lifecycle regressions | Preflight, host Node 24 and locked transport install |
| `contracts` | OpenAPI, schemas/examples, typed health-client compatibility and frozen coverage/reconciliation | Preflight, current verification image |
| `client` | Frontend client tests and both npm lockfile audits | Preflight, current verification image |
| `backend` | Existing backend build/static/audit checks, fresh MySQL, repeat migrations, HTTP/outage/cache checks and backend tests | Preflight; child builds and owns a fresh environment |
| `sessions` | Existing gateway/CLI/session/security and outage checks | Preflight; child builds its test image and fresh environment |
| `enrollment` | Existing complete enrollment/MFA/provisioning/chapter/membership HTTP/MySQL suite and PHPUnit | Preflight, host Node 24 and locked transport install; child builds and owns a fresh environment |
| `same-origin` | Frontend lint/TypeScript/build, browser behavior, keyboard/mobile/axe and actual outage/configuration recovery; runtime/image/frontend hashes | Preflight, current verification image; child builds and owns a fresh environment |

No arguments runs every stage in this order. `-Stage <name>` runs one stage; `-From <name>` runs the ordered suffix. Names are case-insensitive. Invalid names, empty names and combining the options fail before setup. Either option always reports partial verification, even when selecting `-From preflight`.

Prerequisites run once within an invocation, before their consumer. Selecting `same-origin`, for example, runs preflight and rebuilds the verification image from current inputs, without rerunning contracts, audits or earlier integration suites. Docker layer caching can reuse unchanged inputs; image-tag existence alone is never treated as proof of freshness. Runtime stages keep their own fresh environment rather than depending on a previous stage's disposable database. There are no saved resume checkpoints.

Every required command must succeed. A failure stops subsequent checks, preserves the failed executable's nonzero status (PowerShell exceptions exit 1), and prints the failed stage plus an exact targeted rerun command. Prerequisite failures name the prerequisite stage. After fixing it, rerun the original selection to finish its consumers. An outage probe intentionally expects HTTP 503 before checking recovery to HTTP 200.

The commands use shared local image tags, so run them serially. Runtime verification creates uniquely named Compose projects, fresh database volumes and temporary loopback ports. Each child retains its own ownership, diagnostics and `finally` cleanup; enrollment also retains its exclusive project lock. The ordinary development database is preserved. For repeated focused enrollment debugging, invoke `verify-enrollment.ps1` directly with `-Action Start`, then `-Action Test -TestNamePattern '<pattern>'`, then `-Action Stop`, using the same `-Project ysp-enrollment-check-<task>` each time. This retains the owned environment between tests instead of rebuilding through the orchestrator.

## What GitHub Actions runs

Workflow: `Combined application and contract checks`, defined in `.github/workflows/backend.yml`.

- Events: pull requests and pushes to `master`.
- Runner: `ubuntu-24.04`.
- Job: `backend`. Despite that historical name, it runs frontend, backend, contracts, database and browser verification together.
- Timeout: 30 minutes.
- Steps: checkout the submitted revision, prepare Node 24 for enrollment/script checks, then run `./scripts/verify.ps1` with PowerShell.
- Repository permissions: read-only; checkout does not retain Git credentials.
- No deployment, registry publication or production credentials are configured.

A PR currently displays one combined verification step. Its log contains the individual command results. A green job means the complete command passed on that submitted revision. Required branch-protection settings must be configured separately; this workflow does not establish them.

The corrected workflow passed on revision `225ae8b862bc19dcd7d09ec9f189dff3e760a322`, run `40102217962`. For a later revision, use that revision's actual PR checks rather than treating an older green run as current evidence.

## Reproducibility boundaries

| Input | How it is controlled |
| --- | --- |
| Application and verification container bases | Immutable image-index digests in Dockerfiles and Compose |
| PHP and JavaScript dependencies | Composer lock and both npm locks; installs use those locks |
| Browser | Locked Playwright package selects its Chromium revision |
| Browser operating-system packages | Downloaded from Debian repositories during image build; not a byte-identical package snapshot |
| GitHub checkout and Node setup actions | Pinned commits |
| Hosted runner, Docker, Compose and PowerShell | Supplied by the runner; their exact versions are not pinned by this workflow |

The log records the Git revision, Docker/Compose versions, dependency hashes, image identities, built frontend hashes and database/runtime checkpoint. Preserve those values when reporting a failure. A dependency or runner update requires fresh verification.

## Find and fix a failure

Open the failed job's log and read the first command error above `Verification failed at stage`. Use the printed `Targeted rerun` command after fixing it, or `-From <stage>` to continue the remaining checks. A successful targeted run reports only a partial pass; rerun without arguments for full verification evidence. Earlier Docker/tool output usually identifies the cause.

| Symptom | What to check |
| --- | --- |
| `unknown flag: --wait` after `start` | Older Compose rejects `start --wait`. Recovery uses `up -d --no-deps --no-recreate --wait --wait-timeout 180`; keep the health wait when changing these commands. |
| Image or dependency download fails | Registry/package access and the first download error. A network failure is not a passing build. |
| MySQL fails its health deadline | Disposable project's health state, Docker resources and credential configuration. Do not remove a normal database volume as a workaround. |
| Existing database rejects credentials | Restore the matching environment configuration. Regenerating a password file does not rotate credentials inside an existing database. |
| Browser receives unavailable after recovery | Identify whether MySQL, backend or the application-key probe failed; confirm the expected 503/200 sequence in the log. |
| PowerShell labels Docker progress `NativeCommandError` | Inspect the verifier's real process exit and command results. Windows PowerShell may wrap ordinary native stderr; the reproduction procedure scopes its log-capture error preference accordingly. |
| Cleanup fails or execution is interrupted | Identify the exact disposable project from the log, inspect it and remove only that project. |

Do not paste environment dumps, resolved Compose configuration or populated `.env` files into an issue or PR. Container browser traces disappear when the runner exits; host-browser mode retains traces in ignored `frontend/test-results/`. This workflow does not upload artifacts automatically.

## What a pass establishes

A pass establishes the build, contract, connectivity and failure behaviors listed above for the tested revision. Contract fixtures remain expected examples; frozen coverage checks do not establish freshness against unpublished working documents.

Independent reviewer reproduction, maintainer compatibility approval and reviewed merge remain separate requirements. The health skeleton does not implement business identity/evidence/stock operations or establish production, live activation, recovery, full accessibility or complete MVP acceptance.

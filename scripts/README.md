# Build and CI verification

The same command runs the application's verification locally and in GitHub Actions. It checks the current React/Laravel/MySQL baseline. It does not deploy the app.

## Run the checks

Run from the repository root with Docker running in Linux-container mode:

```powershell
# Windows PowerShell 5.1 or newer
powershell -NoProfile -File scripts/verify.ps1

# Linux/macOS with PowerShell 7
pwsh -File scripts/verify.ps1
```

Install Git, Docker with Compose/BuildKit, and PowerShell. No host PHP, Composer, Node or browser installation is required. Allow dependency/image downloads, at least 4 GB of Docker memory and enough disk space for images. Compose 2.38.2 and 5.1.3 have been exercised; other versions have not been verified.

The session verifier builds a pinned Node/Docker CLI test image and uses the Docker socket to target disposable containers. Schema migrations run through the short-lived `migrate` service; its elevated database secret is never mounted into the HTTP backend. Ordinary runtime credentials have DML privileges only, with database guards protecting identity history.

Setup creates missing `backend/.env` and `frontend/.env` files from their committed examples. Existing files are preserved. Use generated local credentials and disposable data. The frontend currently requires no variables. Never commit populated environment files or put credentials in browser configuration.

## What runs, in order

| Phase | Checks | Failure means |
| --- | --- | --- |
| Configuration | Compose structure, private MySQL networking, loopback gateway, ignored secret paths and generated-secret scan | Local configuration or repository contents violate the current checks |
| Verification image | Locked Node dependencies and container Chromium | Tooling installation or image build failed |
| Contracts | OpenAPI, JSON schemas/examples, actual typed health-client compatibility and frozen coverage/reconciliation consistency | A checked contract or its consumer is incompatible |
| Client tests and audits | Frontend client tests and both npm lockfile audits | Client behavior failed or the dependency audit returned a failure |
| Backend | Locked build, Composer validation, PHP syntax, Pint, PHPStan and Composer audit | Backend source/build/static/dependency verification failed |
| Fresh database | Intended MySQL startup, initial migration, repeated no-op migration, InnoDB/checkpoint identity, host/container HTTP, safe outage/recovery and cached configuration | The baseline cannot start or recover correctly against a fresh MySQL database |
| Backend tests | The current backend test suite | A tested backend behavior failed |
| Frontend and browser | Lint, strict TypeScript, Vite build, same-origin browser checks, pending/timeout/retry/error behavior, keyboard/mobile/axe and actual MySQL/backend/missing-key outage recovery | Build, client integration or a checked browser behavior failed |
| Identity and cleanup | Lock/schema/frontend hashes, image/runtime identities and removal of disposable projects | The run could not record an identity or finish its cleanup |

Every required command must succeed. A failure exits nonzero and stops subsequent checks; a partial run is not a complete pass. An outage probe intentionally expects HTTP 503 before checking recovery to HTTP 200.

The commands use shared local image tags, so run them serially. Runtime verification creates two uniquely named Compose projects, fresh database volumes and temporary loopback ports. Each script removes its own project and volumes in `finally`. The ordinary development database is preserved.

## What GitHub Actions runs

Workflow: `Combined application and contract checks`, defined in `.github/workflows/backend.yml`.

- Events: pull requests and pushes to `master`.
- Runner: `ubuntu-24.04`.
- Job: `backend`. Despite that historical name, it runs frontend, backend, contracts, database and browser verification together.
- Timeout: 30 minutes.
- Steps: checkout the submitted revision, then run `./scripts/verify.ps1` with PowerShell.
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
| GitHub checkout action | Pinned commit |
| Hosted runner, Docker, Compose and PowerShell | Supplied by the runner; their exact versions are not pinned by this workflow |

The log records the Git revision, Docker/Compose versions, dependency hashes, image identities, built frontend hashes and database/runtime checkpoint. Preserve those values when reporting a failure. A dependency or runner update requires fresh verification.

## Find and fix a failure

Open the failed job's log and read the first command error above the final PowerShell exception. The exception identifies which command failed; earlier Docker/tool output usually identifies why.

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
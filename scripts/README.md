# Combined local verification

For ticket 07's exact-revision clean clone, evidence inventory and independent
review record, follow [P01 reproduction handoff](P01-REPRODUCTION.md).

Stage 0 ticket `stage-0-leader/09`, [parent spec #2](https://github.com/Kamunggay/YSP/issues/2).
Requirements: TR-01–TR-05, TR-19–TR-20; UX-01–UX-04. This command checks the
implemented P01 health baseline. Stage 1 domain execution and P01 acceptance
remain separate gates.

From a clean checkout, use Git, Docker Engine/Desktop with Linux containers,
Compose v2/BuildKit and PowerShell 5.1+ (PowerShell 7 on Linux/macOS).
Allow registry/npm/Debian/Playwright download access, at least 4 GB Docker memory
and disk for the images. No host Node, PHP, Composer or browser install is needed.
Use local generated credentials and disposable data only.

```powershell
# Windows; from the repository root
powershell -NoProfile -File scripts/verify.ps1
# Linux/macOS
pwsh -File scripts/verify.ps1
```

Any failed required command throws and the process exits nonzero. Run serially:
the verification commands share local image tags. They preserve existing local
credentials and the ordinary development database. Each runtime check creates a
unique Compose project, ephemeral loopback port and fresh MySQL volume, removing
only its own project/volume in `finally`. Existing invalid secret files cause an
early failure; restore the correct values rather than rotating passwords against
an existing database volume.

The entry point runs:

- strict JSON Schema/example, formal OpenAPI and contract consistency tests using
  the locked transport harness, plus actual typed health-client compatibility;
- locked frontend client tests and both npm locked dependency audits;
- ticket 04's existing backend build, Composer validation, syntax, Pint, PHPStan,
  audit, private-network/secret checks, fresh migrations twice, MySQL/InnoDB and
  checkpoint verification, HTTP success/outage/recovery, cached configuration and
  backend tests;
- ticket 05's frontend lint, strict TypeScript and Vite build, then real browser
  origin/API/MySQL checks, pending/retry/timeout/malformed-response behavior,
  keyboard/mobile/axe checks and actual MySQL/backend/missing-key failures with
  recovery.

The verification image pins the same Node **24.22.1** image digest as the frontend.
Both npm lockfiles select tooling; the frontend lock selects Playwright and its
Chromium revision. Browser OS dependencies come from Debian repositories at build
time, so the verifier's image ID is retained; byte-identical verifier rebuilds
are not claimed. Application image pins and PHP/Laravel/MySQL versions are in
[backend setup](../backend/README.md) and [frontend setup](../frontend/README.md).
The verifier build context includes only frontend/contracts and excludes secrets,
host dependencies and generated artifacts. It is never a deployed image.

Output records Git revision, locks, Docker/Compose, images, Node, built frontend
hashes and the backend schema/runtime identity. Save the console output outside
source control for ticket 07, along with OS/architecture and whether the checkout
was clean. Container browser traces disappear on exit; the existing host-browser
mode of `verify-same-origin.ps1` retains traces in ignored frontend/test-results.
Do not upload populated `.env` files, credentials or live data as CI artifacts. Setup creates separate ignored `backend/.env` and `frontend/.env` from safe committed examples; no `.runtime` directory is required.

Contracts under transport/identity/receiving/stock holds remain review candidates.
Their tests validate examples and frozen coverage evidence, not current governing
document freshness or runtime business APIs. To check coverage against separately
supplied governing documents, use the explicit source-root command documented in
`contracts/full-mvp-coverage/v1/README.md`. No fake auth, mutation or stock endpoint
is introduced. Health's formal schema at `contracts/health/v1/` describes the
already implemented public infrastructure response, separately from ActionResult.

`.github/workflows/backend.yml` preserves the existing `backend` job and invokes
this same combined entry point on unprivileged pull-request/push validation. It
uses a pinned checkout action, read-only repository permissions and no deployment
credentials. The fresh-volume migration checks run within that job. Remote CI
status is pending until an authorized push and actual run are observed. Local
checks do not prove required branch-protection settings, nonauthor reproduction,
Glenn/Efren acceptance, reviewed merge, full accessibility or P01 completion.

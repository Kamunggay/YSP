# Local React/API connection

Stage 0 `stage-0-leader/05`, [parent spec #2](https://github.com/Kamunggay/YSP/issues/2); TR-01–TR-03/TR-19–TR-20 and UX-01–UX-04. On 24 October 2026 Leader authorized initialization because Glenn had no frontend to supply. The ticket 05 Git commit identifies this authored shell/client. Glenn retains subsequent frontend/query feature ownership; this is not a supplied or reviewed Glenn revision.

## Clean checkout startup

Use Git, Docker Engine/Desktop in Linux-container mode with Compose v2/BuildKit and PowerShell 5.1+ (`pwsh` on Linux/macOS). No host Node, PHP, Composer, XAMPP database, live data or production credentials are needed to build/serve the app. From repository root:

```powershell
powershell -NoProfile -File scripts/init-local.ps1
docker compose --env-file backend/.env build backend frontend
docker compose --env-file backend/.env up -d --wait --wait-timeout 180
docker compose --env-file backend/.env exec -T backend php artisan migrate --force
docker compose --env-file backend/.env exec -T backend php artisan baseline:verify
```

Open `http://localhost:8080`. If occupied, set `$env:YSP_HTTP_PORT = '18084'` before Compose and use that port. Nginx serves built React and proxies relative `/api` requests to Laravel. Unknown API paths never fall back to HTML. Only the proxy publishes a loopback port; backend/MySQL have none. MySQL joins only the internal network. `docker compose --env-file backend/.env down` retains the database volume; never remove volumes containing data you intend to keep.

The frontend receives no backend environment or secrets. It has no `VITE_*` values, API URL configuration, external fonts, analytics or live datasets. Build context excludes dotenv, host dependencies and generated output. Static serving is unprivileged with a read-only filesystem and bounded temporary storage. Local HTTP is development only; TLS/deployment remain later work. See [backend setup](../backend/README.md) for credential initialization and database-volume recovery rules.

## Locked builds and host development

Docker pins Node **24.22.1** LTS and Nginx **1.30.6** by immutable image-index digests. The npm lock pins React **19.3.1**, Vite **8.3.5**, TypeScript **6.0.3** and transitive dependencies. TypeScript stays within typescript-eslint's declared `<6.1` support. Support references checked at initialization: [Node release schedule](https://github.com/nodejs/Release), [Vite requirements](https://vite.dev/guide/), [React versions](https://react.dev/versions). Only the recorded local architecture is tested. Recheck support/digests and regenerate locks on upgrade.

The Docker build uses `npm ci --ignore-scripts`, lint, strict typechecking and Vite build. Only `dist/` enters the Nginx image. Keep the lock committed; host dependencies and generated output are ignored. Compiled artifacts remain in the versioned image, identified by the image ID and artifact hashes recorded during verification.

For optional host development/tests, use Node **24.22.1 or a later Node 24 patch**, npm and network access for dependency/browser downloads. From `frontend/`:

```powershell
npm ci --ignore-scripts
npx playwright install chromium
npm run typecheck
npm run lint
npm test
npm run build
npm audit --package-lock-only
```

Linux browser hosts additionally need Playwright's browser system packages (`npx playwright install --with-deps chromium`, with appropriate OS authorization). No global npm packages are needed. Optional `npm run dev` serves Vite on loopback and proxies `/api` to `http://127.0.0.1:8080`; keep the Compose gateway on that port. The built Compose origin is the acceptance path.

## Focused connection and failure verification

After installing host dependencies/Chromium, run from repository root:

```powershell
powershell -NoProfile -File scripts/verify-same-origin.ps1
```

This creates a uniquely named disposable project with an ephemeral loopback port and fresh intended MySQL volume. It removes only that project's containers/networks/volume in `finally`. It reuses ignored local credentials without rotating passwords or removing the ordinary development database. Avoid concurrent builds against shared `:local` image tags.

Browser checks cover the built real client/API/MySQL path, same-origin requests, exact health JSON, missing API paths, pending feedback, malformed response/network failure, bounded timeout, retry, mobile layout, keyboard focus and axe. HTTP fixtures are isolated to the test runner and never shipped as business behavior. Stopped MySQL, stopped backend and unreadable application-key configuration each produce safe unavailability through the real client, followed by recovery. The script records image, schema/runtime, lock and compiled artifact identities. Traces/screenshots stay in ignored `frontend/test-results/`; retain relevant outcomes for ticket 07. Automated checks do not establish full accessibility or actual nonauthor acceptance.

To test an already running origin, set `YSP_BROWSER_URL` and run `npm run test:browser` in `frontend/`. For an intentionally unavailable runtime, set `YSP_EXPECT_HEALTH=503` and run `npx playwright test tests/health.spec.ts --grep 'checks the real API' --max-failures=1`. The script manages/restores these variables itself. Ticket 09's [combined command](../scripts/README.md) supplies a locked browser container, requiring no host Node/browser installation, and includes backend, frontend and contract checks. Remote CI execution remains pending.

## Contract and evidence limits

Read-only infrastructure health returns HTTP 200 `{"status":"ok","database":"ok"}` or HTTP 503 `{"status":"unavailable","database":"unavailable"}`. It is separate from ticket 01's business `ActionResult` at `contracts/transport/v1/`. The typed client validates unknown JSON, requires the exact success shape, rejects redirects, disables cache use and exposes only connected/unavailable. A 12-second timeout bounds pending feedback. Raw responses/exception details never reach the page. Retry repeats only a read-only health request.

No login, authorized chapter, editable business form, stock posting, durable operation/result lookup or illustrative business outcome is implemented. Input preservation, exact ID/decimal serialization and uncertain business-outcome reconciliation remain requirements for their real consumers. A health sample confirms only that check; it is not continuously monitored business availability. Glenn/Efren review, independent reproduction, applicable remote CI and whole-spec reviewed merge remain pending.

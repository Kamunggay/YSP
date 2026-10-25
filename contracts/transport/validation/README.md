# Operation-example validation

Run the locked entry from the repository root:

```powershell
npm --prefix contracts/transport ci --ignore-scripts
npm --prefix contracts/transport test
powershell -NoProfile -File scripts/verify.ps1
```

The combined command still uses the same contract test entry. It requires Docker.
No generator or application change is included in this preparatory refactoring.

`loadContract()` uses Swagger Parser with HTTP reference resolution disabled and
strict Ajv JSON Schema 2020-12 with format assertions. It compiles every transport
definition and OpenAPI component schema, even those with no examples.

`v1/operation-examples.json` records named exchanges with requirement traces.
Each exchange selects a canonical path template, method and operation ID; request
`path`, `query`, `header` and `cookie` maps contain parsed parameter values, with
IDs retained as strings. Request/response bodies use `body` plus `mediaType`.
Omit both fields for a bodyless exchange. Headers are case insensitive; required
headers and supplied declared headers are validated. Undeclared path/query/cookie
parameters fail. Other HTTP headers may be present, as in normal HTTP traffic.
Status selection uses exact status, then response range, then default. A required
request body cannot be omitted; a declared response payload must be present.

The normal test entry validates each exchange against its actual operation and
ensures every inline formal response example has an exchange. Existing standalone
definition examples and all original consumer checks remain. Bodyless success and
request-body/header failure behavior use a synthetic test-only operation, without
adding a placeholder endpoint to the canonical API. Future slices add exchanges
and operation-specific negative examples here.

This checks parsed contract examples, not HTTP serialization, cookies in a browser,
runtime authorization or durable effects. Authentication/CSRF consumer behavior and
locked type generation belong to the subsequent session slice. The
[Stage 0 archive](../../p00-review/stage-0/README.md) preserves historical hashes,
results and review states separately from these current checks.

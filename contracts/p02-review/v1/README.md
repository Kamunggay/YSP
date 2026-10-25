# P02 combined contract review

This is a successor reconciliation for the existing candidate contract at
`f5e89d64e54bd8cfc77d06d16389d4d11905cd96`, under
[the P02 specification](https://github.com/Kamunggay/YSP/issues/5).
It adds no HTTP operations or wire schemas. The revision identity is the normalized
SHA-256 of the canonical OpenAPI document plus a fingerprinted artifact inventory,
rather than the older, slice-specific OpenAPI version string alone.

Start with [review.json](review.json) for the 13 parent inventory surfaces, all 18
parent checklist positions, seven scenario packs, compatibility classifications,
decision authority and outstanding freeze/runtime gates. Checklist positions are
local to the parent specification, not new requirement identifiers.
The locally generated `index.json` resolves these to all 49 exact HTTP operations and named
examples, and indexes every authored scenario. Its JSON pointers lead to the
original requests, responses, headers, security, preconditions and server obligations;
they introduce no competing wire definitions. Scenario shape checks are executed;
the server conditions remain declarative. The allowed next step never overrides
current authority or permits automatic mutation replay.

Glenn's consumer-usability review and Efren's domain/access and nonauthor review
are recorded as completed **on the project owner's attestation** in the implementation
conversation on 25 October 2026. The owner said, “yes record them as done they have
already reviewed it”. The reported review is associated with the unchanged combined
contract above. Original review dates, direct reviewer notes and individual findings
were not supplied. This records the owner's report; it does not manufacture reviewer
quotes, zero findings, or security/P03 approval of each decision. Historical slice
review flags remain original authored evidence; this successor record records the
later owner report.

Wire/security proposals are individually listed in `freezeDecisions`. Their exact
choices are authored, and peer review is reported complete; additional security/P03
agreement is not inferred. Affected independent implementation readiness remains
unasserted. Security timing, enabled global disable, onboarding/credential delivery,
real assisted recovery and real P03 durable providers are separate runtime gates.
The disabled global boundary, blocked assisted recovery and unsupported policy
payloads remain constrained. Follow-on backend/frontend specifications must retain
the operation IDs and state/outcome semantics and arrange real providers before
enabling dependent durable actions.

Reproduce from the repository root:

```powershell
npm --prefix contracts/transport ci --ignore-scripts
npm --prefix contracts/transport test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1
```

The normal entry first derives OpenAPI response-example maps from the authored
exchange fixtures, then builds the ignored runtime-validation and typed-example
bundles and checks all generated outputs against their sources. From a clean
checkout, run the normal entry or `npm --prefix contracts/transport run generate:fixtures`
before opening the OpenAPI document in another tool so its example references resolve.
The example maps are ignored build outputs; edit response bodies in the exchanges.
Scenario files remain authored descriptions of server conditions and obligations.
The
compact `api.d.ts` and `routes.ts` remain tracked to detect contract/type drift;
the expanded fixture bundles and review index are reproducible build outputs.
It also checks strict positive/intentional
negative compilation, this reconciliation's drift and the existing schema/example,
transport, internal context, identity/evidence, IPC/RM, stock-hold, canonical-hash
and actual health consumer checks. It builds and checks the ignored review index;
`npm --prefix contracts/transport run reconcile` can also build that index directly.
Execution results,
tool identities and limitations for this revision are in [results.json](results.json).

Contract checks do not prove runtime authorization, code consumption, session
revocation, atomic persistence, protected queued delivery, P02 completion,
AC-19/ADD-AC-09 execution or live/MIG readiness. Original Stage 0 files and results,
candidate document status, stable requirement IDs, the roadmap DAG and the parent
issue are preserved. No production authentication, domain migration or cloud access
is needed for the contract-only checks. The optional combined application verifier
uses its established disposable local MySQL and browser environment.

# Full-MVP coverage index — 1.0.0-review.1

24 October 2026. Full-roadmap coverage, parent [spec #2](https://github.com/Kamunggay/YSP/issues/2). This review-ready planning contribution preserves the PRD v1.2/TRD v2.1 review-candidate status and P00–P29. It does not close P00, P01, any pilot or full-MVP acceptance.

Start at [review-index.md](review-index.md): each original node, branch, connector, loop, T/A row, requirement, acceptance scenario, closure rule and missing activation input identifies its package verification gates. The package sections retain the governing owners, reviewers, provider dependencies and completion checks. Every row remains pending for actual acceptance. Related authored checks have their precise limited scope; no synthetic officer, example value or screenshot is an operational approval.

## Files and reproducible checks

- [source-inventory.json](source-inventory.json): exact extracted governing rows, original paths/branch endpoints and SHA-256 text identities for 14 source files. Only CRLF is normalized to LF so Git checkout line endings cannot produce false drift. Stored signature/evidence-object byte hashes are unaffected. This reuses TRD Appendix C, the historical source inventory and the staged roadmap. It creates no new requirement baseline or IDs.
- [index.json](index.json): row-by-row ownership, evidence states, qualified dependency edges, existing corrections and pending handoffs.
- [check-results.json](check-results.json): retained actual checker results and failure-detection evidence for this revision. Command identities and interpretation limits are included.
- `../inventory.mjs`: deterministic extraction from an explicitly selected governing workspace.
- `../ownership.mjs`: individual acceptance/closure refinements and source-derived node/decision owners. Orphan diagnostics use these retained assignments independently of a missing index row. Both broad node owners and explicit decision consumers remain gates; all PRD and schema §10.3 closure predicates are retained, including Backorder.
- `../check.mjs`: completeness/reference checker; failure exits 1 with source and affected packages. It fails on missing/duplicate/orphan rows, missing or unknown owners/gates, unsupported node ownership, source drift, lost dependencies, implementation cycles, dangling/stale evidence, unresolved conflicts or unsupported acceptance promotion.
- `../render.mjs`: regenerates the readable index from the JSON revision; `--check` detects stale rendering.

Run from the repository checkout root:

```powershell
# Check the actual governing sources, including the user's existing edits.
node contracts/full-mvp-coverage/check.mjs --source-root 'C:/path/to/governing-sources'

# Portable validation of the frozen review revision, with freshness explicitly unchecked.
node contracts/full-mvp-coverage/check.mjs --snapshot
node contracts/full-mvp-coverage/render.mjs --check

# Targeted regression checks at this contract's completeness/reference boundary.
node --test contracts/transport/tests/full-mvp-coverage.test.mjs

# Run once for final verification, after this contract's targeted checks/review are green.
npm --prefix contracts/transport test
```

Select the governing document root explicitly with --source-root. It must contain the exact source files recorded in source-inventory.json, including the historical inventories and first-slice agreement. The published snapshot retains their extracted rows and hashes; another checkout may contain different revisions. Missing or changed governing files fail verification and require reconciliation. --snapshot checks the retained index and versioned contract artifacts without claiming current-source freshness. No mode is selected implicitly.

To revise, extract the governing inventory, update every affected mapping/basis and source digest, rerender, rerun source and negative checks, and record review/results. Do not clear a failure by changing policy values or treating contract examples as execution. The 194 definitions comprise 156 original functional/MIG/commercial requirements, eight adopted ADD requirements and 30 TR requirements; 35 AC/ADD-AC rows are tracked separately.

## Dependency and evidence interpretation

Edges point from provider to consumer. Contract inputs, integrated completion, inherited inputs, final rehearsal and actual live activation have separate scopes and retain the original qualification text. P05's P04 dependency needs the evidence contract, not all evidence UI. P26 needs P28 before live activation; P28 rehearses P26 in a test environment. That live prerequisite does not become a circular implementation blocker. P29 still requires P00–P28 for full release. A labeled academic rehearsal does not waive P27/P28.

The entire team owns the roadmap: Glenn supplies UI and query/reservation/demand consumers; Efren owns physical posting, money, fulfillment, booth and ADJ execution; Leader edits shared contracts and coordinates schema/CI and Purchasing/Receiving. This authored contract baseline covers Stage 0; later packages retain their assigned owners. Nonauthor developer review is separate from real officer approvals. Actual Glenn/Efren validation remains pending until actor, revision, date, scope and findings are supplied.

Authored contract checks are identified as `authored-contract-consistency`, with artifact hashes and reproducible validation commands. They certify authored schemas/examples only. All source/AC/application/package gates retain `pending`; intended-MySQL DDL/races, real source/evidence/authority, UI/API integration, nonauthor reproduction, remote CI, reviewed merge and live approvals remain outstanding. Negative checker runs intentionally fail and are labeled failure detection, not failed business transactions. A material mapping conflict remains visible and fails the affected acceptance check.

## the P00 reconciliation bundle consumption

Use this revision and check results without rebuilding its individual roadmap rows. Reconcile transport, identity/evidence, IPC/RM and stock-hold references into the first-slice review bundle and report any changed source/hash/mapping to this index. Detailed Sales/Finance/fulfillment/booth proposals remain future consumer extensions. Actual contract acceptance, P00/P01 closure, named-officer/policy approvals, funding/account/location inputs and independent recovery are later gates. No values, acceptance, dates or technical backup are invented.

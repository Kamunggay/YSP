# Full-MVP coverage index — 1.0.0-review.1

24 October 2026. Leader's local ticket `stage-0-leader/10`, parent [spec #2](https://github.com/Kamunggay/YSP/issues/2). This review-ready planning contribution preserves the PRD v1.2/TRD v2.1 review-candidate status and P00–P29. It does not close P00, P01, any pilot or full-MVP acceptance.

Start at [review-index.md](review-index.md): each original node, branch, connector, loop, T/A row, requirement, acceptance scenario, closure rule and missing activation input identifies its package verification gates. The package sections retain the governing owners, reviewers, provider dependencies and completion checks. Every row remains pending for actual acceptance. Related authored checks have their precise limited scope; no synthetic officer, example value or screenshot is an operational approval.

## Files and reproducible checks

- [source-inventory.json](source-inventory.json): exact extracted governing rows, original paths/branch endpoints and SHA-256 identities for 14 source files. This reuses TRD Appendix C, the historical source inventory and the staged roadmap. It creates no new requirement baseline or IDs.
- [index.json](index.json): row-by-row ownership, evidence states, qualified dependency edges, existing corrections and pending handoffs.
- [check-results.json](check-results.json): retained actual checker results and failure-detection evidence for this revision. Command identities and interpretation limits are included.
- `../inventory.mjs`: deterministic extraction from an explicitly selected governing workspace.
- `../check.mjs`: completeness/reference checker; failure exits 1 with source and affected packages. It fails on missing/duplicate/orphan rows, missing or unknown owners/gates, unsupported node ownership, source drift, lost dependencies, implementation cycles, dangling/stale evidence, unresolved conflicts or unsupported acceptance promotion.
- `../render.mjs`: regenerates the readable index from the JSON revision; `--check` detects stale rendering.

Run from the shared checkout root:

```powershell
# Check the actual governing sources, including the user's existing edits.
node contracts/full-mvp-coverage/check.mjs --source-root C:/xampp/htdocs/YSP

# Portable validation of the frozen review revision, with freshness explicitly unchecked.
node contracts/full-mvp-coverage/check.mjs --snapshot
node contracts/full-mvp-coverage/render.mjs --check

# Targeted regression checks at this ticket's completeness/reference boundary.
node --test contracts/transport/tests/full-mvp-coverage.test.mjs

# Run once for final verification, after this ticket's targeted checks/review are green.
npm --prefix contracts/transport test
```

The main workspace's working documents are the governing inputs, per the execution map. Their existing uncommitted revisions differ from documentation in the shared checkout. They are not overwritten, copied into `docs/`, staged or promoted by this ticket. `--source-root` must identify those governing files, including locally retained historical inventories and the first-slice agreement. A different checkout, a missing file or any changed source fails verification and requires reconciliation. `--snapshot` validates the retained revision and its local contract artifact references only; it does not claim current-source freshness. No mode is selected implicitly.

To revise, extract the governing inventory, update every affected mapping/basis and source digest, rerender, rerun source and negative checks, and record review/results. Do not clear a failure by changing policy values or treating contract examples as execution. The 194 definitions comprise 156 original functional/MIG/commercial requirements, eight adopted ADD requirements and 30 TR requirements; 35 AC/ADD-AC rows are tracked separately.

## Dependency and evidence interpretation

Edges point from provider to consumer. Contract inputs, integrated completion, inherited inputs, final rehearsal and actual live activation have separate scopes and retain the original qualification text. P05's P04 dependency needs the evidence contract, not all evidence UI. P26 needs P28 before live activation; P28 rehearses P26 in a test environment. That live prerequisite does not become a circular implementation blocker. P29 still requires P00–P28 for full release. A labeled academic rehearsal does not waive P27/P28.

The entire team owns the roadmap: Glenn supplies UI and query/reservation/demand consumers; Efren owns physical posting, money, fulfillment, booth and ADJ execution; Leader edits shared contracts and coordinates schema/CI and Purchasing/Receiving. The local Leader ticket list is a subset. Nonauthor developer review is separate from real officer approvals. Actual Glenn/Efren validation remains pending until actor, revision, date, scope and findings are supplied.

Prior executed contract checks are linked as `authored-contract-consistency`, with artifact hashes and local result provenance. They certify authored schemas/examples only. All source/AC/application/package gates retain `pending`; intended-MySQL DDL/races, real source/evidence/authority, UI/API integration, nonauthor reproduction, remote CI, reviewed merge and live approvals remain outstanding. Negative checker runs intentionally fail and are labeled failure detection, not failed business transactions. A material mapping conflict remains visible and fails the affected acceptance check.

## Ticket 06 consumption

Use this revision and check results without rebuilding its individual roadmap rows. Reconcile 01/08/02/03 references into the first-slice review bundle and report any changed source/hash/mapping to this index. Detailed Sales/Finance/fulfillment/booth proposals remain future consumer extensions. Actual contract acceptance, P00/P01 closure, named-officer/policy approvals, funding/account/location inputs and independent recovery are later gates. No values, acceptance, dates or technical backup are invented.

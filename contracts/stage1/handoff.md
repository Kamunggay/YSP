# Combined Stage 1 contract handoff

Parent: [specification #19](https://github.com/Kamunggay/YSP/issues/19), ticket `stage1-contracts-10`.
**Candidate, specified interfaces only. Required combined human review remains pending.**
This package is a Stage 1 prerequisite only after its required review and validation pass.
No contract count establishes implemented Stage 1, live MIG-04, physical stock, handover,
three-laptop acceptance or production readiness. PRD/TRD candidate status is unchanged.

## Reading the complete inventory

[handoff.yaml](handoff.yaml) accounts for every exact HTTP operation, eight controlled
procedures and four internal participants. Its profiles assign backend owner, Glenn's
UI consumption, reciprocal reviewers, actual existence, requirements, exact source nodes
and a link to the applicable transition/blocker/authority agreement. Each operation has
its own method/path entry; there are no unresolved public operation families.

Resolve an entry by operation ID in [openapi.yaml](openapi.yaml): that node and its local
references exclusively own request, response, error, security, parameter/header and
inline example schemas. [examples.yaml](examples.yaml) binds worked cases to those exact
operation/status/media definitions. The profile's agreement link supplies current
authority, transition, material version, action key, evidence and outcome obligations.
[events.yaml](events.yaml) dispositions each exact operation/procedure, including reasons
for no event; [notifications.md](notifications.md) governs audience, dispatch, reconnect,
revocation, current reads and protected unsaved edits. No payload is redefined here.

`specified_only` means absent from inspected scaffold `7287aa4`, not an uncertain design.
Only `GET /api/health` exists. Authentication is explicitly pre-chapter; protected business
URLs carry chapter UUIDs. Controlled procedures have exact canonical input/output, approved
attribution, validation, failure, audit and commit obligations in `x-controlled-procedures`
and the controlled-procedure agreement. Internal participants are synchronous staged
plans inside their caller's transaction, not public APIs or standalone posting tokens.

Profiles are development responsibilities, never operational grants. Existing individual
operation metadata and the detailed agreement still apply, including contextual combined
permissions on private evidence, histories, outcomes and originating-action recovery.

## Requirement and source disposition

The 75 explicit rows in `requirement_coverage` cover GOV-01 through GOV-09, SEC-01
through SEC-03, DOC-01 through DOC-11, INV-01 through INV-14, RF-01 through RF-08,
RCV-01 through RCV-13, MIG-04, AC-01/02/04/19 and ADD-AC-01 through ADD-AC-12.
`stage1_contract` means specified at this contract seam, never a passed product test.
`partial` states which enabled portion is included and what remains later;
`later_stage` retains excluded product obligations without adding speculative routes.
Profiles enumerate applicable TRD source nodes separately from APP-FLOW screen IDs.
Connector E is S1-19 -> S2-10 for internal issue; its booth branch and connector D's
customer sale/payment remain later. Source checkboxes and all-product acceptance remain
unpassed by these files. The detailed per-slice agreement retains additional technical,
screen and source-control mappings; a grouped profile is not full coverage of every
requirement it cites.

GOV-06/07, count-variance ADJ, sales/finance/booth close-out and procurement deduplication
are expressly later. RCV-09 opening Head/Finance signatures do not invent GOV-06's
distinct two-person variance approval for all receipts. Retained need is not a RepF/PO.
Paper-only DOC-08 does not satisfy the deferred on-device mode. Seven view labels do
not authorize SO, booth, inbound PO, DA or ADJ mutation producers.

## Linked consumer journeys and arithmetic

The six named journeys reference exact published case names. Fixtures A and B are
**separate synthetic universes**, even where opaque IDs are reused. Do not join B's
training-material variant8300/unit8400 to A's shirt variant9500/unit9500 or claim B's
illustrative source receipt was posted in A. Alternative branches are not cumulative
movements. No example is an actual approved policy, count or handover fact.

Fixture A fixes chapter `60000000-0000-4000-8000-000000000001`, IPC
`95000000-0000-4000-8000-000000000010`, accepted RM ending `0011`, usable lot ending
`0090`, basis ending `0100`, variant ending `0051`, unit ending `0052` and location
ending `0053`. Complete identities appear in the cases, with no human-reference joins.
Opening actor is `95000000-0000-4000-8000-000000000002`; requester/recipient is
`10000000-0000-4000-8000-000000000001`, independent RF approver is
`10000001-0000-4000-8000-000000000001`, issuing actor is
`98000000-0000-4000-8000-000000000001`. Matching retains the named recipient and exact
paper/batch/material, separately from actual handover and entry/posting times.

| Fixture A state | Usable | RF reserved | Available | Cumulative issued | Remaining demand | Unreserved demand |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Accepted RM: counted15 = usable12 + quarantine2 + rejected1 | 12 | 0 | 12 | 0 | 10 | 10 |
| Independent approved RF10; explicit reserve6 | 12 | 6 | 6 | 0 | 10 | 4 |
| First signed actual issue4 from [0,4) | 8 | 2 | 6 | 4 | 6 | 4 |
| Second accepted signed issue2 from [4,6) | 6 | 0 | 6 | 6 | 4 | 4 |
| Explicit subsequent reserve4 from [6,10), a separate commitment | 6 | 4 | 2 | 6 | 4 | 0 |
| Third accepted signed issue4, separate reference/paper/match | 2 | 0 | 2 | 10 | 0 | 0 |

Quarantine/rejected remain3, booth/SO/inbound remain0 in this Stage 1 fixture; seven views
are nonadditive. `opening-stock-summary-reconciles` supplies all seven exact labeled views.
The existing issue08 fixture starts with an already committed reservation6 and later
reservation4; those are explicit synthetic prerequisites, not runtime receipts. The
validator reconciles the opening movement/source, each disjoint outgoing interval,
approved RF identity/independent approver, cumulative progress and recovered outcome.
Lost response lookup/replay returns the original first4 and movement, never another4.
Printing, uploading, matching, reservations and reconciliation observations make no
physical movement. The alternate formal cancellation of the final4 is not also an issue4.

Fixture B fixes the same illustrative chapter/RF/line IDs but variant
`83000000-0000-4000-8000-000000000001`, unit `84000000-0000-4000-8000-000000000001`,
lot `97000000-0000-4000-8000-000000000010`, basis ending `0110` and actor
`97000000-0000-4000-8000-000000000001`. The exact-ten preparation observes10 before
competition, then commit sees6 and returns409 with `failed_intent_committed:false` and
no new reservation. The explicit-six selection must use a new immutable preparation
and action key; it commits6 and retains4 outstanding. The alternative full-ten case
starts with10 eligible and is not another commit after the partial6.

For B's hold branch, usable10/reserved6/available4 remains unchanged when holds cover
[0,4) and [2,6): their union is6, not8, and all6 are already reserved. Blocked-reserved6
is a subset of reserved6, not another deduction. Clearing the first leaves [2,6) blocked4;
only after every applicable hold clears is blocked0. No movement or second physical
handover follows clearance of unchanged material. The alternative explicit reallocation
moves the six-unit commitment to eligible lot ending0011 without changing physical
stock or demand. It cannot be treated as clearance of the original goods. A changed
signed issue source/recipient/material needs revised batch and fresh matching evidence;
fixture A's changed-batch examples illustrate that downstream rule independently.

## Ownership, transactions and implementation prerequisites

| Boundary | Validation and one commit | Logical data / future migration owner |
| --- | --- | --- |
| Leader `postOpeningRm` -> Efren `prepareOpeningInventory` + Leader `checkEvidenceBinding` | Current source/count/Head-Finance authority, exact inspected quantities/evidence, source versions and one chapter baseline fence; accepted movements, findings/projections, opening lock, reference, result, audit and notice intent commit together. Any rejected participant/error rolls everything back. | Leader: IPC/RM source/count/authorization/match/reference/outcome. Efren: immutable stock source/movements/condition/lot coordinates and projections. Shared MySQL constraint/lock ordering agreed before runtime. |
| Glenn reservation/hold writers -> Glenn `prepareRfDemandChange` + applicable Leader evidence | Current approved RF/material/progress and exact source/priority/setup; reserve/release/reallocate/hold changes, RF progress, result/audit/notice intents share one commit. Holds never themselves move goods. | Glenn: RF lines/history/approval/demand/reservations/preparations/holds/priority override. Leader: evidence immutable bytes/binding, controlled setup. Efren reviews Inventory projection compatibility. |
| Efren `postActualIssue` -> Glenn demand consume + Leader evidence + Efren `prepareActualIssueInventory` | Current authority/recipient/approval/policy, exact eligible reserved intervals, material/stock versions, ready matching paper and uniqueness; movement, consumed reservation, RF progress, result, reference/audit/notice intents all-or-none. No inner participant commits; no finance participant. | Efren: issue batch/material, acknowledgment coordination, actual movement and reconciliation. Glenn: demand consumption/progress. Leader: evidence and common admission/setup. |
| Leader private notification delivery | Intent belongs in originating commit; dispatch only after commit under current subject/read authority. Duplicate/missed/failed delivery causes authorized refetch, no repost. | Leader: subscription/session/socket binding and durable delivery coordination; each domain owner supplies exact subject/version intents. |

Future runtime uses conventional Laravel migrations, shared MySQL transactions, unique
chapter baseline/action/reference constraints, stable stock-coordinate fences and
approved policies; none of the retired migration chain or generators is required.
Before implementation, owners agree actual schema/migration ownership for shared keys,
FKs, locks, evidence pins and outbox storage, then review the runtime specification and
acceptance seam. These physical design choices do not leave any public method/payload or
participant obligation undefined. No table schema is falsely represented as implemented.

Named operational inputs remain prerequisites: actual individually authorized accounts,
chapter memberships/duties/alternates, required MFA, Head-approved operational settings
(cutoff/count team/movement pause, IPC/RM/RF/ISAR reference series, RF approval route,
allocation priority, ROP/target), Finance-approved financial valuation/rounding and any
applicable scoped settings. Use `recordPolicy`'s exact consumer value schema and approved
attribution/effective history. A schema enum/example is not approval. Missing/unapproved
settings block the affected commitment while permitted drafts/corrections remain possible.
Private storage/encryption/session keys, actual paper validation, trusted HTTPS origin/proxy,
current-policy enforcement and fault/lock behavior require separate runtime implementation.
Reverb remains proposed; tunnel provider and numeric notification timing are later measured
deployment/rehearsal choices. Neither is fabricated as an approved operational value.

## Downstream acceptance, specified and unexecuted

Run these at authenticated HTTP against real MySQL with actual overlapping transactions,
private storage and current independently attributed officers. Controlled CLI is limited
to the eight documented setup procedures. Inspect persisted state and rolled-back writes;
parallel client promises alone do not prove transaction overlap.

| Scenario | Required observable evidence; owners |
| --- | --- |
| Authority/recovery | Individual MFA continuation denied; provider without membership denied; chapter switch/current duties and account disable revoke reads, evidence, outputs, subscription, replay and result lookup. Recovery restores current identity only. Approved CLI setup history survives disable/reset. Leader + Glenn. |
| Missing settings / independence | Named absent/unapproved inputs block affected commit but permit drafts; requester cannot approve own RF/override; independent count and actual Head/Finance signatures checked. No synthetic alternate. Leader + Glenn/Efren. |
| Duplicate baseline | Two independent IPC/RM intents racing one chapter yield one complete accepted baseline; accepted same-key replay returns original; changed payload/key cannot create another lock/reference/movement. Zero/all-damaged baseline remains valid if complete. Leader + Efren. |
| Accepted-only receiving | Count15, usable12, quarantine2, rejected1; exact source/unit/location/condition/valuation. Unapproved substitutions and source absence denied; no partial baseline or positive fixture shortcut. Leader + Efren. |
| Last-unit competition | Two RF commitments contend for overlapping eligible ranges; at most available units reserve, loser commits nothing and gets permitted current state. Exact10 sees6 ->409/no reserve, explicit new6 ->6 reserved/4 outstanding. Glenn + Efren. |
| Hold-versus-issue ordering | Force both MySQL lock orders: held-first issue denied; issue-first consumed interval cannot be retroactively held/issued twice. Retained reservation visibly blocked; evidence match never bypasses current hold. Glenn + Efren. |
| Overlapping holds | [0,4),[2,6) union6 with reserved6 and usable10 leaves available4; clear one leaves blocked4, clear all unchanged batch makes blocked0 with no movement. Condition/restriction treatment remains separately sourced. Glenn + Leader/Efren. |
| Reallocation | Equal quantity to explicitly reviewed eligible source, current versions/order/approved override, no source substitution or demand loss. Changed source invalidates signed batch/material acknowledgment; failed reallocation leaves original intact. Glenn + Efren/Leader. |
| Issue atomicity | Inject faults after staged movement, before demand/outcome/audit/notice persistence and at commit; no partial stock/reservation/progress/reference/result. Distinct batches racing last demand cannot overissue. Repeated4+2+4 has three own signatures/movements and exactly10 issued. Efren + Glenn/Leader. |
| Invalid/changed evidence | Real multi JPEG/PNG/PDF byte/type/content/size validation, copied/revoked links, private object loss and replacement races. Technically ready wrong paper still blocked; changed quantity/recipient/source needs fresh exact match; superseded bytes/history retained. Leader + Efren/Glenn. |
| Uncertain handover | Drop HTTP response after commit, recover same operation/key/movement under current authority before retry. 404/inflight/503 is not rollback or physical return proof. Accountable reconciliation distinguishes no handover, committed, handed-over-unposted and dispute; no automatic second handover. Efren + Glenn/Leader. |
| Identity/history | Descriptive catalogue changes/retirement preserve original source/unit/approval/reference; used unit precision cannot mutate. Replays/related/print/history retain exact private scope and material snapshot. Glenn + Leader/Efren. |

Separate manual evidence requires three individually authenticated laptops over the actual
HTTPS/WSS gateway observing one permitted committed transition automatically. Record
officers, observer/date, exact revision/origin/provider, timing measurements, denied private
subscription/read, session/socket ownership, permission revocation, reconnect/current reads,
chapter switching and unsaved-edit isolation for same/different users. One-device mocks,
HTML/HTTP probes, schema examples or six scaffold checks cannot pass this seam.

## Review and validation handoff

The established invocation remains `python contracts/stage1/validate.py` using the pinned
dependencies in a workspace-local environment. It checks resolved local OpenAPI3.1
references, unique IDs, every inline/worked operation/status/header example, procedures,
participants, events, exact combined inventory/coverage links and worked arithmetic.
`--invalid-example` must fail on numeric recovery input after validating the package;
run the valid command again. Combined checks are contract facts, not executed business rules.

Required actual reviews on the concrete combined revision:

| Reviewer responsibility | Required result | Current package state |
| --- | --- | --- |
| Leader | Canonical compatibility; review Glenn/Efren and shared access/setup/evidence/receiving/notification boundaries | Pending actual combined review |
| Glenn | UI consumption, owned catalogue/RF/reservation/hold examples, preserved edits and linked reads | Pending actual combined review |
| Efren | Consequential Leader/shared Inventory/evidence changes and accepted-receipt/actual-issue posting boundaries | Pending actual combined review |
| Affected owners | Reciprocal source/identity/version/audience/transaction compatibility | Pending actual combined review |

Agent Standards/Spec reviews are recorded separately under local completion evidence;
they never impersonate these reviews. Earlier slice approvals retain their own provenance
and do not mark this combined package reviewed. Preserve actual findings/corrections and
the revision reviewed. The coordinator may only resolve/integrate after completion rules
pass. Ticket10 alone does not authorize an unreviewed master merge or automatic parent
issue change. No implementation PR is created; the requested PR-style summary stays local.

Record artifact revision/hash, exact commands/tool versions, initial failures/reruns and
timings locally. Keep contract checks, the complete six scaffold checks and manual/browser
results separate. Rebuild/start an owned isolated project and explicitly named volume for
scaffold checks; record cold preparation versus warm timings and audit failures accurately.

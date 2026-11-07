# YSP MVP Demonstration Implementation Plan

| Field | Planning baseline |
| --- | --- |
| Status | Revised planning baseline; fresh scaffold has not been implemented |
| Recorded | 30 October 2026 |
| Revised | 31 October 2026: owner selected fresh scaffolds, retirement of the previous implementation/design/contracts/tooling, local scaffold verification, a separately specified Stage 0.5 CI gate and separate Stage 1 specification |
| Scope | [MVP delivery scope](MVP-DELIVERY-SCOPE.md): every original four-sheet flowchart branch, with documented corrections |
| Target | Start 1 November 2026; weekday work 2–27 November; presentation window 22–29 November |
| Team | Leader, Glenn and Efren; 5–6 hours each weekday; weekends excluded from dependable capacity |
| Stage 0 | Leader creates fresh Laravel/React/TypeScript/MySQL scaffolds and minimal Docker/local verification; retires obsolete CI without implementing its replacement; timeboxed to 1-3 working days |
| Stage 0.5 | Leader specifies, obtains review of, implements and verifies CI after Stage 0; target one working day, including review and measurement; Stage 1 implementation waits for this gate |
| Method | Stage 0 scaffold first; separate CI specification then implementation in Stage 0.5; Stage 1 specification may overlap CI implementation after Stage 0; agree only the interfaces needed before implementing each workflow |
| Cross-laptop updates | WebSockets; Laravel Reverb recommended, tunnel provider and measured timing to be verified |

## 1. Authority and completion boundary

Implement the academic functional demonstration defined in [MVP-DELIVERY-SCOPE.md](MVP-DELIVERY-SCOPE.md). The original proposal, [PRD](PRD.md), [TRD](TRD.md), [APP-FLOW](APP-FLOW.md), [glossary](../CONTEXT.md) and business ADRs supply workflow meaning and vocabulary, with their candidate/draft status unchanged. The previous [backend architecture](BACKEND-ARCHITECTURE.MD), [database schema](DATABASE-SCHEMA.md) and [full-product implementation plan](IMPLEMENTATION-PLAN.md) do not prescribe the new MVP implementation. Fresh stage specifications define only the technical design needed by their workflows. See [the fresh-scaffold decision](adr/0005-start-the-demonstration-from-fresh-scaffolds.md).

This plan's Stage 0–5 numbering, including the intermediate Stage 0.5, is local to this demonstration plan. Stage 0.5 does not renumber later stages, P00–P29 packages, requirement IDs, source nodes, verification stages or live MIG gates. Earlier packages may explain source behavior but do not require carrying forward their architecture, contracts, schema or tooling. Enabled workflows still require their business controls.

The scope document's explicit deferrals apply: paper-upload-only acknowledgment, operations map/tracer, complete PDF/CSV reporting, complete administration UI, subscription lifecycle and production activation/recovery acceptance. No additional branch, control or requirement is silently deferred to fit the calendar. Basic screens must still support required actions, history, input preservation, failure states and scoped access.

The owner's final 31 October interview decisions replace the earlier preservation and incremental-cleanup approaches. Stage 0 creates fresh Laravel and React/TypeScript applications with MySQL and minimal Docker configuration. The previous P02 implementation, architecture, contracts, generated artifacts, migrations, tests and supporting machinery are abandoned, including unfinished branch work; they are not ingredients for the replacement. Stage 0.5 has its own specification, reviewed after the scaffold is verified and before CI implementation. Stage 1 specification/contracts are separate work after Stage 0 and may proceed during CI implementation; Stage 1 implementation requires both its own reviewed specification and a passed Stage 0.5 gate.

Local master, cached origin/master and live remote master were verified at `185adc9272b656f53f6b97e907e0712ac711b98a` on 31 October. This contains shared contracts and the earlier health scaffold, but not the branch-only access runtime. Start execution from the then-verified master without merging abandoned implementation branches. A fresh branch is an execution vehicle, not a requirement to reuse master's scaffold. Remove retired assets already on master as part of the replacement. No history rewrite, archive copy or compatibility layer is required.

During execution, replace active technical guidance, verification instructions and CI that would reintroduce the abandoned design. Old architecture/schema, package plans, contract inventories and verification lessons are not implementation prerequisites for this MVP. Business requirements remain distinct from their previous engineering solution; this decision does not remove required chapter isolation, independent approvals or stock/money integrity.

This interview updates planning documents and records the decision only. It performs no code deletion, database reset, contract rewrite, implementation, deployment, push or publication. Stage 0 describes planned reset work, not completed cleanup; historical P02/Stage 0 results do not establish the revised exit criteria. Later execution follows the repository's skill and issue-tracker routing; no tickets or GitHub artifacts are created by this document.

## 2. Ownership and review

| Developer | Backend and shared responsibility | UI and review responsibility |
| --- | --- | --- |
| Leader | Sole Stage 0 cleanup assignee; canonical contract editor/coordinator; architecture, migrations/schema integration, evidence/reference/outcome infrastructure, WebSocket infrastructure, purchasing, receiving, donations, opening stock, CI/CD and integration | Default review of Glenn/Efren; supplies rules, examples, backend readiness and integration support for owned screens. Does not take over Glenn's primary UI assignment. |
| Glenn | Demand intake/approvals, catalogue and inventory queries, eligibility and reservations; consumer requirements for all workflows | Primary UI across all stages, including Leader's and Efren's workflows; shared upload/record/approval components and WebSocket subscriptions. Leader reviews. |
| Efren | Inventory physical postings; fulfillment, SI/payment/OR, funding/coverage, internal issues, booth custody/sales/reconciliation, returns/exchanges/refunds and ADJ | Supplies owned domain rules/examples and reviews Leader-authored consequential changes. Leader reviews Efren; Glenn checks affected query/reservation/UI compatibility. |

All cleanup coding belongs to Leader. Efren's cleanup review and Glenn's consumer feedback do not make them cleanup implementation assignees. Leader/Efren reciprocal review concentrates on contracts, migrations, stock, money, permissions and evidence; reversible presentation-only changes can receive lighter review.

Leader's 2–3 hours per weekday for review/integration are included in the 5–6 working hours. Do not plan full-day feature coding plus additional review hours. Glenn's limited experience makes consumable examples and small reviewed increments important. AI tooling assists coding; it does not establish correct tests, business rules or independent review.

## 3. Stage 0 - Fresh Laravel/React/MySQL scaffold

### Goal and boundary

**Assignee: Leader. Reviewer: Efren for consequential changes. Timebox: 1-3 working days, approximately 5-18 Leader hours including verification and coordination.** Starting Monday, 2 November, this ends between 2 and 4 November and consumes Week 1 capacity.

Generate fresh Laravel and React/TypeScript applications and connect them to MySQL through minimal Docker Compose configuration. Use conventional Laravel folders. Do not copy the old application skeleton or restore custom module directories, generic access/provisioning frameworks, transaction/outcome frameworks, contract generators or future-workflow scaffolding. Add abstractions and dependencies only when an implemented MVP workflow needs them.

Stage 0 delivers a runnable development baseline with documented local checks. CI specification and replacement workflow implementation belong to Stage 0.5. Stage 0 contains no access/setup implementation, inventory/payment/evidence infrastructure, Stage 1 operation map, OpenAPI agreement or consumer-example package. Those belong in separate stage planning and implementation. WebSockets, tunnels and additional services wait for their actual workflow consumer.

### Work and removal scope

1. Confirm the execution base and identify local changes, branch/worktree identities and existing database volumes before replacing files. Retire unfinished access work rather than completing or merging it. Handle unrelated local work separately; create no preservation branch, archive tree or compatibility layer for retired implementation.
2. Replace backend and frontend with fresh framework scaffolds. Retire the previous implementation, custom architecture, contracts, generated outputs, migrations, fixtures, test suites, dependencies, review/reconciliation machinery and old verification infrastructure from active execution. This includes old assets on master, not just unmerged branches.
3. Define minimal Compose services for Laravel, React and private MySQL, with only the gateway/routing needed for one browser-facing origin. Supply usable environment examples and simple start/stop/migration commands. Keep credentials out of Git and browser configuration; do not expose MySQL publicly.
4. Use a new empty scaffold database/volume. Add only framework-default tables actually used by the selected scaffold; no account/chapter/business schema in anticipation of Stage 1. Leave existing database volumes untouched; no business data is migrated into this scaffold. Destruction of old volumes is outside this gate.
5. Replace active technical guidance and local verification commands with the fresh baseline. Remove obsolete instructions, P02 references and the old CI workflow that invokes retired commands. Document the temporary absence of CI; specify and implement its replacement only in Stage 0.5. Business requirements inform later MVP specifications without requiring the abandoned technical solution.
6. Retire obsolete implementation/old Stage 0 branches, worktrees, local tickets and associated GitHub artifacts after verifying identities and handling unrelated dirty work. Close associated PRs where applicable. Never merge abandoned implementation to perform cleanup. Housekeeping is separate from proof that the scaffold works; historical commits need not be rewritten.

### Minimum verification

| Check | Required result |
| --- | --- |
| Laravel and MySQL smoke check | Laravel starts and a real backend check successfully reaches MySQL. |
| Frontend | React passes TypeScript checking and builds. |
| PHP and dependencies | PHP syntax checks and PHP/JavaScript dependency audits pass. |
| Manual browser check | The frontend reaches the backend through the intended browser origin. |

Use simple commands and only the minimum smoke coverage needed for those results. No inherited staged verifier, contract-generation/drift checks, Playwright/axe suite, generic test harness or script-regression framework is required. Stage 0.5 will reuse these documented commands in CI; CI implementation and a hosted green run are not Stage 0 exit requirements. Record the manual browser check separately. New feature tests arrive with actual MVP behavior.

Target under one minute for a focused check and under five minutes for the full automated scaffold check when images and dependencies are already available. Record cold dependency installation/image build, startup and warm checks separately, identifying the revision/environment. These are measured targets, not guaranteed timings or permission to omit failed checks. Reducing suite scope does not prove equivalent tests became faster.

### Exit and handoff

The fresh applications start through minimal Docker configuration, MySQL is private, and the agreed checks pass with actual timings. Fresh database initialization and rerunning the documented migration command both succeed. Record the manual browser-to-backend smoke result separately from automated results. Report failed attempts and reruns accurately.

The active tree and its instructions no longer depend on the abandoned application, contracts, generated assets, schema or verification machinery. There is no old-operation compatibility obligation and no claim that access or business workflows work. Hand off only the scaffold revision, setup/check commands and measured results to Glenn and Efren. CI specification is the next separate task in Stage 0.5; no CI implementation or Stage 1 contract/readiness approval is required to finish Stage 0. Stage 1 specification may start after Stage 0, but its implementation waits for the CI gate.

At the timebox limit, report any unmet scaffold gate and reforecast. Do not expand Stage 0 into designing or implementing the next stage.

## 4. Stage 0.5 — CI specification and implementation

### Goal, ownership and entry

**Assignee: Leader. Reviewer: Efren for the CI specification and consequential changes; Glenn supplies frontend consumer feedback. Target: one working day, approximately 5–6 Leader hours including specification, review, implementation, verification and timing measurement.** This is a separate capacity allocation after Stage 0, not part of its 1–3 day timebox. Treat one day as the owner's planning target; report unfinished criteria and reforecast at the limit rather than weakening checks.

Enter from the verified fresh scaffold, its dependency locks, selected runtimes and documented local check commands. Create CI's own specification against those actual inputs, review it, then implement it. This section records agreed planning requirements; it is not the detailed CI specification or permission to implement the workflow now. Route the subsequent specification and local implementation tickets through [the issue-tracker rules](agents/issue-tracker.md).

### Specification and implementation checkpoints

First specify the exact commands, supported runtime versions, job boundaries, stable check names, trigger/concurrency behavior, cache inputs, failure handling, timeouts and timing procedure. Use `github-actions-templates`, adapting its patterns to the fresh scaffold and reviewing action revisions before adoption. Reuse the local commands and add only small documented commands needed for the agreed checks. Do not restore the abandoned staged verifier or create a generic orchestration framework.

Implement the selected **Option C: one workflow with five independently scheduled checking jobs and one final result job**. Keep related commands within their job; define each assertion once, including avoiding duplicate TypeScript checking when the build command already performs it.

| Job | Required responsibility |
| --- | --- |
| Frontend quality | Lint and TypeScript checks for the fresh React application. |
| Frontend build | Verify the production build from locked dependencies. |
| Backend quality | Composer validation, PHP syntax and the style checks agreed for the fresh scaffold. |
| Dependency security | PHP and JavaScript dependency audits against the locked dependencies. |
| Runtime integration | Use the selected Docker runtime and fresh private MySQL; verify database initialization, migrations and repeat migrations, Laravel HTTP availability and real backend-to-MySQL connectivity. |
| Final result | Evaluate all five required results; succeed only when every checking job succeeds. Failed, canceled, missing or unexpectedly skipped prerequisites must never produce a passing final result. |

The checking jobs may run in parallel subject to runner availability; the final job waits for their results and evaluates failures explicitly. Each job prepares its own environment. Start MySQL only in runtime integration. Do not assume jobs share installed dependencies, and do not split each command into its own job. Independent checks should still report their results when another checking job fails.

Run the complete scaffold checks on every branch push, retain pull-request checks for the specification workflow, and provide a manual trigger. Begin without path-based skipping or unsupported runtime/OS matrices. Cancel superseded runs on the same development branch using scoped concurrency groups; an obsolete canceled run is not passing evidence for the latest revision. These triggers do not introduce implementation PRs.

Cache dependency downloads using lockfile-based keys and install from the locks on each run. Define any Docker build-cache inputs in the specification; a cache miss must still yield a correct build and complete checks. Use reviewed immutable action revisions, read-only repository permissions and checkout without retained credentials. Keep validation free of production credentials and deployment/publication steps. The specification must distinguish the final CI result from separately configured branch rules; a passing workflow alone does not establish merge enforcement.

### Performance and effectiveness

The initial warm scaffold CI target is **under five minutes from the first checking job starting through the final result**, including job setup, dependency installation and service startup within that interval. Measure queue time separately. Record cold dependency/image preparation and cached runs separately, together with per-job setup/check durations and total runner time. Parallelism may reduce elapsed time while increasing total runner time; report both rather than claiming more jobs are inherently faster.

Validate this target against the scaffold instead of promising a duration from the job layout. Investigate and report overruns; agree a revised budget or further optimization explicitly. Do not omit checks, suppress audit failures, accept cached results without executing checks, or turn failures into success to meet a timing target. Keep Stage 0's focused local target separate from hosted CI measurements.

Later stage specifications add meaningful tests for implemented behavior to the required CI path. Authorization, stock, money and duplicate-prevention behavior must remain covered when introduced. Reassess timing as coverage grows without treating the scaffold's smaller suite as proof of later feature correctness. The manual browser-to-backend check remains separate initially; no universal browser suite is required in advance.

### Exit and handoff

The reviewed CI specification is implemented and all required jobs pass on the scaffold revision. Exercise a deliberate failing check on a topic branch and verify that the final result fails; inspect aggregation behavior for canceled and skipped prerequisites as well. Confirm the branch-push, pull-request and manual trigger configuration, dependency-cache behavior, disposable runtime cleanup and absence of production credentials. Retain initial failures and successful reruns with their tested revisions and actual timings; identify any unverified event behavior or unmet performance target before closing the gate.

Hand off the specification reference, workflow/check names, local reproduction commands, passing and deliberate-failure run references, and cold/cached timing evidence. Stage 1 implementation waits until Stage 0.5 has passed, even if the scaffold already works locally. Stage 1 specification may proceed during CI implementation within the same team capacity; it is not a second full-time Leader workstream.

## 5. Contract preparation before every stage

This section applies to separate planning before Stage 1 and later stages. None of its business contracts, operation maps or examples is a Stage 0 or Stage 0.5 deliverable. CI has its own specification in section 4.

Leader coordinates and edits the canonical contract; Glenn and Efren supply their owned business operations and consumer examples. They do not wait for Leader to invent all domain rules. Agree detailed operations one stage ahead while implementing the current stage, using known interfaces without speculatively designing the whole future backend.

Each stage must enter implementation with a reviewed operation agreement containing:

- Source/requirement IDs and operation owner; exact HTTP method/path/operation ID and whether it already exists, changes or is new.
- Request/response schemas and examples, approved state transitions, validation/domain errors and blocked outcomes.
- Chapter/duty scope, actor independence, current-authority checks, missing-policy behavior and protected evidence access.
- Monetary/unit precision; expected material version; idempotency key/replay/conflict and uncertain-outcome lookup semantics.
- Internal Inventory/Finance/evidence participants, transaction/lock boundaries, data ownership, migrations and actual prerequisites.
- Committed-change notification, authorized channel audience, event/version identity and reconnect read behavior where screens need automatic updates.
- Backend owner, Glenn's UI consumer, reviewer and meaningful compatibility/acceptance scenarios.

The operation families below describe the work to specify; they are not a second OpenAPI definition or a declaration that routes exist. Exact paths and schemas belong in canonical OpenAPI before their consumers implement them. Internal posting participants do not automatically become public endpoints. No generic document endpoint can approve or post arbitrary stock/money.

Agree shared conventions early: current chapter/authority, references and versions, error/result envelopes, evidence readiness, physical posting, financial coverage and committed notifications. Extend them deliberately rather than rebuilding the architecture at each stage.

### Parallel work and integration rules

Glenn can build screens against agreed typed examples while the backend owner implements. Efren and Leader can build separate domain participants concurrently after shared boundaries and migrations are agreed. These are development conveniences; mocked stock, money, evidence or authority never establishes connected acceptance.

Use isolated implementation branches/worktrees where needed; coordinate additive migration allocation and shared files through Leader. Integrate small reviewed vertical slices frequently into one shared candidate. A developer's independent database is not the assessment database. Stage exits run the real UI and backend against one shared instance.

Stage gates certify connected behavior. Independent work whose prerequisite contracts are settled may proceed without waiting for unrelated stage work, but no slice can bypass its real runtime dependencies. One developer cannot execute multiple assignments simultaneously merely because they appear in parallel rows.

## 6. Stage 1 — Shared foundations and first accepted stock-to-issue flow

**Target:** remaining Week 1, 2–6 November, after Stage 0 and the passed Stage 0.5 CI gate. Three scaffold days plus the targeted CI day leave only Friday, 6 November, for implementation in this window; separate Stage 1 specification also consumes capacity. This is a major schedule risk, not a guaranteed duration. Stage 1 specification may overlap CI implementation after Stage 0.

Stage 1 is a substantial business slice, not a small foundation. Execute it through two checkpoints without renumbering the later stages:

- **Stage 1A — Fresh minimal access and setup:** implement sign-in/session/CSRF/MFA, selected chapter/current permissions and prepared individual accounts/memberships/duties/policies from the verified scaffold. Add their fresh minimal migrations, canonical contracts, UI integration and focused behavior tests. Exit when the first business flow can rely on real, verified access and setup; build only the access/setup behavior required by the new MVP specification.
- **Stage 1B — First accepted stock-to-issue flow:** implement evidence, catalogue/eligibility, inventory posting, IPC/RM, RF reservation and signed issue in dependency order, then demonstrate connected updates across three laptops. Add shared infrastructure only as these operations require it. The full Stage 1 exit below applies to 1B; passing 1A does not establish business-flow acceptance.

The schedule must be reassessed using the verified scaffold, actual Stage 0.5 effort and the fresh implementation effort assigned to 1A. No previous implementation is reused; rebuilding the minimal foundation plus the full business flow is not established to fit the original Week 1 target.

| Workstream | Backend owner | UI owner | Prerequisites and required operations |
| --- | --- | --- | --- |
| Fresh access and minimal approved setup (1A) | Leader | Glenn | Build from the Stage 0 scaffold: sign-in/session/CSRF/MFA, selected chapter/current actions and setup blockers. Introduce fresh minimal schema/contracts/tests and individually attributed synthetic accounts/memberships/duties/policies. Implement only the foundation required by MVP workflows; build only the necessary MVP access/setup. |
| References, versions, approvals, outcomes and paper evidence | Leader | Glenn | Authorized records/history, submit/return/revise/cancel semantics, once-only references and result lookup; upload/validate/bind/retrieve signed-paper evidence. |
| Catalogue, eligibility and reservations | Glenn | Glenn | Chapter-scoped items/variants/locations, restrictions/holds and seven-view queries; RF preparation/review and eligible full/partial reservation. |
| Shared physical posting | Efren | Glenn consumes through source screens | Inventory-owned immutable postings, source/batch validation, quantity precision, locking and projection reconciliation. No source-free public posting operation. |
| IPC → inspected RM | Leader, integrating Efren's Inventory participant | Glenn | Signed independent count, cutoff/valuation/condition, Head/Finance authority, accepted-only posting and one-time baseline protection. |
| Signed actual RF issue | Efren, integrating Glenn's demand/reservation participant | Glenn | Approved RF, ready exact-batch IS/AR acknowledgment, actual movement and demand/reservation consumption in the required transaction. |
| Tunnel and WebSockets | Leader infrastructure; domain owners emit committed events | Glenn subscriptions and current-data refresh | Reverb recommended; HTTPS/WSS gateway/tunnel, secure sessions/CSRF and authorized channels; committed notifications and reconnect resynchronization. |

Suggested implementation order is access/conventions → evidence and nonposting catalogue/ledger participants → accepted IPC/RM → RF reservation → signed issue. Infrastructure and UI work overlap where contracts permit. No positive fixture balance substitutes for IPC/RM.

Exit evidence: three laptops see the same authorized committed transition automatically; invalid source/duplicate baseline/self-approval/missing acknowledgment reject; exact signed issue posts once; source, movement, stock views and RF progress reconcile. Reconnect fetches current permitted data without reposting or losing edits. Review private-channel denial and permission changes. Original-plan references describe source behavior in P02–P07 and the applicable P11 issue slice; they do not require restoring removed P02 operations or completing every full-product package.

Trace: GOV-01–GOV-09, SEC-01–SEC-03, DOC-01–DOC-11, INV-01–INV-14, RF-01–RF-08, relevant RCV/MIG-04 requirements; AC-01/02/04/19 and applicable ADD-AC checks. MIG-04 here is functional evidence, not live activation.

## 7. Stage 2 — Purchasing, three-source receiving and shortage completion

**Target:** 9–13 November. Contract preparation starts during Stage 1. Requires real eligible stock/demand, evidence, approval, posting and outcome foundations.

| Workstream | Backend owner | UI owner | Operations and connected result |
| --- | --- | --- | --- |
| Net shortage/ROP and budget review | Leader; Glenn supplies query/reservation participant | Glenn | Recompute uncovered need against stock/reservations/open supply; RepF preparation, review, return/revise/hold/cancel and budget decision. RF/ROP does not require buyer OR. |
| Quotations and PO | Leader | Glenn | Attach comparable quotations, record selection/rationale, authorize/issue PO, inspect outstanding commitments and review material changes/cancellation. Issuing a PO changes inbound, not on-hand. |
| PO delivery and partial RM | Leader, integrating Efren's posting | Glenn | Supplier DR/source lookup, inspection and discrepancies; accepted-only RM posting, outstanding PO updates, correction/replacement loop and eligible allocation follow-up. |
| DA and restricted stock | Leader; Glenn eligibility, Efren posting | Glenn | Donation acknowledgment, valuation/conditions, approved bounded restriction treatment, inspected RM; unsupported conditions remain blocked. DA never creates buyer money. |
| Repeated RF fulfillment and alerts/reports | Efren issues; Glenn demand/allocation queries; Leader procurement/report infrastructure | Glenn | Allocate accepted supply, sign each actual batch, preserve outstanding demand and valid cancellation/closure. Required inventory/procurement history and ROP checks arrive with each slice. |

Parallelism: Leader builds procurement while Glenn prepares agreed screens/queries and Efren hardens signed posting consumers. Receiving completion waits for approved PO and actual Inventory/evidence participants. Support DA only through the same valid receiving path, not duplicate balance logic.

Exit evidence: denial/revision and unmet quotation policy cannot create an unauthorized PO; competing needs do not duplicate coverage; PO 100/RM 40 accepts 40 now and leaves 60 outstanding; rejected goods stay unusable. Complete another signed RF batch from replenishment. Receive restricted/unrestricted lots sharing a SKU and demonstrate permitted use versus blocked sale. Show source-to-stock history and automatic cross-laptop updates.

Trace: PRC-01–PRC-09, RCV-01–RCV-13, INV-09–INV-14, DOC/GOV controls, RPT-01–RPT-06; AC-07/12/14–16 and applicable RF/ROP ADD-AC-11 behavior. Original-plan reference: P08–P11/P16.

## 8. Stage 3 — Track 1, payment/deadline controls and covered fulfillment

**Target:** 16–20 November alongside Stage 4 preparation where owners/dependencies permit. A stock-only or money-only simulation is not acceptance.

| Workstream | Backend owner | UI owner | Operations and dependencies |
| --- | --- | --- | --- |
| SO intake/review and buyer acceptance | Glenn | Glenn | Prepare/submit/review/return/revise/cancel; record full/partial/backorder acceptance, terms and communication; split demand/reservation states. |
| Full-order SI, verified payment/OR and credit | Efren | Glenn | Bill approved available/backorder quantities, record authorized synthetic verification, issue/register OR once, allocate exact credit and query balances. Require duplicate account/reference prevention. |
| Two clocks and funded procurement | Efren money/deadlines; Glenn demand; Leader purchasing gate | Glenn | Unpaid reservation expiry versus separate accepted-backorder funding deadline; scoped protection, approved cost/OR gate, durable catch-up, partial-money retention and fresh late-payment availability. |
| Covered signed customer release | Efren, integrating Glenn reservation and shared Inventory/evidence/Finance | Glenn | Actual DR batch and acknowledgment, release coverage, physical movement and remaining demand atomically; accepted replenishment retains appropriate funded protection. |

Buyer acceptance and actual verified money must exist before SO-funded procurement can join Stage 2. RF/ROP cannot be mislabeled as SO or vice versa. Build the deadline behavior as demand/money becomes real; do not enable sales while relying on a future expiry worker.

Exit evidence: SI/screenshot/deposit-with-insufficient-merchandise-coverage cannot authorize release; installments equal their actual total; repeated partial releases consume coverage only once. Controlled test-time evidence distinguishes RF, unpaid SO, paid available stock and funded shortage. Exercise both expiry/payment winning orderings, unfunded lapse, late money, and canceled/funded obligations without forfeiture. Full financial resolution joins Stage 4 before closure is accepted.

Trace: SO-01–SO-12, PAY-01–PAY-12, RSV-01–RSV-10, PRC funding and TR-10–TR-14; AC-03/08–11/14/20 and applicable ADD-AC-02/05/06/11. Original-plan reference: P12–P15 plus P19 resolution integration.

## 9. Stage 4 — Booths, ADJ and complete stock/money close-out

**Target:** Week 3, with core ADJ primitives prepared earlier when their shared contracts are ready. This overlaps Stage 3 on the calendar but Efren owns much of both; sequence his slices explicitly rather than budgeting two full-time workstreams.

| Workstream | Backend owner | UI owner | Operations and connected result |
| --- | --- | --- | --- |
| Approved booth setup and checkout | Efren, using Glenn RF and shared Inventory/evidence | Glenn | Event prices/custodian/cashier, approved RF, signed actual stockroom-to-booth movement and separate float. |
| Immediate booth sale and later manual entry | Efren | Glenn | Eligible cart/price review, actual verification/OR and booth stock debit; out-of-stock handoff to Track 1; allocated manual reference intake, original/entry times and duplicate/missing/void reconciliation. |
| ADJ inspection, approval and stock treatment | Efren; Leader supplier follow-up | Glenn | Linked claims/counts, genuine original release limits, inspection/recount, independent decision, resalable return/quarantine/replacement, signed handover and immutable postings. |
| Financial treatment | Efren; Leader supplier/commitment coordination | Glenn | Finance-authorized refund/unequal exchange, additional coverage where required, actual execution distinct from approval and unresolved obligations retained. |
| Count, return, remittance and closure | Efren; Glenn scoped queries | Glenn | Independently verified returns, dual eligible count-variance approvals, cash/GCash/float/remittance reconciliation, blocked incomplete closure and final reports/history. |

Stage 4 requires Stage 1 physical/evidence controls, Stage 2 restrictions/provenance and Stage 3 actual money/OR. An authorized ordinary exchange does not acquire universal dual Head/Finance approval; a count variance does require the documented dual independent treatment. Keep original booth OR evidence distinct from Track 1 OR plus signed DR.

Exit evidence: checkout 100/sell 30/return 70 leaves booth zero and stockroom net minus 30. Separately demonstrate damage/missing custody and unpaid remittance keeping the event open; good verified returns can post while differences remain unresolved. Block preparer/affected-custodian variance approvals, duplicate claims and duplicate manual sale/payment entries. Demonstrate inspected ordinary/defective exchanges, quarantine, signed replacement, actual Finance-authorized refund/unequal exchange, and funded cancellation retaining supplier obligations until resolved.

Trace: BTH-01–BTH-14, ADJ-01–ADJ-10, PAY-09–PAY-12, GOV-05–GOV-07; AC-05/06/13/17/18/20, applicable ADD-AC-07/08/10 and all source return/variance connectors. Original-plan reference: P17–P23 and required P24 query/output slices.

## 10. Stage 5 — Full branch evidence and presentation readiness

**Target:** 23–27 November. This is for completing gaps, regression, reconciliation and rehearsal; it must not be the first time domains connect.

| Owner | Work |
| --- | --- |
| Leader | Integrate the candidate, coordinate compatible migrations/contracts, verify required reports/printable HTML, reconcile cross-module results, run required verification, assemble source coverage/evidence and prepare host/tunnel/restart procedure. |
| Glenn | Complete UI integration and required usability/failure behavior, verify permission-sensitive screens and links, preserve edits on updates/reconnect, rehearse all three devices and provide reproducible UI branch steps. |
| Efren | Reconcile actual stock/custody/coverage/collections/refunds and closure, exercise financial/posting races/retries and review Leader's consequential release changes. |
| All | Resolve reviewed failures and demonstrate assigned workflows using individually authenticated synthetic personas, with the instructor following the same records across devices. |

Required exit:

- Every existing source node/decision/loop/connector has working behavior and linked results under the PRD's corrections; a missing branch means whole-flow acceptance is unmet.
- Main journeys run live across three laptops; alternate paths have reproducible UI steps/results. Tests/screenshots cannot replace absent connected operations.
- Deadline/concurrency/lost-response tests supplement UI evidence using controlled test seams and real intended persistence. No public test bypass or invented stock/payment fact.
- The dossier maps existing source/requirement IDs to actor setup, exact records, expected/actual results, revision, evidence and failures. Partial AC/ADD-AC coverage is marked partial; scope exclusions remain explicitly unaccepted.
- WebSocket/tunnel behavior is rehearsed, delivery timing recorded and agreed, denied access/revocation and disconnect/reconnect exercised, current reads reconcile and no second posting occurs. Confirm internet availability and a connectivity fallback.
- Required verification results and unresolved failures are reported accurately. Synthetic readiness does not activate a pilot, subscriptions or production.

## 11. Verification and delivery discipline

Stage 0 uses only the minimum local gate in section 3. Replace the previous staged runner with simple scaffold commands, remove its obsolete CI workflow, and rewrite [scripts/README.md](../scripts/README.md) and affected agent guidance during Stage 0 implementation. Stage 0.5 separately specifies and implements replacement CI under section 4, updating its documented commands and hosted results. Do not retain old suite stages, generated-contract obligations, custom environment lifecycle machinery or historical test counts as acceptance requirements. Until replacement, existing workflow instructions describe the old application, not evidence for the fresh one. The planned gap between retiring old CI and passing its replacement blocks Stage 1 implementation.

For Stage 1 onward, choose the smallest meaningful tests for implemented behavior in its separate specification. Stock, money, authorization and duplicate prevention need behavior evidence when introduced; they do not require recreating the old testing framework in advance. No universal browser suite or contract-generation pipeline is a prerequisite. Keep checks simple and avoid duplicate assertions.

Record the tested revision, commands, automated results and manual checks accurately. Separate cold installation/build/startup costs from warm checks and distinguish a focused pass from all checks agreed for the current stage. Retain failed attempts alongside successful reruns. Do not suppress failed dependency audits to claim a pass.

When delivery is separately authorized, inspect the complete diff/file list against master before each push. Include only required implementation, tests and runtime/build configuration. Keep local tickets/notes and unrelated edits local; no archive copies, implementation PRs or automatic publication of planning documents.

## 12. Calendar, entry decisions and reforecast

| Window | Target | Planning constraint |
| --- | --- | --- |
| 2-4 November, at most 1-3 working days | Stage 0 | Fresh scaffold, minimal Docker setup, retirement and local verification; remove obsolete CI. Hand off actual commands and timings for separate CI specification. |
| Next working day after Stage 0, targeting 3-5 November depending on scaffold exit | Stage 0.5 | One working day targeted for CI specification/review, implementation and verification. Include measurement and deliberate-failure evidence; unfinished criteria trigger reforecast. Stage 1 specification may overlap CI implementation within available capacity. |
| Remaining time through 6 November after the CI gate | Fresh Stage 1A, then 1B; Stage 2 contract preparation | Stage 1 implementation requires passed Stage 0.5 and its own reviewed specification. Reassess actual scaffold/CI effort and access/setup/business-flow work; the longest scaffold allocation plus the CI target leaves only Friday in Week 1. Missing access/policy/evidence/posting foundations or failed WebSocket rehearsal trigger immediate reforecast; passing 1A alone does not meet the Week 1 business-flow target. |
| 9–13 November | Stage 2; Stage 3/4 contracts | Glenn's UI stays integrated, not postponed; Efren prepares real physical/financial participants in dependency order. |
| 16–20 November | Stages 3 and 4 | Efren and Glenn capacity is shared across both; unresolved work explicitly competes for the final week. |
| 23–27 November | Stage 5 | Preserve time for defects, compatibility, evidence and rehearsal. |

Three weeks supplies 225–270 team hours; four weeks supplies 300–360, including reviews/integration. These are capacity figures, not measured remaining effort. Cleanup and the separate Stage 0.5 CI allocation are included. The new WebSocket requirement adds work and uncertainty compared with polling. No reliable whole-flow three-week commitment is supported by the current evidence; four weeks remains a high-risk stretch target.

At Stage 0 exit, Stage 0.5 exit and again on 6 November, compare actual completed slices and remaining dependencies against capacity. If scope cannot fit, explain the concrete gaps and offer an extended date or an accurately labeled partial presentation. Do not silently drop branches, redistribute Glenn's UI assignment, or weaken controls. A deadline does not establish acceptance.

The exact presentation appointment, final tunnel/Reverb implementation decision, measured update timing, connectivity fallback, approved synthetic duty/policy inputs and current verification status remain explicit follow-up decisions. Whole-flow demonstration is complete only when Stage 5 evidence supports it; live operations still require the separate gates listed in [the delivery scope](MVP-DELIVERY-SCOPE.md#11-before-live-operation).

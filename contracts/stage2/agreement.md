# Stage 2 canonical operation agreement

Specification: [#27](https://github.com/Kamunggay/YSP/issues/27), tickets `stage2-contracts-01`, `stage2-contracts-02`, and `stage2-contracts-04`. Candidate for Efren's consequential-boundary review and Glenn's UI/query consumer review; automated contract validation does not constitute their human sign-off. Source PRD, TRD, ADR 0001, ADR 0004, ADR 0005, `CONTEXT.md`, and `GLOSSARY.md` retain their existing authority. These slices deliver the canonical Stage 2 OpenAPI 3.1.1 baseline, controlled policy/evidence/reference extensions, live net-shortage query, internal shortage participant, RepF intake/duplicate-guard/budget-review lifecycle, procurement action-receipt recovery routes, Stage 1 `cancelInternalRf` compatibility rules, Donation Acknowledgment and donor-restriction resolution lifecycle, worked examples, and validator only. They add no Laravel runtime code, database migrations, React UI screens, or CI workflow changes.

`openapi.yaml` is the single canonical Stage 2 HTTP and participant schema definition. `examples.yaml` binds every operation, controlled policy procedure, and internal participant to machine-validated payloads. Later tickets (`03`–`08`) extend these same files incrementally.

## 1. Shared Stage 1 conventions reused verbatim

All Stage 2 routes live under `/api/v1/chapters/{chapter_id}/...` and inherit Stage 1's settled transport and authority rules without redefinition:

| Concern | Verbatim Stage 1 rule carried into Stage 2 |
| --- | --- |
| Session & CSRF security | Same-origin `ysp_session` cookie (`browserSession`) on all protected routes; exact configured `Origin` plus URL-decoded `X-XSRF-TOKEN` (`csrfProof`) on all unsafe methods. No bearer tokens or client-selectable roles. |
| Caching | `Cache-Control: no-store` on every Stage 2 response, including errors, `204` responses, and printable HTML views. |
| Idempotency & replay | Unsafe Stage 2 mutations require `X-Action-Key` UUID scoped to `chapter + immutable actor + operationId` with canonical validated payload fingerprinting, emit `X-Action-Replayed: true|false`, and return `409 action_key_conflict` on changed-payload reuse. Safe `GET` routes accept no body and no `X-Action-Key`. |
| Pagination | `limit` integer `1..100` (default `25`), opaque 5-minute snapshot-bound `cursor` (`page: {next_cursor: string|null, snapshot_version: integer}`). Expired or changed snapshot returns `409 snapshot_stale`; unknown, repeated, or malformed selectors return `400 invalid_selector`. |
| Scalars & closed objects | Lowercase `Uuid`, UTC `UtcInstant` (`YYYY-MM-DDTHH:MM:SS.ffffffZ`, displayed in `Asia/Manila`), canonical nonnegative `StockQuantity` matching exact approved variant scale `0..6` (zero silent rounding), `PhpAmount` (`0.00` two-decimal PHP), closed schemas (`additionalProperties: false`). |
| Error & blocker envelopes | Closed `Error`, `ValidationError` (RFC 6901 request-relative field pointers), `SetupBlocked` (`error.blockers: SetupBlocker[]`), and `Stage2Conflict` (`failed_intent_committed: false`, authorized `current` or `null`, `setup_blockers`). Uniform `404` (`chapter_not_found` / `resource_not_found`) after current chapter admission. |
| Donor restrictions | Verbatim Stage 1 `BoundedRestriction` (`unrestricted`, `bounded`, `uninterpreted`) per ADR 0004. |

## 2. Operation and participant ownership (Tickets 01–02)

| Canonical ID | Kind | Backend owner | UI / caller consumer | Reviewer | Requirements |
| --- | --- | --- | --- | --- | --- |
| `listReplenishmentNeeds` (`GET /api/v1/chapters/{chapter_id}/replenishment/needs`) | Public safe HTTP `GET` | Glenn | Glenn UI (Inventory, Purchasing, Budget review screens) | Leader (RepF/contract coordination), Efren (stock consistency) | `INV-10`, `INV-11`, `INV-12`, `PRC-02`, `GOV-01`–`04`, `GOV-08`–`09`, `SEC-01`–`03` |
| `computeNetShortageSnapshot` (`x-stage2-shortage-participants`) | Internal synchronous participant (zero public HTTP routes) | Glenn | Glenn `listReplenishmentNeeds` (Ticket 01); Leader `createRepf`/`replaceRepf`/`submitRepf`/`reviewRepfBudget` (Ticket 02) | Leader (RepF commit fence), Efren (stock consistency) | `INV-10`, `INV-11`, `INV-12`, `PRC-02`, `DOC-01`–`03`, `GOV-08`–`09` |
| `recordPolicy` (`x-controlled-procedures`) | Controlled CLI-only procedure (zero public HTTP routes) | Leader | Glenn consumes resulting `SetupBlocker`s only | Efren (consequential setup), Glenn (UI blockers) | `GOV-03`, `GOV-04`, `GOV-08`, `GOV-09`, `DOC-01`, `DOC-10`, `DOC-11`, `SEC-01`–`03` |
| `checkEvidenceBinding` (`x-stage2-evidence-participants`) | Internal synchronous participant (reused verbatim from Stage 1; zero readiness-token routes) | Leader | Leader Stage 2 quotation/DA/receiving/discrepancy/hold commits (Tickets 03–05) | Efren (receiving & restriction commit fences), Glenn (upload/match UI) | `DOC-04`–`DOC-11`, `GOV-01`, `SEC-01`–`03` |
| `listRepfs`, `readRepf`, `listRepfHistory`, `readRepfVersion`, `listRepfRelatedRecords`, `printRepf` | Public safe HTTP `GET` (`/repfs*`) | Leader | Glenn UI (RepF register, detail, history, print) | Efren (audit/security), Glenn (UI consumer) | `PRC-01`–`04`, `PRC-08`, `DOC-01`–`03`, `SEC-01`–`03` |
| `createRepf`, `replaceRepf`, `submitRepf`, `reviewRepfBudget`, `resumeRepfReview`, `reviseRepf`, `cancelRepf` | Public unsafe HTTP mutations (`/repfs*`) | Leader | Glenn UI (RepF preparation, submission, budget review, cancellation) | Efren (locking/idempotency/independence), Glenn (net-need & UI) | `PRC-01`–`04`, `PRC-08`, `INV-11`, `INV-12`, `DOC-01`–`03`, `GOV-01`–`09`, `SEC-01`–`03` |
| `findProcurementOperationByKey`, `readProcurementOperation` | Public safe HTTP `GET` (`/procurement-operations/*`) | Leader | Glenn UI (uncertain procurement retry recovery) | Efren (idempotency/receipt boundary), Glenn (retry UX) | `DOC-01`, `DOC-03`, `GOV-01`, `SEC-01`–`03` |

## 3. Controlled CLI-only Stage 2 policies and reference series

Zero public HTTP policy-mutation routes exist in Stage 2. Every Stage 2 policy is governed exclusively through Stage 1's controlled CLI `recordPolicy` procedure with attributable `CHAPTER_HEAD` (operational) or `FINANCE` (financial) approvals and optimistic `expected_version`. Missing, unapproved, not-yet-effective, or expired policies block only their affected operations with `409 setup_blocked` (`SetupBlocker[]`)—never silent defaults.

### New Stage 2 policy schemas (`x-stage2-policy-values`)

| Setting key | Scope & ownership | Value schema | Enforcement & consumers |
| --- | --- | --- | --- |
| `purchasing_quotation_policy` | Chapter, `operational` (`CHAPTER_HEAD`) | `PurchasingQuotationPolicyValue` | PHP tiers (`min_amount_php`, `max_amount_php`, `minimum_comparable_quotes`) plus `emergency_waiver` (`permitted`, mandatory `require_reason: true` when permitted, `minimum_quotes_when_waived`, `approving_duties`). Enforced on supplier selection & PO approval (Ticket 03); missing/expired yields `409 setup_blocked`. |
| `da_authorization` | Chapter, `operational` (`CHAPTER_HEAD`) | `DaAuthorizationPolicyValue` | Dynamic chapter duty lists (`acknowledge_duties`, `restriction_resolve_duties` chosen from `CHAPTER_HEAD`, `FINANCE`, `INVENTORY`, `RECEIVING`), `require_preparer_independence`, and mandatory signed evidence flags (`const: true`). Enforced on DA acknowledgment & donor-restriction resolution (Ticket 04); missing/expired yields `409 setup_blocked`. |
| `reference_series` (`REPF`) | Chapter, `operational` (`CHAPTER_HEAD`) | `RepfReferenceSeriesPolicyValue` | `document_kind: REPF`, `Asia/Manila` yearly counter, width `6..12`. Allocated once atomically on `submitRepf` (Ticket 02). |
| `reference_series` (`PO`) | Chapter, `operational` (`CHAPTER_HEAD`) | `PoReferenceSeriesPolicyValue` | `document_kind: PO`, `Asia/Manila` yearly counter, width `6..12`. Allocated once atomically on `approvePurchaseOrder` (Ticket 03). |
| `reference_series` (`DA`) | Chapter, `operational` (`CHAPTER_HEAD`) | `DaReferenceSeriesPolicyValue` | `document_kind: DA`, `Asia/Manila` yearly counter, width `6..12`. Allocated once atomically on `acknowledgeDonation` (Ticket 04). |

### Reused Stage 1 policies (`x-stage1-reused-policy-values`)

- `valuation_rounding` (`OpeningValuationPolicyValue`, chapter, `financial` / `FINANCE`): reused for DA declared/estimated unit values (Ticket 04) and PO-RM/DA-RM accepted-line valuation (Ticket 05).
- `rop` and `target_level` (`CatalogueThresholdPolicyValue`, item, `operational` / `CHAPTER_HEAD`): reused by `listReplenishmentNeeds`, `computeNetShortageSnapshot`, RepF `rop_replenishment` validation (Ticket 02), and derived low-stock alerts (Ticket 06).
- `quantity_scale` (`CatalogueQuantityPolicyValue`, variant, `operational` / `CHAPTER_HEAD`): reused across all Stage 2 exact-scale quantity checks (`0..6`; pieces/kits strictly `0`).
- `allocation_priority` (`AllocationPriorityPolicyValue`, chapter, `operational` / `CHAPTER_HEAD`): reused by Glenn's `INV-09` allocation queue (Ticket 06).
- Shared `RM` `reference_series` (`OpeningReferencePolicyValue`, `opening` family): Stage 2 `PO-RM` and `DA-RM` receipts allocate from the chapter's existing yearly `RM` sequence alongside Stage 1 `OpeningRm`, never creating a competing `RM` policy family.

## 4. Additive `EvidencePurpose` values and `checkEvidenceBinding`

Stage 2 extends Stage 1's `EvidencePurpose` enum (`opening_receipt`, `hold_clearance`, `actual_issue`) additively with seven purposes uploaded and retrieved through Stage 1's existing `/api/v1/chapters/{chapter_id}/evidence*` routes:

- `quotation_attachment` (optional supplier quote paper on nested RepF quotations, Ticket 03)
- `po_supplier_dr` (signed supplier Delivery Receipt / PO-RM paper, Ticket 05)
- `da_acknowledgment` (signed Donation Acknowledgment paper, Ticket 04)
- `da_receipt` (signed DA-RM inspection/receipt paper, Ticket 05)
- `donor_restriction_resolution` (signed donor/authorized restriction-resolution paper, Ticket 04)
- `receiving_discrepancy` (discrepancy resolution evidence, Ticket 05)
- `missing_source_hold` (authorized refusal/return evidence for missing-source holds, Ticket 05)

Leader's internal `checkEvidenceBinding` participant is reused verbatim with zero public readiness-token HTTP routes. The owning domain command holds the outer MySQL commit transaction and re-verifies exact byte hashes, snapshot SHA-256, non-supersession, and acknowledgment freshness inside shared commit locks.

## 5. Net-shortage & ROP replenishment contract (`GET /replenishment/needs` & `computeNetShortageSnapshot`)

### Authorization and query rules

- Requires full individual session + MFA, active membership in `{chapter_id}`, and current `replenishment.read` duty (`INVENTORY`, `PURCHASING`, `BUDGET_APPROVER`, or `CHAPTER_HEAD`). Insufficient duty returns `403 duty_denied`; non-member/unknown chapter returns uniform `404 chapter_not_found`; unknown/foreign `item_id` or `variant_id` returns `404 resource_not_found`.
- Allowed query selectors are strictly `limit`, `cursor`, `item_id`, `variant_id`, `trigger_filter` (`all | rf_shortage | rop_breach | uncovered_only`, default `all`), and `q`. Unknown, repeated, or invalid selectors (including Stage 3's `so_shortage`) return `400 invalid_selector`.
- Ordering is deterministic: `item_code` ascending, then `variant_code` ascending, then `variant_id` ascending. Pagination binds a 5-minute snapshot cursor to actor, chapter, authority version, normalized filters, limit, and `snapshot_version`; stale or expired cursors return `409 snapshot_stale`.
- When `trigger_filter=rop_breach` or when `require_rop_and_target_policies=true` (used by Leader for `rop_replenishment` RepF writes), missing or expired `rop` or `target_level` for the requested scope returns `409 setup_blocked` (`SetupBlocked`). Missing or expired `quantity_scale` for any evaluated variant always returns `409 setup_blocked`. For `trigger_filter=all` or `rf_shortage`, missing `rop`/`target_level` appears in the item's `setup_blockers` array without hiding an active approved RF shortage (`INV-10`).

### Exact non-overlapping calculation (`INV-10`–`INV-12`, `PRC-02`)

All arithmetic uses exact decimal math at the variant's approved `quantity_scale` (never floating point). Stage 1 defines `rop` and `target_level` at `subject_scope: item` (`unit_id`, `quantity`). For single-variant items (the common chapter case), item usable stock equals the variant's `usable_stockroom_on_hand`. For multi-variant items sharing the policy's `unit_id`, runtime aggregates item-level usable stock and open inbound across sibling variants sharing that `unit_id` when evaluating item-level ROP breach and item-level target top-up so multiple variants of the same item never multiply `approved_target_level`, while each variant continues to surface its own exact `unreserved_approved_rf_shortage`:

1. `eligible_available_to_allocate = max(0, eligible_usable_stockroom_on_hand - active_rf_reservations)`
2. `unreserved_approved_rf_shortage = max(0, total_unreserved_approved_rf_demand - eligible_available_to_allocate)`
3. `low_stock_breach = (approved_rop != null) && (usable_stockroom_on_hand <= approved_rop)` (`INV-10` compares usable stockroom on-hand—including reserved/held usable stock—against approved ROP).
4. `net_post_rf_position = eligible_usable_stockroom_on_hand - active_rf_reservations - total_unreserved_approved_rf_demand`
5. `gross_rf_shortage_need = unreserved_approved_rf_shortage`
6. `gross_rop_replenishment_need = (low_stock_breach && approved_target_level != null) ? max(0, approved_target_level - max(0, net_post_rf_position)) : 0`
7. `gross_combined_need = gross_rf_shortage_need + gross_rop_replenishment_need` (strictly non-overlapping: units already consumed by RF reservations and unreserved RF demand are never double-counted with ROP top-up).
8. `total_open_inbound_coverage = open_repf_quantity + open_po_inbound_quantity` (includes active non-draft open RepFs and `issued`/`partially_received` POs; excludes inbound flagged `late`, `disputed`, or `ineligible`, which is surfaced separately in `excluded_inbound_quantity` and `inbound_sources` per `INV-12`).
9. Inbound covers RF shortage first, then ROP top-up:
   - `uncovered_rf_shortage_quantity = max(0, gross_rf_shortage_need - total_open_inbound_coverage)`
   - `uncovered_rop_replenishment_quantity = max(0, gross_rop_replenishment_need - max(0, total_open_inbound_coverage - gross_rf_shortage_need))`
   - `proposed_uncovered_quantity = uncovered_rf_shortage_quantity + uncovered_rop_replenishment_quantity`

### Internal `computeNetShortageSnapshot` transaction boundary

- Owned by Glenn; exposes zero public HTTP routes.
- Called synchronously with a bounded `variant_ids` batch (`1..100`) by `listReplenishmentNeeds` (after resolving the current snapshot-paginated page of up to `limit` active variant IDs) and by Leader's `createRepf`, `replaceRepf`, `submitRepf`, and `reviewRepfBudget` transactions (under Leader's outer MySQL transaction locks so concurrent RepF submissions serialize cleanly against live stock/RF/inbound state).
- Accepts `exclude_repf_id` so replacing, submitting, or budget-reviewing an existing RepF does not count that RepF's own open lines against itself.
- Returns `ready`, `setup_blocked`, or `rejected`; Leader aborts the enclosing write transaction on any non-`ready` outcome.

## 6. RepF intake, net-need duplicate guard, budget review & recovery (Ticket 02)

### 6.1 State machine, versions, references & mandatory reasons

| From state | Operation | Allowed target state(s) | Version / reference / reason rules |
| --- | --- | --- | --- |
| *(none)* | `createRepf` (`POST /repfs`) | `draft` | `version = 1`, `material_version = 1`, `repf_reference = null`. Calls `computeNetShortageSnapshot`. |
| `draft` | `replaceRepf` (`PUT /repfs/{repf_id}`) | `draft` | Checks `expected_version` & `expected_material_version`; increments both `version` and `material_version`; re-runs `computeNetShortageSnapshot(exclude_repf_id = repf_id)`. |
| `draft` | `submitRepf` (`POST /repfs/{repf_id}/submit`) | `pending_budget_review` | Checks `expected_version` & `expected_material_version`; increments `version`; allocates `REPF` reference **once-only** on first submit (retained on subsequent revisions); re-runs `computeNetShortageSnapshot(exclude_repf_id = repf_id)`. Missing/expired `REPF` `reference_series` yields `409 setup_blocked`. |
| `pending_budget_review` | `reviewRepfBudget` (`POST /repfs/{repf_id}/budget-review`) | `approved`, `held`, `returned_for_revision`, `rejected` | Independent `BUDGET_APPROVER`/`CHAPTER_HEAD` (`403 independence_required`). Mandatory non-blank `reason` on `hold`, `return`, `reject` (`422 invalid_input`). On `approve`, checks actor `DutyGrant.scope.limit_php` (`403 duty_limit_exceeded`), re-runs `computeNetShortageSnapshot(exclude_repf_id = repf_id)`, and freezes `approved_budget_php = estimated_total_php`. |
| `held` | `resumeRepfReview` (`POST /repfs/{repf_id}/resume-review`) | `pending_budget_review` | Independent `BUDGET_APPROVER`/`CHAPTER_HEAD`; checks versions; increments `version`. |
| `held` | `reviewRepfBudget` (`decision: return`) | `returned_for_revision` | Independent `BUDGET_APPROVER`/`CHAPTER_HEAD`; mandatory non-blank `reason`; increments `version`. (`approve`/`reject` require `resumeRepfReview` first, else `409 invalid_transition`.) |
| `returned_for_revision` | `reviseRepf` (`POST /repfs/{repf_id}/revise`) | `draft` | Increments both `version` and `material_version`; retains allocated `repf_reference` and immutable prior snapshots. |
| `approved` / `partially_ordered` | *(derived by Ticket 03 `approvePurchaseOrder`)* | `partially_ordered`, `ordered` | Updates line `ordered_quantity` / `remaining_to_order_quantity` and appends `po_ordered_progress` history entry (bumps `version`, not `material_version`). |
| `draft`, `held`, `returned_for_revision`, `approved`, `partially_ordered` | `cancelRepf` (`POST /repfs/{repf_id}/cancel`) | `canceled` | Mandatory non-blank `reason` (`422`). Pre-approval states (`draft`, `held`, `returned_for_revision`) permit any `repf.cancel` holder; post-approval states (`approved`, `partially_ordered`) require `BUDGET_APPROVER` or `CHAPTER_HEAD` (`403 duty_denied`). Sets `canceled_quantity = remaining_to_order_quantity`, `remaining_to_order_quantity = 0`, preserving `ordered_quantity` and issued POs. `pending_budget_review` (must be reviewed/held/returned first), `ordered`, `rejected`, and `canceled` return `409 invalid_transition`. |

### 6.2 Triggers, non-overlapping breakdown & duplicate-coverage guard (`PRC-01`–`PRC-03`, `INV-11`–`INV-12`)

- **Strict Stage 2 triggers (`PRC-01`):** `RepfTriggerKind` accepts only `rf_shortage` and `rop_replenishment`. Any `so_shortage` payload fails request validation with `422 invalid_input` pointing to `/lines/{i}/trigger_kind` (and `GET /repfs?trigger_kind=so_shortage` fails with `400 invalid_selector`). `funding_source` is fixed to `chapter_funds`.
- **RF linkage & line-uniqueness validation:** Every `rf_shortage` line requires non-null same-chapter `rf_id` and `rf_line_id` referencing a currently approved (non-canceled, non-fully-issued) internal RF line matching `variant_id` and `unit_id`; ineligible or closed RF lines fail with `409 source_not_eligible` (foreign/unknown IDs return `404 resource_not_found`). Every `rop_replenishment` line requires `rf_id: null`, `rf_line_id: null`, and effective `rop` + `target_level` policies (`require_rop_and_target_policies: true` → `409 setup_blocked` if missing/expired). Within a single RepF (capped at `maxItems: 100` lines to match `computeNetShortageSnapshot`'s `variant_ids: 1..100` bound), duplicate `rf_line_id`s across `rf_shortage` lines and duplicate `(variant_id, rop_replenishment)` lines are rejected with `422 invalid_input`.
- **Multi-trigger RepFs & net-need breakdown:** One RepF may combine `rf_shortage` and `rop_replenishment` lines (even for the same variant). Each line persists its exact server-computed `RepfLineNeedBreakdown` from Glenn's `computeNetShortageSnapshot` without double-counting overlapping shortage and ROP quantities.
- **Duplicate-supply-coverage protection (`INV-12`):** On `createRepf`, `replaceRepf`, `submitRepf`, and `reviewRepfBudget(approve)`, Leader enforces three non-overlapping bounds unless an explicit `additional_purchase_reason` (`category: late_supply | disputed_supply | ineligible_supply`, optional `referenced_source_ids`, non-blank `explanation`) is recorded on every excess line: (a) each `rf_shortage` line's `requested_quantity` cannot exceed its linked RF line's live `unreserved_outstanding_quantity` or `uncovered_rf_shortage_quantity`, and each `rop_replenishment` line's `requested_quantity` cannot exceed `uncovered_rop_replenishment_quantity`; (b) the sum of `requested_quantity` per `(variant_id, trigger_kind)` cannot exceed that trigger's live uncovered quantity (`uncovered_rf_shortage_quantity` / `uncovered_rop_replenishment_quantity`); and (c) the combined sum across both triggers for a `variant_id` cannot exceed `variant_proposed_uncovered_quantity`. Any unapproved excess aborts the transaction with `409 duplicate_supply_coverage`, `failed_intent_committed: false`, and line-level `coverage_conflicts[]` naming the blocking inbound RepF/PO sources.

### 6.3 Authorization, transaction/lock boundaries & committed events

- **`x-stage2-action-duties`:**
  - `repf.read`: `INVENTORY`, `PURCHASING`, `BUDGET_APPROVER`, `CHAPTER_HEAD`, `FINANCE`, `INDEPENDENT_REVIEWER`
  - `repf.draft`: `INVENTORY`, `PURCHASING`
  - `repf.submit`: `INVENTORY`, `PURCHASING`
  - `repf.budget_review`: `BUDGET_APPROVER`, `CHAPTER_HEAD` (strictly independent of `repf.preparer.user_id` → `403 independence_required`; `approve` additionally enforces `DutyGrant.scope.limit_php >= repf.estimated_total_php` → `403 duty_limit_exceeded`)
  - `repf.cancel`: `INVENTORY`, `PURCHASING`, `BUDGET_APPROVER`, `CHAPTER_HEAD` (post-approval `approved`/`partially_ordered` narrowed to `BUDGET_APPROVER`/`CHAPTER_HEAD`)
- **MySQL transaction & lock order (Leader owns outer transaction):**
  1. Verify session/MFA, chapter membership, `Origin` + `X-XSRF-TOKEN`, current duty, and non-locking `ActionReceipt` pre-check.
  2. Open MySQL transaction; acquire shared authority/policy locks (`chapter`, `duty_grants`, `reference_series` / `rop` / `target_level` / `quantity_scale`), then lock the target RepF row (`FOR UPDATE` on existing RepF) and sorted chapter variant guard rows (`FOR UPDATE`) to serialize concurrent RepF submissions against the same variant's live uncovered need.
  3. Recheck `ActionReceipt` (`sharedLock`) inside the lock boundary: identical canonical fingerprint replays original `200`/`201` snapshot with `X-Action-Replayed: true`; changed payload aborts with `409 action_key_conflict`.
  4. Verify `expected_version`, `expected_material_version`, status transition, independence, and monetary ceiling (`approve`).
  5. Invoke Glenn's `computeNetShortageSnapshot` synchronously inside the transaction (`exclude_repf_id = repf_id` for existing RepFs); abort on `setup_blocked`, `rejected`, or `duplicate_supply_coverage`.
  6. On first `submitRepf`, lock chapter `REPF` yearly sequence counter (`FOR UPDATE`) and allocate `repf_reference` once-only.
  7. Persist RepF, lines, immutable version snapshot, history entry, `ActionReceipt`, and transactional outbox event `stage2.repf.changed.v1` (Ticket 07 8-field envelope on `private-stage1.chapter.{chapter_id}`), then commit.
- **Action-receipt recovery (`/procurement-operations/by-key` & `/procurement-operations/{operation_id}`):** Strictly limited to the original immutable actor who still holds current chapter membership, `repf.read`, and the originating mutation's current required duty. Unknown, in-flight, foreign-chapter, or other-actor receipts return uniform `404 operation_not_found` (never proof of rollback). Never log query strings containing `action_key`.

### 6.4 Stage 1 `cancelInternalRf` compatibility contract (`PRC-08`)

Stage 1's `POST /api/v1/chapters/{chapter_id}/internal-rfs/{rf_id}/cancel` (`cancelInternalRf`, owned by Glenn) retains its exact Stage 1 HTTP route, request schema, and response schema and **never blocks or deadlocks** on open Stage 2 RepFs or POs:
- Inside `cancelInternalRf`'s MySQL transaction, after updating the RF's remaining unissued line quantity to canceled, lock affected open Stage 2 RepF rows (`status` in `draft`, `pending_budget_review`, `held`, `returned_for_revision`, `approved`, `partially_ordered` in sorted `id` order to prevent deadlocks) and linked open PO rows (Ticket 03).
- Set `linked_demand_canceled = true` and `linked_demand_canceled_at = committed_at` on each affected RepF line and `linked_demand_canceled = true` on the parent RepF, append an immutable `linked_demand_canceled` history entry (incrementing `version` without changing `material_version`), and emit `stage2.repf.changed.v1` on commit.
- Live officer alerts (`GET /alerts`, Ticket 06) immediately surface a derived `demand_changed` alert referencing the flagged RepF/PO so Purchasing and Budget officers can adjust or cancel un-ordered remainders deliberately.

## 7. Requirement traceability (Tickets 01–02)

| Requirement | Contract coverage and downstream obligations |
| --- | --- |
| `INV-10` | Exact `low_stock_breach` (`usable_stockroom_on_hand <= approved_rop`) in `ReplenishmentNeedItem`; demand shortage remains visible even above ROP or without ROP policy. |
| `INV-11` | Complete non-overlapping breakdown (`approved_target_level`, `eligible_usable_stockroom_on_hand`, `active_rf_reservations`, `unreserved_approved_rf_shortage`, open RepF/PO inbound, `gross_rf_shortage_need`, `gross_rop_replenishment_need`, `proposed_uncovered_quantity`) mirrored onto every `RepfLine.net_need_breakdown`. |
| `INV-12` | Counted open RepF/PO inbound deducts from proposed uncovered quantity; late/disputed/ineligible inbound is surfaced separately via `excluded_inbound_quantity` and `inbound_sources`; RepF mutations enforce `409 duplicate_supply_coverage` unless explicit `additional_purchase_reason` is supplied for independent review. |
| `PRC-01` | Strict Stage 2 `RepfTriggerKind` (`rf_shortage` requiring same-chapter approved `rf_id`/`rf_line_id`, or `rop_replenishment`), `funding_source: chapter_funds`, and `422 invalid_input` rejection of `so_shortage`. |
| `PRC-02` | Synchronous `computeNetShortageSnapshot` supplies live server-reconfirmed net need to both UI reads and Leader RepF create/replace/submit/approve write guards. |
| `PRC-03` | Multi-trigger `Repf` records `trigger_kinds`, `urgency`, `funding_source`, line `net_need_breakdown`, PHP estimates, and `additional_purchase_reason` without double-counting overlapping need. |
| `PRC-04` | Independent `reviewRepfBudget` (`approve | hold | return | reject`), `resumeRepfReview`, `reviseRepf`, preparer/approver independence (`403 independence_required`), grant monetary limit (`403 duty_limit_exceeded`), mandatory non-blank hold/return/reject reasons, and non-closing of linked RF demand. |
| `PRC-08` | `cancelRepf` cancels un-ordered RepFs or `partially_ordered` remainders with mandatory reason, authority gate, and full history; Stage 1 `cancelInternalRf` succeeds without deadlock while setting `linked_demand_canceled: true` and raising `demand_changed` alerts. |
| `DOC-01`–`DOC-11` | Canonical Stage 2 `reference_series` families (`REPF`, `PO`, `DA`) with once-only `REPF` allocation on `submitRepf`, shared yearly `RM` sequence, additive `EvidencePurpose` enum, `checkEvidenceBinding` reuse, `/procurement-operations/*` recovery, printable escaped HTML `printRepf`, and immutable version/history snapshots. |
| `GOV-01`–`GOV-09` | Chapter-scoped routes, 14 canonical duties (`x-stage2-action-duties`), CLI-only policy governance (`purchasing_quotation_policy`, `da_authorization`, `reference_series`), explicit `409 setup_blocked` blockers, and zero silent defaults. |
| `SEC-01`–`SEC-03` | Verbatim Stage 1 `ysp_session` + MFA + `Origin` + `X-XSRF-TOKEN`, `Cache-Control: no-store`, strict print CSP + `nosniff`, uniform `404` anti-enumeration (`chapter_not_found`/`resource_not_found`/`operation_not_found`), and zero public routes for internal participants or CLI setup. |

## 8. Contract validation

Run from this worktree root in PowerShell using an ignored workspace-local Python 3.13+ virtual environment pinned to `contracts/stage2/validation-requirements.txt`:

```powershell
python -m venv .runtime/contract-validation
.runtime/contract-validation/Scripts/python.exe -m pip install -r contracts/stage2/validation-requirements.txt
.runtime/contract-validation/Scripts/python.exe contracts/stage2/validate.py
# Expected exit 1 (deliberately invalid so_shortage RepF trigger):
.runtime/contract-validation/Scripts/python.exe contracts/stage2/validate.py --invalid-example
# Clean exit 0 rerun:
.runtime/contract-validation/Scripts/python.exe contracts/stage2/validate.py
```

## 9. Downstream runtime acceptance obligations (not executed here)

Future Stage 2 implementation tickets (after `#27` contract sign-off by Efren and Glenn) must verify at the authenticated HTTP/MySQL boundary:

1. `GET /replenishment/needs` enforces full session/MFA, chapter membership (`404 chapter_not_found`), `replenishment.read` duty (`403 duty_denied`), `Cache-Control: no-store`, strict query-selector rejection (`400 invalid_selector` on repeated/unknown keys or `so_shortage`), and 5-minute snapshot cursor invalidation (`409 snapshot_stale`).
2. Real MySQL fixtures verify exact decimal arithmetic (`Brick\Math\BigDecimal`) across normal ROP breach, combined RF shortage + ROP without double-counting, excluded `StockHold` / `uninterpreted` donated lots, fully covered open RepF/PO inbound yielding `0` uncovered need, separately surfaced late/disputed inbound, and `409 setup_blocked` when `rop`/`target_level`/`quantity_scale` is missing or expired.
3. CLI `recordPolicy` persists and validates `purchasing_quotation_policy`, `da_authorization`, and Stage 2 `REPF`/`PO`/`DA` `reference_series` families with zero public HTTP policy-mutation routes, and confirms Stage 2 `PO-RM`/`DA-RM` share the chapter's existing `RM` sequence.
4. Existing Stage 1 `/evidence*` routes accept all seven additive Stage 2 `EvidencePurpose` values while keeping `checkEvidenceBinding` strictly internal with zero readiness-token endpoints.
5. RepF HTTP/MySQL tests verify multi-trigger creation/replacement, `so_shortage` `422` rejection, concurrent variant lock serialization preventing duplicate RepF coverage (`409 duplicate_supply_coverage`), explicit `additional_purchase_reason` override approval, once-only `REPF` reference allocation across `submit` → `return` → `revise` → resubmit, preparer self-review denial (`403 independence_required`), actor grant ceiling denial (`403 duty_limit_exceeded`), post-approval remainder cancellation, `X-Action-Key` replay / `409 action_key_conflict` / `/procurement-operations/*` lost-response recovery, escaped `printRepf` HTML headers, and Stage 1 `cancelInternalRf` flagging linked open RepFs with `linked_demand_canceled: true` without deadlocking RF closure.
6. Separate multi-laptop browser rehearsal (Stage 2 exit) verifies Glenn's replenishment and RepF screens refresh live on committed stock/RF/RepF/PO events without duplicating mutations or losing unsaved draft edits.

## 10. Donation / Sponsorship Acknowledgment and donor restrictions (Ticket 04)

Leader owns the public DA operations and Glenn consumes them in the UI. Glenn reviews transport, recovery and eligibility behavior. Efren reviews DA-RM source eligibility, restrictions and lot locking. Paths are relative to the admitted chapter.

| Operation ID | Method and path | Duty action | Trace |
| --- | --- | --- | --- |
| `listDonations` | `GET /donations` | `da.read` | RCV-11, DOC-01 |
| `createDonation` | `POST /donations` | `da.draft` | RCV-11, RCV-13 |
| `readDonation` | `GET /donations/{da_id}` | `da.read` | RCV-11, DOC-01 |
| `replaceDonation` | `PUT /donations/{da_id}` | `da.draft` | RCV-11, DOC-05 |
| `submitDonation` | `POST /donations/{da_id}/submit` | `da.submit` | RCV-11, GOV-04 |
| `acknowledgeDonation` | `POST /donations/{da_id}/acknowledge` | `da.acknowledge` | RCV-11, RCV-13, DOC-08 |
| `returnDonation`, `declineDonation` | `POST /donations/{da_id}/return`, `/decline` | `da.acknowledge` | RCV-11, DOC-05 |
| `reviseDonation` | `POST /donations/{da_id}/revise` | `da.draft` | RCV-11, DOC-05 |
| `closeShortDonation` | `POST /donations/{da_id}/close-short` | `da.acknowledge` | RCV-07, RCV-11 |
| `cancelDonation` | `POST /donations/{da_id}/cancel` | `da.cancel` | RCV-11, DOC-05 |
| `resolveDonationRestriction` | `POST /donations/{da_id}/restriction-resolutions` | `da.restriction_resolve` | RCV-12, INV-09, DOC-08, ADR 0004 |
| `listDonationHistory`, `readDonationVersion` | `GET /donations/{da_id}/history`, `/versions/{version}` | `da.history_read` and Stage 1 `history.read` | DOC-05, DOC-11 |
| `listDonationRelated` | `GET /donations/{da_id}/related` | `da.read` and each linked record's read scope | RCV-11, RCV-12, DOC-11 |
| `printDonation` | `GET /donations/{da_id}/print` | `da.read` | RCV-11, DOC-04, DOC-08 |
| `findDonationOperation`, `readDonationOperation` | `GET /donation-operations/by-key`, `/{operation_id}` | `da.read` and original mutation action | DOC-01, DOC-05, GOV-09 |
| `applyLotRestrictionResolution` | Internal synchronous participant | Efren implements, Leader calls inside the authorized resolution commit | RCV-12, INV-09, INV-14, ADR 0004 |

### Intake, authority and state

- Check current full session/MFA, active chapter membership and applicable action/record scopes before disclosing any DA, lot, evidence or receipt. Require applicable Stage 1 `evidence.read` before disclosing linked evidence metadata in a DA, receipt, conflict, history or version. Without scope, exclude inaccessible rows and links from collections and deny a directly requested protected result. Printed HTML omits evidence attachments, private URLs and signature images. Check current `history.read` before disclosing a historical version or superseded evidence.
- Inventory and Receiving draft, submit and cancel. For `da.acknowledge` and `da.restriction_resolve`, intersect the four candidate duties in `x-stage2-action-duties` with the effective chapter `da_authorization` field (`acknowledge_duties` or `restriction_resolve_duties`). Missing, unapproved, future or expired policy yields `409 setup_blocked`. A role absent from the effective policy yields `403 duty_denied`. When `require_preparer_independence` is true, the immutable DA preparer cannot perform these actions and receives `403 independence_required`. Return, decline and close-short use the same acknowledgment action gate. Acknowledgment and restriction resolution require signed paper matching.
- Approved chapter `valuation_rounding` supplies the valuation basis reference and rounding mode. Retain its policy ID and version. Each line records its variant, unit, positive pledged quantity at the approved variant scale, expected condition, declared or estimated PHP unit value at scale 2, valuation basis and restriction. Pledged line value multiplies quantity by unit value and rounds once at scale 2. The total sums rounded lines. Actual accepted-line valuation follows the existing `round_at: accepted_line` rule on DA-RM posting. Missing effective quantity or valuation policy blocks create, replace, submit and acknowledge with `409 setup_blocked`. When a changed policy requires a material change, return `409 version_conflict` and require revision and fresh signed paper before acknowledgment. DA creates zero cash, Official Receipts or buyer credit.
- `x-stage2-donation-transitions` defines the DA state machine. Replace only while `draft`. A returned DA must `revise` before replacement or resubmission. Return, decline, close-short and cancel require a reason. Acknowledge once, allocating the immutable `<approved prefix>-<four-digit Manila year>-<zero-padded sequence>` from the effective chapter/year `DA` series in the same commit. Missing or ineffective series blocks acknowledgment. A posted DA-RM updates accepted quantity and reports `partially_received` after partial acceptance or `received` once all pledged quantities are accepted. A zero-acceptance DA-RM retains the current DA state and still counts as posted. Close-short closes outstanding delivery and preserves quantities and holds. Cancel only before any DA-RM has posted, including receipts with zero accepted units. Retain any allocated reference after cancellation. Declined and canceled DAs have no subsequent DA actions.
- `version` advances on every committed DA change, including receipt progress and an audit-only review. `material_version` advances when signed material changes, including a changed draft or applied restriction. All existing-record mutations compare both expected versions under lock after authorized replay detection. A stale version yields `409 version_conflict`. `/versions/{version}` returns the immutable DA snapshot by resource version. Commit attributable history and the DA snapshot together.

### Signed evidence and restriction resolution

- Upload signed paper through the Stage 1 evidence routes. Acknowledgment binds `da_acknowledgment` to the pending DA. Resolution binds `donor_restriction_resolution` to the DA and its exact line change. The request supplies the current evidence ID/version and attachment digests, actual `signed_at` and explicit confirmation from the authorized officer who personally verified the paper and signatories. The acknowledgment must carry the acting officer's signature. Resolution paper must document the donor's or authorized representative's signature and authority for the exact proposed terms or release. For an audit review, verify the signed review of the unexpressed condition. Validate that signing preceded or coincided with server match time. Derive match ID, matcher, match time and `recipient_id: null` on the server. DA has no recipient handover.
- Build `EvidenceSnapshot` with the DA UUID, purpose, pre-commit material version and SHA-256 of RFC 8785 canonical material JSON. `DonationAcknowledgmentMaterial` defines the complete signed draft projection in stored document line order. Allocate the DA display reference after matching. `DonationRestrictionResolutionMaterial` binds the line ID, prior and proposed terms, decision kind and reason. Canonicalize scope IDs and allowed uses as sorted unique collections. Persist the projection and exact binding and retain the original terms and acknowledgment. Each resolution uses a fresh evidence lineage. Stage 1 upload admission permits that purpose on a DA in an eligible post-acknowledgment state. Prior committed evidence remains immutable.
- Verify the exact manifest, snapshot and domain-validated match through `checkEvidenceBinding` inside Leader's commit. Map missing evidence or match to `409 evidence_missing` or `acknowledgment_missing`, invalid bytes to `evidence_invalid`, and changed, foreign, stale or superseded bindings to `evidence_mismatch`. A locked evidence target yields `409 target_locked`. Failure rolls back the DA, evidence binding, history, reference, lot update, receipt and outbox together.
- For `unrestricted` use Stage 1's empty use/event/unit lists and null date, interpretation and source-condition fields. `bounded` applies all configured predicates together. Distribution-only uses `allowed_uses: [internal_use]` with any applicable event/unit/date bounds and excludes sale and booth custody. `uninterpreted` retains a source-condition reference and blocks allocation, reservation, issue and sale even when a DA-RM has accepted the goods into physically on-hand stock.
- Signed resolution is allowed on an acknowledged DA in `acknowledged`, `partially_received`, `received` or `closed_short` state. `apply` changes `uninterpreted` to `bounded` or `unrestricted`, or refines `bounded` to `bounded`. Newly bounded terms require an interpretation linked to the retained source condition. `audit_review` records the exact existing `uninterpreted` restriction when terms remain inexpressible and leaves it blocked. A foreign or unknown line returns `404 resource_not_found`. A disallowed prior/next pair returns `409 invalid_transition`. Future DA-RMs take the latest effective restriction from the DA line. Ordinary stock hold clearance and manual allocation overrides cannot change donor restrictions.
- Leader serializes DA-RM posting, cancellation and restriction resolution on the same DA row and holds current authority/policy and relevant evidence locks before inventory. Efren's `applyLotRestrictionResolution` locks the matching remaining stockroom segments in deterministic lot/segment ID order. It rechecks chapter/DA/line provenance and prior terms and updates only those segments. Zero already-posted segments is a successful result. Preserve custody, quantity, movements, reservations and independent `StockHold`s. Recompute affected eligibility and derived blocked balances. Issues still check current restrictions against existing reservations. A participant conflict aborts the outer action.

### Recovery, events and downstream acceptance

- Scope receipts to chapter, immutable actor, operation ID and action key. Fingerprint the target and validated payload. After rechecking current authority, replay the original status and receipt with `X-Action-Replayed: true` for an identical intent before checking new-intent versions or state. Changed targets or payloads yield `409 action_key_conflict`. A rejected or rolled-back write leaves its key unconsumed. On timeout or `503`, look up the receipt by `operation_name` and query `action_key` or by receipt ID. Only the original actor with current originating action and linked scopes can recover it. Absent, uncommitted and foreign receipts return `404 operation_not_found` after chapter admission. Re-fetch current DA before another action.
- Enqueue `stage2.donation.changed.v1` for committed DA actions and DA-RM progress and `stage1.stock-lot.changed.v1` for lots changed by an applied resolution. Audit-only reviews emit a DA change. Publish after commit. Replay, recovery and rejected actions enqueue nothing. Ticket 07 owns the event registry and safe refresh mappings.
- Downstream authenticated HTTP/MySQL tests cover once-only concurrent acknowledgment and numbering, DA-RM versus resolution serialization, immutable paper binding, actor/chapter recovery, and same-variant unrestricted, restricted and uninterpreted stock. Exercise resolution with active holds and existing reservations and verify an inexpressible review leaves stock blocked. Glenn and Efren's team sign-off is part of the combined contract handoff.

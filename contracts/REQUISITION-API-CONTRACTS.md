# YSP Chapter Operations — Requisition (`ModRF`) API Contracts & Routes

| Field | Value |
| --- | --- |
| Status | Reconciled API Contract Specification (Review Candidate — No Application Code Created) |
| Date | 24 October 2026 |
| Owning Module | `ModRF` (Requisitions and Fulfillment), coordinating `ModInventory`, `ModPurchasing`, `ModBooth`, and `ModDocs` |
| Requirements Authority | [PRD.md](./PRD.md) v1.2; [TRD.md](./TRD.md) v2.1; [APP-FLOW.md](./APP-FLOW.md); [BACKEND-ARCHITECTURE.md](./BACKEND-ARCHITECTURE.md); [DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md) v1.1 |
| Requirement Trace | `RF-01–RF-08`, `INV-01–INV-12`, `DOC-01–DOC-11`, `GOV-01–GOV-10`, `PRC-01–PRC-03`, `BTH-01–BTH-02`, `BTH-14`, `TR-01–TR-18`, `TR-30`, `AC-01–AC-02`, `AC-12`, `AC-14–AC-16`, `ADD-02–ADD-04`, `ADD-06–ADD-08` |
| Screens Covered | `S-02` (My Work), `S-03` (RF List & Editor), `S-04` (Demand Workspace), `S-07` (Allocation & Handover Batch), `S-09` (Reservations & Shortages), `S-10` (RepF Workspace Handoff), `S-14` (Booth Event & Checkout) |
| Journeys Covered | `F-02` (Internal Requisition & Repeated Partial Issue), `F-05` (Shortage Procurement Handoff), `F-07` (Booth Checkout), `F-08` (Signed Physical Handover), `F-11` (Drafts, Conflicts & Retries) |

---

## 1. Domain Invariants & Architectural Rules for Requisitions

Every endpoint in the Requisition module (`ModRF`) enforces the following non-negotiable rules from the reconciled baseline:

1. **Three-Tier RBAC & Tenancy Isolation (`GOV-01–GOV-07`, `TR-17`, `UI-Q26`):**
   - **Tier 1 (Tenancy):** All routes are strictly scoped to `{chapterId}` and verified against an active row in `memberships`. Cross-chapter links or reads are rejected at both the application operation layer and MySQL composite foreign keys (`UNIQUE(chapter_id, id)`). Provider roles (`provisioner`, `billing_admin`, `recovery_operator`) grant **zero** implicit access (`GOV-03`).
   - **Tier 2 (Canonical Duties):** Operations check active `duty_grants` for `COMMITTEE_REQUESTER`, `RF_APPROVER`, `INVENTORY`, `DISPATCH`, `PURCHASING`, `BOOTH_CUSTODIAN`, `INDEPENDENT_REVIEWER`, or `CHAPTER_HEAD`.
   - **Tier 3 (Contextual Independence — `GOV-05`):**
     - **Requester $\neq$ Approver (`RF-02`, `RF-03`):** The individual user approving an RF (`approval_decisions.approver_user_id`) **must not** be the requester (`requisitions.requester_user_id`) or the version preparer (`record_versions.prepared_by_attribution_id -> user_id`). Holding both `COMMITTEE_REQUESTER` and `RF_APPROVER` duties on the same account never satisfies independent approval.
     - **Allocation Override Independence (`GOV-10`, `INV-09`):** Manual allocation priority overrides require an authorized approver independent of the preparer.
2. **Entitlement & Rollout Stage Gate (`SUB-01–SUB-04`, `MIG-05`, `TR-30`):**
   - Live RF mutations (`business_posting`) require **Gate 2** (`MIG-05`: internal requisition, reservations, procurement, receiving) to be activated in `rollout_activations` and an active subscription/trial window in `chapter_subscriptions`.
   - During the 14-elapsed-day unpaid grace period (`SUB-03`), all `POST`/`PUT`/`DELETE` business postings return `423 Locked` (`ENTITLEMENT_READ_ONLY_GRACE`), while `GET` queries and PDF/CSV exports (`scoped_output`) remain permitted.
3. **RF Reservations Have No Unpaid 48-Hour Expiry Clock (`INV-03`, `INV-06`, `RSV-01`, `RES-03`):**
   - Unlike Track 1 Sales Orders (`SO`), internal/booth Requisitions (`RF`) reserve stock in `stock_positions.reserved_rf_qty` with `reservations.unpaid_expires_at = NULL`.
   - Reservations reduce `available_to_allocate` (`on_hand - reserved_rf - reserved_so - blocked + blocked_reserved_intersections`) without reducing physical `on_hand_qty` (`RES-01`).
4. **Chapter-Funded Shortage Procurement (`RF-05`, `PRC-01`, `RES-09`, `ADD-AC-11`):**
   - Uncovered RF shortages trigger a Replenishment Request (`RepF`, `replenishment_triggers.trigger_kind = 'rf'`) funded by **chapter budget** (`funding_source = 'chapter'`).
   - RF shortages **never** require buyer deposits or Official Receipts (`OR`).
5. **Bounded Donor Restriction Eligibility (`RCV-12`, `INV-02`, `DB-Q1`, `AC-12`):**
   - Stock allocation checks `lot_restriction_assignments -> restriction_versions`.
   - Internal RFs (`purpose_kind = 'internal'`) require `allow_internal = 1`.
   - Booth RFs (`purpose_kind = 'booth'`) require `allow_booth = 1` **and** `allow_sale = 1`.
   - If `event_scope = 'listed'`, the RF's `event_id` must exist in `restriction_event_scopes`. If `unit_scope = 'listed'`, the RF's `requesting_unit_id` must exist in `restriction_unit_scopes`. Uninterpreted donor conditions (`interpretation_state = 'blocked'`) are strictly excluded from allocation.
6. **Repeated Partial Signed Issues & Dual-Mode Signatures (`RF-04`, `RF-06`, `RF-07`, `DOC-08`, `TR-15`, `UI-Q23`):**
   - Printing an Issue Slip (`IS`), uploading a scan, or drawing on the canvas pad **alone does not post a stock movement** (`INV-08`).
   - Posting an `IS_AR` handover batch requires:
     1. Ready evidence (`evidence_objects.lifecycle = 'ready'`) with server-computed SHA-256 `content_hash` pinned in `evidence_bindings.bound_hash`.
     2. Recipient acknowledgment (`acknowledgments`) via **Method A (`canvas`)** (HTML5 Canvas with quadratic Bezier smoothing + PNG export) or **Method B (`paper`)** (wet-signed paper scan/photo upload), pinning `acknowledged_snapshot_hash` to the exact recipient and batch quantities.
     3. Any change to batch quantities or recipient invalidates the prior `acknowledged_snapshot_hash` and requires fresh signature evidence (`ADD-AC-05`).
   - Partial batches require explicit recipient partial acceptance and **never** default to marking the entire RF fulfilled (`Q12`, `RF-06`).
7. **Booth-Purpose RF Custody & Closure (`BTH-01`, `BTH-02`, `BTH-14`, `RF-08`):**
   - For `purpose_kind = 'internal'`, the `IS_AR` handover posts `action_code = 'rf_issue'` (`movement_kind = 'internal_issue'`, `from_position_id = stockroom`, `to_position_id = NULL`), deducting stockroom `on_hand_qty` and `reserved_rf_qty`.
   - For `purpose_kind = 'booth'`, the `IS_AR` handover posts `action_code = 'booth_checkout'` (`movement_kind = 'booth_checkout'`, `from_position_id = stockroom`, `to_position_id = booth`), transferring stock out of stockroom `on_hand_qty` into `booth_custody` (`stock_locations.location_kind = 'booth'`) and creating a `booth_checkouts` record.
   - A booth-purpose RF **cannot** transition to `closed` until its linked `booth_events` record satisfies `BTH-14` (all checkouts, sales, independent closing counts, usable returns, variances/damages, and float/remittances reconciled).

---

## 2. Transport, Precision & Envelope Conventions (`TR-03`, `TR-07`, `TR-12`)

### 2.1 Request Headers

| Header | Requirement | Purpose |
| --- | --- | --- |
| `Cookie` | Mandatory | `HttpOnly`, `Secure`, `SameSite=Lax` session cookie backed by MySQL `sessions` (`TR-16`). |
| `X-XSRF-TOKEN` | Mandatory on mutations | CSRF protection token (`TR-16`). |
| `Accept` | Mandatory | `application/json` |
| `Content-Type` | Mandatory on body requests | `application/json` (or `multipart/form-data` on paper scan upload staging). |
| `Idempotency-Key` | Mandatory on all `POST`/`PUT`/`DELETE` mutations | Client-generated unique key (e.g., ULID/UUID `K(128)`), scoped to `U(chapter_id, action_code, idempotency_key)` in `operations` (`TR-12`). |
| `X-Client-Attempt-Id` | Optional / Recommended on physical handovers | 26-char ULID (`CHAR(26)`) linking uncertain physical handover attempts to `real_world_attempts` (`F-08`, `F-11`). |
| `X-Exercised-Duty` | Optional | Canonical role code (e.g., `COMMITTEE_REQUESTER`, `RF_APPROVER`, `INVENTORY`) when an officer holds multiple duties (`Q1`). Server still validates actual `duty_grants` and identity independence (`TR-17`). |

### 2.2 Precision & Serialization Rules (`DATABASE-SCHEMA.md §2.1, §2.3`, `TR-07`)

- **Identifiers (`ID`):** All `BIGINT UNSIGNED` database IDs are serialized as **strings** in JSON (e.g., `"1042"`) to prevent IEEE-754 precision loss.
- **Quantities (`Q` — `DECIMAL(20,6)`):** Serialized as decimal strings (e.g., `"25.000000"` or `"25"`). Server validates that `qty == TRUNCATE(qty, units.quantity_scale)` before SQL binding and via `BEFORE INSERT/UPDATE` database triggers. Pieces and kits (`quantity_scale = 0`) strictly reject fractional quantities.
- **Money & Valuation (`M` — `DECIMAL(20,2)`, `P` — `DECIMAL(20,6)`):** Serialized as strings with explicit `"currency": "PHP"`. Note: `demand_lines` on RF have `unit_price = null`, `discount_amount = null`, `line_total = null`; estimated cost appears only when an uncovered shortage is calculated in `RepF`.
- **Timestamps (`T` — `DATETIME(6)`):** Stored and transmitted in UTC ISO-8601 format (`"2026-10-24T06:15:30.123456Z"`). The UI renders timestamps in `Asia/Manila` (`UTC+08:00`) and explicitly labels whether a timestamp represents `occurred_at` (actual physical event), `entered_at` (data entry), or `posted_at` / `committed_at` (ledger commitment).
- **Untrusted Client Fields (`TR-03`):** The server ignores or rejects any client-supplied `chapter_id` body override, `approval_state`, `stock_state`, `fulfilled_qty`, `available_qty`, `content_hash`, or `actor_attribution_id`.

### 2.3 Standard Success Mutation Envelope

All state-changing endpoints (`POST`, `PUT`, `DELETE`) execute inside **one operation-owned MySQL transaction** (`TR-10`) and return:

```json
{
  "operation": {
    "public_id": "01JAZ9K4M2N8P5Q7R9S1T3V5W7",
    "action_code": "rf.submit",
    "idempotency_key": "idem_rf_submit_01JAZ9K4",
    "outcome": "committed",
    "committed_at": "2026-10-24T01:15:00.000000Z",
    "replayed": false
  },
  "chapter": {
    "id": "1",
    "code": "CEBU",
    "name": "YSP Cebu Chapter"
  },
  "actor_attribution": {
    "id": "8801",
    "user_id": "12",
    "actor_name": "Maria Santos",
    "duty_code": "COMMITTEE_REQUESTER",
    "execution_kind": "officer",
    "captured_at": "2026-10-24T01:15:00.000000Z"
  },
  "record": {
    "id": "5001",
    "record_kind": "RF",
    "reference": "CEB-RF-2026-0042",
    "row_version": 2,
    "current_material_version": 1,
    "approval_state": "submitted",
    "fulfillment_state": "unissued",
    "exception_state": "none"
  },
  "data": {},
  "durable_tasks_queued": [
    {
      "task_id": "9102",
      "task_kind": "work_queue.refresh_rf_review",
      "execution_policy": "essential_control"
    }
  ]
}
```

### 2.4 Standard Error, Conflict & Blocker Envelope (`Q10`, `Q17`, `DOC-11`, `UX-02`)

When an action is blocked by validation, stale `row_version`/`material_version`, missing policy, independence rules, or stock competition, the API returns a structured error that preserves user input and provides the current authorized state for comparison:

```json
{
  "error": {
    "code": "STALE_RECORD_VERSION",
    "http_status": 409,
    "message": "This requisition was updated by another officer. Review the current authorized values before resubmitting.",
    "blocking_reason_code": "CHANGED_STOCK_OR_VERSION",
    "responsible_duty": "COMMITTEE_REQUESTER",
    "correction_link": "/chapters/1/requisitions/5001",
    "operation_public_id": "01JAZ9M0X1Y2Z3A4B5C6D7E8F9",
    "field_errors": {},
    "conflict_comparison": {
      "expected_row_version": 2,
      "actual_row_version": 3,
      "expected_material_version": 1,
      "actual_material_version": 2,
      "current_authorized_snapshot": {
        "approval_state": "returned",
        "return_reason": "Please reduce requested quantity of YSP Polo Shirt (M) to 15 pcs for Phase 1."
      }
    }
  }
}
```

---

## 3. Complete Route Inventory for Requisitions (`ModRF`)

All routes are prefixed with `/api/v1/chapters/{chapterId}` and pass through the shared transport pipeline:
`['web', 'auth.session', 'chapter.membership', 'chapter.control_guard']`.

### 3.1 Route Summary Table

| # | HTTP Method & URI | Action Code | Screen | Authorized Duties (`duty_grants`) | Execution Policy | Trace |
| --- | --- | --- | --- | --- | --- | --- |
| **R-01** | `GET /requisitions` | `rf.list` | `S-02`, `S-03` | `COMMITTEE_REQUESTER` (unit-scoped), `RF_APPROVER`, `INVENTORY`, `DISPATCH`, `PURCHASING`, `BOOTH_CUSTODIAN`, `CHAPTER_HEAD`, `FINANCE` | `scoped_read` | `RF-01`, `UI-Q21`, `SEC-03` |
| **R-02** | `GET /requisitions/form-options` | `rf.form_options` | `S-03` | `COMMITTEE_REQUESTER`, `BOOTH_CUSTODIAN`, `INVENTORY`, `CHAPTER_HEAD` | `scoped_read` | `RF-01`, `GOV-08`, `INV-01` |
| **R-03** | `POST /requisitions/drafts` | `rf.create_draft` | `S-03` | `COMMITTEE_REQUESTER`, `BOOTH_CUSTODIAN` | `business_posting` | `RF-01`, `DOC-04`, `Q6` |
| **R-04** | `PUT /requisitions/{rfId}/draft` | `rf.save_draft` | `S-03`, `S-04` | `COMMITTEE_REQUESTER`, `BOOTH_CUSTODIAN` (preparer/unit) | `business_posting` | `RF-01`, `DOC-04`, `Q6`, `Q17` |
| **R-05** | `DELETE /requisitions/{rfId}/draft` | `rf.discard_draft` | `S-03`, `S-04` | `COMMITTEE_REQUESTER`, `BOOTH_CUSTODIAN` (preparer/unit) | `business_posting` | `DOC-04`, `Q6`, `Q17` |
| **R-06** | `POST /requisitions/{rfId}/submit` | `rf.submit` | `S-03`, `S-04` | `COMMITTEE_REQUESTER`, `BOOTH_CUSTODIAN` | `business_posting` | `RF-01`, `DOC-01`, `DOC-03`, `DOC-04` |
| **R-07** | `GET /requisitions/{rfId}` | `rf.show_summary` | `S-04` (Tab 1) | Any RF-authorized duty within scope | `scoped_read` | `DOC-02`, `Q10`, `UI-Q22`, `ADD-03` |
| **R-08** | `GET /requisitions/{rfId}/lines-and-clocks` | `rf.show_lines` | `S-04` (Tab 2), `S-09` | Any RF-authorized duty within scope | `scoped_read` | `RF-04–RF-07`, `INV-03`, `UI-Q22` |
| **R-09** | `GET /requisitions/{rfId}/documents` | `rf.show_documents` | `S-04` (Tab 3) | Any RF-authorized duty within scope | `scoped_read` | `DOC-02`, `DOC-06–DOC-08`, `UI-Q22` |
| **R-10** | `GET /requisitions/{rfId}/history` | `rf.show_history` | `S-04` (Tab 4) | Any RF-authorized duty within scope | `scoped_read` | `DOC-04–DOC-05`, `DOC-09–DOC-10`, `UI-Q22` |
| **R-11** | `POST /requisitions/{rfId}/review` | `rf.review` | `S-04` | `RF_APPROVER`, `CHAPTER_HEAD` (MFA required; `actor != requester`) | `business_posting` | `RF-02`, `RF-03`, `GOV-05`, `Q11`, `AC-14` |
| **R-12** | `POST /requisitions/{rfId}/revise` | `rf.revise` | `S-03`, `S-04` | `COMMITTEE_REQUESTER`, `BOOTH_CUSTODIAN` | `business_posting` | `RF-03`, `DOC-05`, `AC-14` |
| **R-13** | `GET /requisitions/{rfId}/cancellation-preview` | `rf.cancel_preview` | `S-04` | `COMMITTEE_REQUESTER`, `RF_APPROVER`, `INVENTORY`, `CHAPTER_HEAD` | `scoped_read` | `RF-03`, `RF-08`, `Q11` |
| **R-14** | `POST /requisitions/{rfId}/cancel` | `rf.cancel` | `S-04` | `COMMITTEE_REQUESTER`, `RF_APPROVER`, `CHAPTER_HEAD` | `business_posting` | `RF-03`, `RF-06`, `RF-08`, `DOC-09` |
| **R-15** | `GET /requisitions/{rfId}/allocation-proposal` | `rf.allocation_proposal` | `S-04`, `S-07`, `S-09` | `INVENTORY`, `DISPATCH`, `PURCHASING`, `RF_APPROVER` | `scoped_read` | `RF-04`, `INV-02–INV-09`, `Q12`, `AC-12` |
| **R-16** | `POST /requisitions/{rfId}/allocate` | `rf.allocate_stock` | `S-04`, `S-07`, `S-09` | `INVENTORY` | `business_posting` | `RF-04`, `RF-05`, `INV-04–INV-06`, `AC-01` |
| **R-17** | `POST /requisitions/{rfId}/reservations/{reservationId}/override` | `rf.override_allocation` | `S-07`, `S-09` | `RF_APPROVER`, `CHAPTER_HEAD` (MFA required; independent of `INVENTORY` preparer) | `business_posting` | `GOV-10`, `INV-09` |
| **R-18** | `POST /requisitions/{rfId}/shortage-repf` | `rf.trigger_shortage_repf` | `S-04`, `S-09`, `S-10` | `INVENTORY`, `PURCHASING` | `business_posting` | `RF-05`, `PRC-01–PRC-03`, `INV-11–INV-12`, `AC-11`, `AC-16` |
| **R-19** | `POST /requisitions/{rfId}/handovers/prepare` | `rf.handover_prepare` | `S-07`, `S-14` | `INVENTORY`, `DISPATCH` | `business_posting` | `RF-04`, `RF-06`, `BTH-02`, `DOC-06`, `Q12`, `Q16` |
| **R-20** | `POST /requisitions/{rfId}/handovers/{handoverId}/evidence` | `rf.handover_bind_evidence` | `S-07`, `S-14` | `INVENTORY`, `DISPATCH`, `COMMITTEE_REQUESTER`, `BOOTH_CUSTODIAN` | `business_posting` | `DOC-08`, `TR-15`, `Q5`, `Q16`, `UI-Q23`, `ADD-04` |
| **R-21** | `POST /requisitions/{rfId}/handovers/{handoverId}/confirm` | `rf.handover_confirm` | `S-07`, `S-14` | `INVENTORY`, `DISPATCH` | `business_posting` | `RF-04`, `RF-06`, `RF-07`, `BTH-02`, `INV-07–INV-10`, `TR-11` |
| **R-22** | `GET /requisitions/{rfId}/handovers/{handoverId}/pdf` | `rf.handover_pdf` | `S-04`, `S-07`, `S-14` | `COMMITTEE_REQUESTER`, `RF_APPROVER`, `INVENTORY`, `DISPATCH`, `BOOTH_CUSTODIAN`, `CHAPTER_HEAD` | `scoped_output` | `DOC-06`, `RPT-07`, `TR-04`, `F-10` |
| **R-23** | `POST /requisitions/{rfId}/close` | `rf.close` | `S-04` | `INVENTORY`, `RF_APPROVER`, `CHAPTER_HEAD` | `business_posting` | `RF-08`, `BTH-14`, `TR-09` |
| **R-24** | `GET /operations/{idempotencyKey}` | `ops.lookup` | Shared (`S-02–S-22`) | Authenticated member of `{chapterId}` with access to target record | `essential_control` | `DOC-11`, `TR-03`, `TR-12`, `F-11`, `ADD-AC-06` |
| **R-25** | `POST /requisitions/{rfId}/real-world-attempts` | `rf.report_uncertain_handover` | `S-07`, `S-02` | `INVENTORY`, `DISPATCH`, `BOOTH_CUSTODIAN`, `COMMITTEE_REQUESTER` | `essential_control` | `DOC-08`, `SEC-06`, `TR-11`, `F-08`, `F-11` |

---

## 4. Declarative Route Structure Specification (Laravel Blueprint)

> [!NOTE]
> The route map below defines the exact endpoint hierarchy, parameter constraints, and middleware bindings for the Requisition module (`ModRF`). It is documented here as part of the API contract specification.

```text
Prefix: /api/v1/chapters/{chapterId}
Parameter Constraints:
  - chapterId: ^[0-9]+$
  - rfId: ^[0-9]+$
  - reservationId: ^[0-9]+$
  - handoverId: ^[0-9]+$
  - idempotencyKey: ^[A-Za-z0-9_\-\.:]{8,128}$

Base Middleware Stack:
  1. session.auth          (Validates active user session, users.status = 'active', users.auth_version)
  2. chapter.tenancy       (Validates active memberships row for chapterId and memberships.authority_version)
  3. chapter.control_guard (Checks chapter_control_guards and operational_blocks for maintenance/recovery holds)

Route Group: Requisitions (/requisitions)
├── [Policy: scoped_read | Permitted during live trial, paid subscription, and 14-day unpaid grace]
│   ├── GET    /                                                -> RequisitionQueryController@index              [duty:rf.view_list]
│   ├── GET    /form-options                                    -> RequisitionQueryController@formOptions        [duty:rf.prepare_or_view]
│   ├── GET    /{rfId}                                          -> RequisitionWorkspaceController@summary        [duty:rf.view_record]
│   ├── GET    /{rfId}/lines-and-clocks                         -> RequisitionWorkspaceController@linesAndClocks [duty:rf.view_record]
│   ├── GET    /{rfId}/documents                                -> RequisitionWorkspaceController@documents      [duty:rf.view_record]
│   ├── GET    /{rfId}/history                                  -> RequisitionWorkspaceController@history        [duty:rf.view_record]
│   ├── GET    /{rfId}/cancellation-preview                     -> RequisitionCancelController@preview           [duty:rf.cancel_or_review]
│   └── GET    /{rfId}/allocation-proposal                      -> RequisitionAllocationController@proposal      [duty:rf.allocate_or_view]
│
├── [Policy: scoped_output | Permitted during live, paid, and 14-day grace; rechecks access before URL issue]
│   └── GET    /{rfId}/handovers/{handoverId}/pdf               -> RequisitionHandoverController@downloadPdf     [duty:rf.view_handover]
│
├── [Policy: business_posting | Requires Gate 2 active + live trial/paid subscription + Idempotency-Key]
│   ├── POST   /drafts                                          -> RequisitionDraftController@store              [duty:COMMITTEE_REQUESTER|BOOTH_CUSTODIAN]
│   ├── PUT    /{rfId}/draft                                    -> RequisitionDraftController@update             [duty:COMMITTEE_REQUESTER|BOOTH_CUSTODIAN]
│   ├── DELETE /{rfId}/draft                                    -> RequisitionDraftController@destroy            [duty:COMMITTEE_REQUESTER|BOOTH_CUSTODIAN]
│   ├── POST   /{rfId}/submit                                   -> RequisitionSubmitController@submit            [duty:COMMITTEE_REQUESTER|BOOTH_CUSTODIAN]
│   ├── POST   /{rfId}/review                                   -> RequisitionReviewController@review            [duty:RF_APPROVER|CHAPTER_HEAD, mfa.verified, invariant:not_requester_or_preparer]
│   ├── POST   /{rfId}/revise                                   -> RequisitionRevisionController@revise          [duty:COMMITTEE_REQUESTER|BOOTH_CUSTODIAN]
│   ├── POST   /{rfId}/cancel                                   -> RequisitionCancelController@cancel            [duty:COMMITTEE_REQUESTER|RF_APPROVER|CHAPTER_HEAD]
│   ├── POST   /{rfId}/allocate                                 -> RequisitionAllocationController@allocate      [duty:INVENTORY]
│   ├── POST   /{rfId}/reservations/{reservationId}/override    -> RequisitionAllocationController@override      [duty:RF_APPROVER|CHAPTER_HEAD, mfa.verified, invariant:not_preparer]
│   ├── POST   /{rfId}/shortage-repf                            -> RequisitionShortageController@createOrLinkRepf[duty:INVENTORY|PURCHASING]
│   ├── POST   /{rfId}/handovers/prepare                        -> RequisitionHandoverController@prepare         [duty:INVENTORY|DISPATCH]
│   ├── POST   /{rfId}/handovers/{handoverId}/evidence          -> RequisitionHandoverController@bindEvidence    [duty:INVENTORY|DISPATCH|COMMITTEE_REQUESTER|BOOTH_CUSTODIAN]
│   ├── POST   /{rfId}/handovers/{handoverId}/confirm           -> RequisitionHandoverController@confirm         [duty:INVENTORY|DISPATCH]
│   └── POST   /{rfId}/close                                    -> RequisitionClosureController@close            [duty:INVENTORY|RF_APPROVER|CHAPTER_HEAD]
│
└── [Policy: essential_control | Permitted even during grace/holds for reconciliation & retry safety]
    ├── GET    /api/v1/chapters/{chapterId}/operations/{idempotencyKey} -> OperationLookupController@show        [auth.session, chapter.tenancy]
    └── POST   /{rfId}/real-world-attempts                      -> RequisitionHandoverController@reportAttempt   [duty:INVENTORY|DISPATCH|BOOTH_CUSTODIAN|COMMITTEE_REQUESTER]
```

---

## 5. Detailed Endpoint Contracts

### 5.1 Requisition List, Filtering & Form Options (`S-02`, `S-03`)

#### **R-01: `GET /api/v1/chapters/{chapterId}/requisitions`**
Lists requisitions visible to the authenticated officer's duties (`S-03` list and `S-02` filtered work queue).
- **Scoping Rule (`SEC-03`, `Q8`, `UI-Q26`):**
  - If the user holds a chapter-wide duty (`RF_APPROVER` with `scope_kind = 'chapter'`, `INVENTORY`, `DISPATCH`, `PURCHASING`, `CHAPTER_HEAD`, `FINANCE`), returns all chapter RFs matching filters.
  - If the user holds a unit-scoped `COMMITTEE_REQUESTER` or unit-scoped `RF_APPROVER` grant (`duty_grants.scope_kind = 'unit'`), filters strictly to `requisitions.requesting_unit_id IN (authorized_unit_ids)` or `requisitions.requester_user_id = current_user_id`.

**Query Parameters:**
| Parameter | Type | Allowed Values / Description |
| --- | --- | --- |
| `queue_bucket` | `string?` | `needs_my_action`, `waiting_on_others`, `resolved_history`, `all` (default: `all`; supports zero-reload `filterQueue` per `UI-Q21`) |
| `approval_state` | `string?` | Comma-separated: `draft,submitted,returned,held,approved,rejected,canceled` |
| `fulfillment_state` | `string?` | Comma-separated: `unissued,partial,complete` |
| `stock_state` | `string?` | Comma-separated: `unchecked,short,partial,ready` |
| `exception_state` | `string?` | Comma-separated: `none,open,resolving,resolved` |
| `purpose_kind` | `string?` | `internal` or `booth` |
| `requesting_unit_id` | `string?` | `BIGINT` ID of requesting unit/committee |
| `event_id` | `string?` | `BIGINT` ID of chapter event |
| `search` | `string?` | Matches `records.reference`, `requisitions.recipient_name`, or SKU |
| `date_basis` | `string?` | `required_at`, `submitted_at`, `updated_at` (default: `required_at`) |
| `date_from` / `date_to` | `string?` | ISO-8601 UTC date/time |
| `cursor` / `per_page` | `string?` / `int?` | Cursor pagination (default `per_page = 25`, max `100`) |

**Response `200 OK`:**
```json
{
  "chapter": {
    "id": "1",
    "code": "CEBU",
    "name": "YSP Cebu Chapter"
  },
  "filters_applied": {
    "queue_bucket": "needs_my_action",
    "purpose_kind": null,
    "requesting_unit_id": "10"
  },
  "summary_counts": {
    "uncertain_outcomes": 0,
    "needs_my_action": 2,
    "waiting_on_others": 4,
    "resolved_history": 19
  },
  "items": [
    {
      "record_id": "5001",
      "reference": "CEB-RF-2026-0042",
      "row_version": 3,
      "current_material_version": 1,
      "purpose_kind": "internal",
      "purpose": "Volunteer orientation kits for October batch",
      "requesting_unit": {
        "id": "10",
        "code": "MEM-COMM",
        "name": "Membership Committee"
      },
      "requester": {
        "user_id": "12",
        "name": "Maria Santos"
      },
      "recipient_name": "Maria Santos",
      "event": {
        "id": "301",
        "code": "OCT-ORIENT-2026",
        "name": "October Volunteer Orientation"
      },
      "booth_event_id": null,
      "required_at": "2026-10-28T01:00:00.000000Z",
      "submitted_at": "2026-10-24T01:15:00.000000Z",
      "updated_at": "2026-10-24T02:00:00.000000Z",
      "closed_at": null,
      "axes": {
        "approval_state": "approved",
        "stock_state": "partial",
        "fulfillment_state": "unissued",
        "exception_state": "none"
      },
      "line_totals": {
        "line_count": 2,
        "total_requested_qty": "50",
        "total_approved_qty": "50",
        "total_reserved_qty": "30",
        "total_shortage_qty": "20",
        "total_fulfilled_qty": "0",
        "total_canceled_qty": "0"
      },
      "next_action": {
        "work_item_id": "7701",
        "task_kind": "rf.issue_or_procure_shortage",
        "label": "Prepare partial IS/AR (30 ready) & forward shortage RepF (20 short)",
        "responsible_role": "INVENTORY",
        "due_at": "2026-10-28T01:00:00.000000Z",
        "is_uncertain_outcome": false,
        "can_current_user_execute": true
      }
    }
  ],
  "pagination": {
    "next_cursor": null,
    "has_more": false,
    "per_page": 25
  }
}
```

---

#### **R-02: `GET /api/v1/chapters/{chapterId}/requisitions/form-options`**
Returns approved configuration options needed by `S-03` to create or edit an RF, plus readiness status if any required setup policy is missing (`GOV-08`, `GOV-09`).

**Response `200 OK`:**
```json
{
  "readiness": {
    "rf_workflow_enabled": true,
    "rollout_stage": 2,
    "missing_policies": []
  },
  "authorized_requesting_units": [
    {
      "id": "10",
      "code": "MEM-COMM",
      "name": "Membership Committee"
    },
    {
      "id": "14",
      "code": "BOOTH-OPS",
      "name": "Events & Booth Operations"
    }
  ],
  "active_events": [
    {
      "id": "301",
      "code": "OCT-ORIENT-2026",
      "name": "October Volunteer Orientation",
      "starts_at": "2026-10-28T00:00:00.000000Z",
      "ends_at": "2026-10-28T10:00:00.000000Z",
      "booth_event": null
    },
    {
      "id": "305",
      "code": "SINULOG-BOOTH-2026",
      "name": "YSP Sinulog Youth Fair Booth",
      "starts_at": "2026-11-05T00:00:00.000000Z",
      "ends_at": "2026-11-06T12:00:00.000000Z",
      "booth_event": {
        "id": "801",
        "name": "Sinulog Youth Fair Booth #1",
        "venue": "Cebu IT Park Garden Bloc",
        "trading_state": "setup",
        "custodian_user_id": "14",
        "cashier_user_id": "15"
      }
    }
  ],
  "catalog_variants": [
    {
      "variant_id": "201",
      "item_id": "101",
      "item_code": "YSP-POLO",
      "sku": "YSP-POLO-NVY-M",
      "description": "YSP Official Chapter Polo Shirt - Navy Medium",
      "size": "M",
      "color": "Navy",
      "unit": {
        "id": "1",
        "code": "PC",
        "name": "Piece",
        "quantity_scale": 0
      },
      "item_policy_version_id": "410",
      "priority_category": {
        "id": "2",
        "code": "PROGRAM_CORE",
        "label": "Core Program Material",
        "rank": 1
      },
      "stock_summary": {
        "usable_on_hand_qty": "45",
        "available_internal_qty": "30",
        "available_booth_qty": "20",
        "rf_reserved_qty": "10",
        "so_reserved_qty": "5"
      }
    }
  ]
}
```

---

### 5.2 Draft Lifecycle & Submission (`S-03`, `S-04`, `RF-01`, `F-11`)

#### **R-03: `POST /api/v1/chapters/{chapterId}/requisitions/drafts`**
#### **R-04: `PUT /api/v1/chapters/{chapterId}/requisitions/{rfId}/draft`**
Creates (`POST`) or updates (`PUT`) an explicit RF draft (`Q6`, `Q17`).
- **Database Behavior (`DATABASE-SCHEMA.md §3.2`):**
  - On `POST`: Inserts `records` (`record_kind = 'RF'`, `approval_state = 'draft'`, `exception_state = 'none'`, `row_version = 1`, `current_material_version = NULL`) and `draft_payloads` (`schema_version = 1`, `payload = JSON`).
  - On `PUT`: Verifies `expected_row_version == records.row_version` under row lock. If mismatched, returns `409 Conflict` (`STALE_RECORD_VERSION`) with both versions so the officer never silently overwrites concurrent edits (`Q17`). Increments `records.row_version` and `draft_payloads.row_version`.
  - Drafts allow incomplete fields and **never** reserve stock or start approvals.

**Request Body (`POST` / `PUT`):**
```json
{
  "expected_row_version": 1,
  "draft": {
    "requesting_unit_id": "10",
    "purpose_kind": "internal",
    "event_id": "301",
    "booth_event_id": null,
    "recipient_name": "Maria Santos",
    "required_at": "2026-10-28T01:00:00.000000Z",
    "purpose": "Volunteer orientation kits for October batch",
    "lines": [
      {
        "client_line_key": "line-1",
        "record_line_id": null,
        "variant_id": "201",
        "requested_qty": "50",
        "notes": "For 50 confirmed inductees"
      }
    ]
  }
}
```

**Response `200 OK` / `201 Created`:**
Returns the Standard Mutation Envelope with `record.approval_state = "draft"`, `record.row_version`, and `data.draft_saved_at`.

---

#### **R-05: `DELETE /api/v1/chapters/{chapterId}/requisitions/{rfId}/draft`**
Discards an unsubmitted draft (`records.current_material_version IS NULL` and `approval_state = 'draft'`).
- **Rule (`DOC-09`):** Once an RF has been submitted (`current_material_version >= 1`), it **cannot** be deleted via `DELETE /draft`; it must use the formal cancellation endpoint (`POST /requisitions/{rfId}/cancel`) to preserve historical traceability.

---

#### **R-06: `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/submit`**
Validates all required fields (`DOC-03`, `RF-01`), materializes the typed RF rows, snapshots `material_version = 1`, generates `approval_requirements`, and transitions the RF to `submitted`.
- **Validation & Domain Checks:**
  1. `requesting_unit_id` must be active and within the requester's authorized `duty_grants`.
  2. `purpose_kind` must be `'internal'` or `'booth'`.
  3. **Booth-Purpose Constraint (`DATABASE-SCHEMA.md §4.3, §4.5`):** `purpose_kind == 'booth'` **iff** `booth_event_id IS NOT NULL`. Furthermore, `event_id` must match `booth_events.event_id`.
  4. `lines` must be non-empty; each `variant_id` must be active; each `requested_qty > 0` and must match `units.quantity_scale` (`0` fractional places for pieces/kits).
- **Atomic Database Writes (`TR-10`, `TR-11`):**
  1. Claims unique RF document number from `document_series` (`document_kind = 'RF'`) and sets `records.reference` (e.g., `"CEB-RF-2026-0042"`).
  2. Inserts or updates typed `requisitions` (`R(RF)`), `record_lines`, and `demand_lines` (`L(DEMAND)`, `demand_kind = 'RF'`, `requested_qty`, `approved_qty = 0`, `accepted_qty = 0`, `stock_state = 'unchecked'`, `payment_state = 'na'`).
  3. Inserts immutable `record_versions` (`material_version = 1`, canonical `material_snapshot` JSON, SHA-256 `material_hash`).
  4. Updates `records.current_material_version = 1`, `approval_state = 'submitted'`, `submitted_at = NOW(6)`.
  5. Inserts `approval_requirements` (`step_code = 'dept_rf_review'`, `required_role_id = RF_APPROVER`, `independence_rule = 'not_requester'`, `minimum_distinct_users = 1`).
  6. Inserts `record_events` (`event_code = 'rf.submitted'`) and `work_items` (`task_kind = 'rf.review_required'`, `responsible_role_id = RF_APPROVER`).

**Request Body:**
```json
{
  "expected_row_version": 2,
  "requesting_unit_id": "10",
  "purpose_kind": "internal",
  "event_id": "301",
  "booth_event_id": null,
  "recipient_name": "Maria Santos",
  "required_at": "2026-10-28T01:00:00.000000Z",
  "purpose": "Volunteer orientation kits for October batch (50 inductees)",
  "lines": [
    {
      "record_line_id": null,
      "variant_id": "201",
      "requested_qty": "50",
      "priority_category_id": "2"
    },
    {
      "record_line_id": null,
      "variant_id": "205",
      "requested_qty": "50",
      "priority_category_id": "2"
    }
  ]
}
```

**Response `200 OK`:**
```json
{
  "operation": {
    "public_id": "01JAZ9K4M2N8P5Q7R9S1T3V5W7",
    "action_code": "rf.submit",
    "idempotency_key": "idem_rf_submit_5001_v1",
    "outcome": "committed",
    "committed_at": "2026-10-24T01:15:00.000000Z",
    "replayed": false
  },
  "record": {
    "id": "5001",
    "record_kind": "RF",
    "reference": "CEB-RF-2026-0042",
    "row_version": 3,
    "current_material_version": 1,
    "approval_state": "submitted",
    "fulfillment_state": "unissued",
    "exception_state": "none"
  },
  "data": {
    "material_version": 1,
    "material_hash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "approval_requirements": [
      {
        "requirement_id": "3101",
        "step_code": "dept_rf_review",
        "required_role_code": "RF_APPROVER",
        "independence_rule": "not_requester",
        "minimum_distinct_users": 1,
        "status": "pending",
        "blocked_user_ids": ["12"]
      }
    ]
  }
}
```

---

### 5.3 Demand Workspace 4-Tab Queries (`S-04`, `UI-Q22`, `ADD-03`)

To support zero-flicker in-place tab switching (`switchDemandTab`) in `S-04`, the workspace exposes dedicated endpoints for its four canonical tabs while preserving persistent header/axes state.

#### **R-07: `GET /api/v1/chapters/{chapterId}/requisitions/{rfId}` (Tab 1: Summary & Review)**
Returns the persistent workspace header, independent state axes (`TR-09`), review panel (`Q11`), active blockers with correction links (`Q10`), and eligible actions for the current user's duties.

**Response `200 OK`:**
```json
{
  "workspace_header": {
    "record_id": "5001",
    "record_kind": "RF",
    "reference": "CEB-RF-2026-0042",
    "chapter": { "id": "1", "code": "CEBU", "name": "YSP Cebu Chapter" },
    "row_version": 4,
    "current_material_version": 1,
    "axes": {
      "approval_state": "approved",
      "stock_state": "partial",
      "fulfillment_state": "partial",
      "exception_state": "none",
      "booth_close_state": null
    },
    "closure": {
      "is_closed": false,
      "closed_at": null,
      "closure_blockers": [
        {
          "code": "OUTSTANDING_DEMAND_REMAINDER",
          "message": "20 pcs of YSP-POLO-NVY-M remain unissued (covered by RepF CEB-REPF-2026-0009)."
        }
      ]
    }
  },
  "summary": {
    "purpose_kind": "internal",
    "purpose": "Volunteer orientation kits for October batch (50 inductees)",
    "requesting_unit": { "id": "10", "code": "MEM-COMM", "name": "Membership Committee" },
    "requester": { "user_id": "12", "name": "Maria Santos", "duty_code": "COMMITTEE_REQUESTER" },
    "recipient_name": "Maria Santos",
    "event": { "id": "301", "code": "OCT-ORIENT-2026", "name": "October Volunteer Orientation" },
    "booth_event": null,
    "required_at": "2026-10-28T01:00:00.000000Z",
    "submitted_at": "2026-10-24T01:15:00.000000Z",
    "approved_at": "2026-10-24T01:45:00.000000Z"
  },
  "approval_panel": {
    "material_version": 1,
    "material_hash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "requirements": [
      {
        "requirement_id": "3101",
        "step_code": "dept_rf_review",
        "required_role_code": "RF_APPROVER",
        "independence_rule": "not_requester",
        "is_satisfied": true,
        "decisions": [
          {
            "decision_id": "4101",
            "decision": "approve",
            "approver_user_id": "15",
            "approver_name": "Carlo Mendoza",
            "duty_code": "RF_APPROVER",
            "occurred_at": "2026-10-24T01:45:00.000000Z",
            "reason": "Approved for October orientation batch."
          }
        ]
      }
    ]
  },
  "permitted_actions": {
    "can_edit_draft": false,
    "can_review": { "allowed": false, "blocked_reason": "Already approved for material version 1." },
    "can_revise": { "allowed": true, "duty_code": "COMMITTEE_REQUESTER" },
    "can_cancel_remainder": { "allowed": true, "duty_code": "COMMITTEE_REQUESTER" },
    "can_allocate_stock": { "allowed": true, "duty_code": "INVENTORY" },
    "can_prepare_handover": { "allowed": true, "duty_code": "INVENTORY" },
    "can_trigger_repf": { "allowed": false, "blocked_reason": "Shortage of 20 pcs is already covered by active RepF CEB-REPF-2026-0009 (INV-12)." }
  }
}
```

---

#### **R-08: `GET /api/v1/chapters/{chapterId}/requisitions/{rfId}/lines-and-clocks` (Tab 2: Lines & Clocks)**
Returns line-by-line quantities, demand portions, active RF reservations (`unpaid_expires_at: null`), source lot provenance/restrictions, and shortage coverage (`S-04`, `S-09`).

**Response `200 OK`:**
```json
{
  "record_id": "5001",
  "material_version": 1,
  "clock_policy_note": "RF reservations do not carry the 48-hour unpaid SO expiry clock (INV-03, RSV-01).",
  "lines": [
    {
      "demand_line_id": "6001",
      "line_no": 1,
      "variant": {
        "id": "201",
        "sku": "YSP-POLO-NVY-M",
        "description": "YSP Official Chapter Polo Shirt - Navy Medium",
        "unit_code": "PC",
        "quantity_scale": 0
      },
      "priority_category": { "id": "2", "code": "PROGRAM_CORE", "rank": 1 },
      "required_at": "2026-10-28T01:00:00.000000Z",
      "quantities": {
        "requested_qty": "50",
        "approved_qty": "50",
        "accepted_qty": "50",
        "reserved_active_qty": "10",
        "fulfilled_qty": "20",
        "canceled_qty": "0",
        "remaining_unissued_qty": "30",
        "uncovered_shortage_qty": "0",
        "covered_shortage_qty": "20"
      },
      "axes": {
        "stock_state": "partial",
        "exception_state": "none"
      },
      "portions": [
        {
          "portion_id": "7001",
          "portion_kind": "available",
          "accepted_qty": "30",
          "fulfilled_qty": "20",
          "canceled_qty": "0"
        },
        {
          "portion_id": "7002",
          "portion_kind": "backorder",
          "accepted_qty": "20",
          "fulfilled_qty": "0",
          "canceled_qty": "0"
        }
      ],
      "reservations": [
        {
          "reservation_id": "8001",
          "portion_id": "7001",
          "position_id": "901",
          "lot_id": "501",
          "lot_origin_kind": "rm",
          "restriction_summary": "Donation DA-2026-0004: Internal & Orientation Events Only",
          "qty": "30",
          "consumed_qty": "20",
          "released_qty": "0",
          "remaining_reserved_qty": "10",
          "status": "partial",
          "protection_kind": "none",
          "reserved_at": "2026-10-24T01:50:00.000000Z",
          "unpaid_expires_at": null
        }
      ],
      "shortage_supply_coverage": [
        {
          "supply_claim_id": "4401",
          "repf_id": "5200",
          "repf_reference": "CEB-REPF-2026-0009",
          "repf_budget_state": "approved",
          "po_id": "5300",
          "po_reference": "CEB-PO-2026-0007",
          "claimed_qty": "20",
          "received_allocated_qty": "0",
          "state": "active"
        }
      ]
    }
  ]
}
```

---

#### **R-09: `GET /api/v1/chapters/{chapterId}/requisitions/{rfId}/documents` (Tab 3: Connected Documents)**
Returns all linked records across the transaction graph (`DOC-02`, `Q3`, `UI-Q22`):
- Issued/prepared `IS_AR` handover batches (`handovers`), their signature `acknowledgments`, and `inventory_postings`
- Linked `REPF` and `PO` records for shortages
- Linked `BOOTH` checkout and close-out summaries (when `purpose_kind = 'booth'`)

---

#### **R-10: `GET /api/v1/chapters/{chapterId}/requisitions/{rfId}/history` (Tab 4: Version & Approval Audit History)**
Returns the immutable chain of `record_versions`, `approval_decisions`, and `record_events` (`DOC-04`, `DOC-05`, `DOC-10`).

---

### 5.4 Independent Review, Revision & Cancellation (`S-04`, `RF-02`, `RF-03`, `GOV-05`, `AC-14`)

#### **R-11: `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/review`**
Records an explicit review decision (`approve`, `return`, `hold`, `reject`) against the current `material_version` (`Q11`). No bulk approval is permitted.
- **Security & Independence Gates (`GOV-05`, `SEC-01`, `TR-16`, `TR-17`):**
  1. Approver's session must have a verified MFA timestamp (`sessions.mfa_authenticated_at IS NOT NULL`).
  2. Approver must hold an active `duty_grants` row for `RF_APPROVER` (matching the RF's `requesting_unit_id` if unit-scoped) or `CHAPTER_HEAD`.
  3. **Strict Self-Approval Block (`GOV-05`):** If `current_user.id == requisitions.requester_user_id` OR `current_user.id == current_version.prepared_by_user_id`, reject with `403 Forbidden` (`SELF_APPROVAL_PROHIBITED`), even if the user holds `RF_APPROVER` or `CHAPTER_HEAD`.
  4. `material_version` in request must match `records.current_material_version` and `material_hash` must match `record_versions.material_hash`.
  5. For `return`, `hold`, or `reject`, `reason` is mandatory and non-empty.
- **Atomic Database Writes:**
  - Appends row to `approval_decisions` (`decision`, `duty_grant_id`, `approver_user_id`, `policy_version_id`, `decision_snapshot`).
  - If `decision == 'approve'`:
    - Sets `records.approval_state = 'approved'`.
    - Sets `demand_lines.approved_qty` and `demand_lines.accepted_qty = approved_qty`, `approved_at = NOW(6)`. (If reviewer approved modified line quantities, requires a new `record_versions` snapshot or returns for revision per policy).
    - Creates `work_items` for `INVENTORY` (`task_kind = 'rf.allocate_eligible_stock'`).
  - If `decision == 'return'`:
    - Sets `records.approval_state = 'returned'`. Preserves `records.reference` and `records.id` (`RF-03`).
    - Creates `work_items` for `COMMITTEE_REQUESTER` (`task_kind = 'rf.revision_required'`).

**Request Body:**
```json
{
  "expected_row_version": 3,
  "material_version": 1,
  "requirement_id": "3101",
  "decision": "approve",
  "reason": "Verified against October Volunteer Orientation budget and inductee roster."
}
```

**Error Example (`403 Forbidden` — Same User Holds Both Requester and Approver Duties):**
```json
{
  "error": {
    "code": "INDEPENDENT_APPROVER_REQUIRED",
    "http_status": 403,
    "message": "Requesters and version preparers cannot approve their own Requisition Form (GOV-05). Another authorized officer holding RF_APPROVER or CHAPTER_HEAD must review this request.",
    "blocking_reason_code": "SOLE_SELF_APPROVAL_BLOCKED",
    "responsible_duty": "RF_APPROVER",
    "correction_link": "/chapters/1/administration/memberships"
  }
}
```

---

#### **R-12: `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/revise`**
Revises and resubmits a `returned` RF—or submits a material change to an `approved` RF (`RF-03`, `DOC-05`, `AC-14`).
- **Material Change Reapproval Rule (`DOC-05`):**
  - Creates a new immutable `record_versions` row (`material_version = previous + 1`, `previous_version = previous`, `change_reason`).
  - Invalidates prior version approvals by generating fresh `approval_requirements` for `material_version = N` and resetting `records.approval_state = 'submitted'`.
  - If the RF already had active uncommitted `reservations` on a line whose quantity was reduced or variant retired, releases the excess reservation quantity under lock and appends `reservation_events` (`event_code = 'released'`). Already issued (`fulfilled_qty`) quantities cannot be reduced below `fulfilled_qty`.

**Request Body:**
```json
{
  "expected_row_version": 4,
  "previous_material_version": 1,
  "change_reason": "Reduced navy medium polo quantity from 50 to 35 per department head feedback.",
  "requesting_unit_id": "10",
  "purpose_kind": "internal",
  "event_id": "301",
  "booth_event_id": null,
  "recipient_name": "Maria Santos",
  "required_at": "2026-10-28T01:00:00.000000Z",
  "purpose": "Volunteer orientation kits for October batch (35 inductees)",
  "lines": [
    {
      "record_line_id": "6001",
      "variant_id": "201",
      "requested_qty": "35",
      "priority_category_id": "2"
    },
    {
      "record_line_id": "6002",
      "variant_id": "205",
      "requested_qty": "35",
      "priority_category_id": "2"
    }
  ]
}
```

---

#### **R-13: `GET /api/v1/chapters/{chapterId}/requisitions/{rfId}/cancellation-preview`**
#### **R-14: `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/cancel`**
Previews (`GET`) and executes (`POST`) full RF cancellation (when `fulfilled_qty == 0`) or formal cancellation of the unissued remainder (when `fulfilled_qty > 0`, `RF-03`, `RF-06`, `RF-08`, `Q11`).
- **Atomic Cancellation Rules:**
  - `reason` is mandatory and non-empty.
  - Releases all active unconsumed `reservations` (`released_qty = qty - consumed_qty`, `status = 'released'`), decrements `stock_positions.reserved_rf_qty`, and restores `available_to_allocate` without altering `on_hand_qty` (`INV-04`, `AC-14`).
  - If an open `supply_claims` / `RepF` exists for the canceled shortage:
    - If no `PO` has been issued yet, releases the `supply_claims` (`state = 'resolved'`, `event_code = 'released'`).
    - If a `PO` is already issued/committed, flags the linked `RepF`/`PO` for Purchasing review (`PRC-08`) while canceling the RF's demand remainder.
  - If `total_fulfilled_qty == 0`, transitions `records.approval_state = 'canceled'` and `records.closed_at = NOW(6)`.
  - If `total_fulfilled_qty > 0` (partial issue already occurred), keeps `approval_state = 'approved'`, sets `demand_lines.canceled_qty = approved_qty - fulfilled_qty`, transitions `requisitions.fulfillment_state = 'complete'`, and closes the RF (`RF-08`) unless blocked by an open booth event (`BTH-14`).

**Request Body (`POST /cancel`):**
```json
{
  "expected_row_version": 5,
  "cancel_scope": "unissued_remainder",
  "reason": "Remaining 20 orientation kits no longer needed; event attendance finalized at 30.",
  "lines": [
    {
      "demand_line_id": "6001",
      "cancel_qty": "20"
    }
  ]
}
```

---

### 5.5 Stock Eligibility, Reservation & Shortage Procurement (`S-07`, `S-09`, `S-10`, `RF-04`, `RF-05`, `INV-02–INV-09`)

#### **R-15: `GET /api/v1/chapters/{chapterId}/requisitions/{rfId}/allocation-proposal`**
Computes a non-committing proposal of eligible lots/positions (`stock_positions`), donor restrictions (`restriction_versions`), competing higher-priority demands (`INV-09`), and resulting shortage split (`Q12`).

**Response `200 OK`:**
```json
{
  "record_id": "5001",
  "material_version": 1,
  "lines": [
    {
      "demand_line_id": "6001",
      "variant_id": "201",
      "sku": "YSP-POLO-NVY-M",
      "approved_qty": "50",
      "already_reserved_qty": "0",
      "already_fulfilled_qty": "0",
      "needed_qty": "50",
      "proposed_reservable_qty": "30",
      "proposed_shortage_qty": "20",
      "priority_explanation": "Rank 1 (PROGRAM_CORE), Required 2026-10-28, Approved 2026-10-24T01:45:00Z",
      "eligible_positions": [
        {
          "position_id": "901",
          "lot_id": "501",
          "location": { "id": "1", "code": "MAIN-STOCKROOM", "location_kind": "stockroom" },
          "condition_code": "usable",
          "on_hand_qty": "30",
          "reserved_rf_qty": "0",
          "reserved_so_qty": "0",
          "blocked_qty": "0",
          "available_to_allocate_qty": "30",
          "proposed_allocate_qty": "30",
          "restriction": {
            "restriction_version_id": "12",
            "name": "DA-2026-0004 Youth Orientation Grant",
            "allow_internal": true,
            "allow_sale": false,
            "allow_booth": false,
            "event_scope": "listed",
            "unit_scope": "listed",
            "is_eligible": true
          }
        }
      ],
      "ineligible_positions_excluded": [
        {
          "position_id": "904",
          "lot_id": "508",
          "on_hand_qty": "25",
          "exclusion_reason_code": "QUARANTINED_CONDITION",
          "exclusion_explanation": "25 pcs are in condition 'quarantine' (INV-14) and cannot be allocated."
        }
      ]
    }
  ]
}
```

---

#### **R-16: `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/allocate`**
Commits eligible RF stock reservations and records any uncovered shortage portions inside a single locked transaction (`RF-04`, `RF-05`, `INV-05`, `TR-10`, `AC-01`, `AC-12`).
- **Locking Order (`DATABASE-SCHEMA.md §10.1`):**
  1. User & membership authority shared lock; `chapter_control_guards` & `chapter_subscriptions` shared lock.
  2. `records` (`rfId`), `requisitions`, and `demand_lines` exclusive lock (`FOR UPDATE`).
  3. `item_variants` and `allocation_groups` guard rows exclusive lock (`FOR UPDATE`) in ascending `variant_id`.
  4. `stock_lots`, `lot_restriction_assignments`, and `stock_positions` exclusive lock (`FOR UPDATE`) in ascending `id`.
- **Invariants Enforced at Commit Time:**
  - Re-evaluates `available_to_allocate` under row lock. If a concurrent officer (`AC-01`) just claimed the last units, returns `409 Conflict` (`INSUFFICIENT_ELIGIBLE_STOCK`) with the fresh `available_to_allocate_qty` and permits partial reservation without over-allocating.
  - Verifies bounded donor restriction predicates (`DB-Q1`, `AC-12`).
  - Creates `demand_portions` (`available` vs `backorder`/shortage).
  - Inserts `reservations` with `unpaid_expires_at = NULL`, `protection_kind = 'none'`, `status = 'active'`, and `reservation_events` (`event_code = 'created'`).
  - Updates `stock_positions.reserved_rf_qty = reserved_rf_qty + allocated_qty` (checking `reserved_rf_qty + reserved_so_qty <= on_hand_qty`).

**Request Body:**
```json
{
  "expected_row_version": 4,
  "material_version": 1,
  "allocations": [
    {
      "demand_line_id": "6001",
      "variant_id": "201",
      "position_allocations": [
        {
          "position_id": "901",
          "lot_id": "501",
          "reserve_qty": "30"
        }
      ],
      "shortage_qty": "20"
    }
  ]
}
```

**Response `200 OK`:**
Returns the Standard Mutation Envelope with created `reservations`, `demand_portions`, updated `stock_positions` projections, and shortage summary ready for `R-18` (`shortage-repf`) and `R-19` (`handovers/prepare`).

---

#### **R-18: `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/shortage-repf`**
Creates or links a chapter-funded Replenishment Request (`RepF`) for the uncovered shortage on an approved RF (`RF-05`, `PRC-01–PRC-03`, `INV-11–INV-12`, `RES-09`, `AC-11`, `AC-16`).
- **Invariants:**
  - Acquires `allocation_groups` and `supply_claims` locks (`TR-14`).
  - Verifies that the shortage quantity is not already covered by an active `supply_claims` row (`INV-12`, `AC-16`).
  - Sets `replenishment_requests.funding_source = 'chapter'` (or `'mixed'` if combined with funded SO triggers) and inserts `replenishment_triggers` (`trigger_kind = 'rf'`, `demand_record_id = rfId`, `backorder_id = NULL`).
  - **No buyer deposit or OR check is required** (`RF-05`, `ADD-AC-11`).

**Request Body:**
```json
{
  "expected_row_version": 5,
  "urgency": "normal",
  "existing_repf_id": null,
  "shortage_lines": [
    {
      "demand_line_id": "6001",
      "portion_id": "7002",
      "variant_id": "201",
      "request_repf_qty": "20",
      "unit_cost_estimate": "250.000000",
      "include_rop_target_topup": false
    }
  ]
}
```

---

### 5.6 Signed Physical Issue / Handover Batches (`IS/AR` & Booth Checkout) (`S-07`, `S-14`, `RF-04`, `RF-06–RF-07`, `BTH-02`, `DOC-08`, `TR-15`, `F-08`)

Physical fulfillment of an RF is strictly a **three-step gated flow** (`Prepare -> Bind Ready Signature Evidence -> Confirm Atomic Posting`) so that printing a form or uploading an image never prematurely deducts stock (`INV-08`, `Q16`).

#### **R-19: `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/handovers/prepare`**
Prepares a draft `IS_AR` handover batch (`handover_kind = 'internal_issue'` for internal RF, or `'booth_checkout'` for booth RF), reserves a document number in `document_number_claims`, validates batch quantities against active RF reservations, and returns the canonical `acknowledged_snapshot_hash` to display on the signature screen (`S-07`).
- **Rule (`Q12`, `RF-06`):** If `batch_qty < remaining_demand_qty`, sets `is_partial_batch = true` and requires recipient partial-acceptance acknowledgment. Never defaults a partial batch to completing the entire RF.

**Request Body:**
```json
{
  "expected_rf_row_version": 5,
  "handover_kind": "internal_issue",
  "recipient_name": "Maria Santos",
  "recipient_user_id": "12",
  "recipient_capacity": "Membership Committee Head",
  "booth_event_id": null,
  "opening_count_id": null,
  "custody_assignment_id": null,
  "batch_lines": [
    {
      "demand_line_id": "6001",
      "portion_id": "7001",
      "reservation_id": "8001",
      "variant_id": "201",
      "from_position_id": "901",
      "issue_qty": "30"
    }
  ]
}
```

**Response `201 Created`:**
```json
{
  "operation": {
    "public_id": "01JAZ9P1A2B3C4D5E6F7G8H9J0",
    "action_code": "rf.handover_prepare",
    "idempotency_key": "idem_rf_prep_5001_b1",
    "outcome": "committed",
    "committed_at": "2026-10-24T03:00:00.000000Z",
    "replayed": false
  },
  "data": {
    "handover_record_id": "5501",
    "record_kind": "IS_AR",
    "reserved_reference": "CEB-ISAR-2026-0018",
    "handover_kind": "internal_issue",
    "is_partial_batch": true,
    "posting_status": "prepared_not_posted",
    "recipient": {
      "name": "Maria Santos",
      "user_id": "12",
      "capacity": "Membership Committee Head"
    },
    "acknowledged_snapshot": {
      "chapter_id": "1",
      "rf_id": "5001",
      "rf_reference": "CEB-RF-2026-0042",
      "handover_record_id": "5501",
      "reserved_reference": "CEB-ISAR-2026-0018",
      "handover_kind": "internal_issue",
      "is_partial_batch": true,
      "recipient_name": "Maria Santos",
      "recipient_capacity": "Membership Committee Head",
      "lines": [
        {
          "demand_line_id": "6001",
          "variant_id": "201",
          "sku": "YSP-POLO-NVY-M",
          "lot_id": "501",
          "issue_qty": "30",
          "remaining_after_batch_qty": "20"
        }
      ]
    },
    "acknowledged_snapshot_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
}
```

---

#### **R-20: `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/handovers/{handoverId}/evidence`**
Stages, validates, and binds recipient signature evidence to the prepared `IS_AR` handover (`DOC-08`, `TR-15`, `UI-Q23`, `ADD-04`).
- **Supports Dual-Mode Signature Capture:**
  - **Method A (`method = "canvas"`):** Accepts quadratic Bezier-smoothed Canvas PNG (`base64` or staged `evidence_object_id`) plus optional structured stroke coordinates in `vector_data` JSON.
  - **Method B (`method = "paper"`):** Accepts a staged `evidence_object_id` (uploaded wet-signed paper scan/photo `image/png`, `image/jpeg`, or `application/pdf`).
- **Cryptographic Binding Invariant (`TR-15`, `RES-12`, `ADD-AC-05`):**
  1. Server validates the actual stored file bytes in private S3, computes SHA-256 `evidence_objects.content_hash`, and marks `evidence_objects.lifecycle = 'ready'`.
  2. Server recomputes the canonical `acknowledged_snapshot_hash` from the current prepared handover batch and verifies it equals the client-acknowledged `acknowledged_snapshot_hash`. If batch quantities or recipient changed since signing, rejects with `409 Conflict` (`SNAPSHOT_HASH_MISMATCH_RESIGN_REQUIRED`).
  3. Inserts `evidence_bindings` (`purpose_code = 'recipient_signature'`, `bound_hash = content_hash`) and `acknowledgments` (`method`, `signed_at`, `acknowledged_snapshot_hash`, `vector_data`).
  4. **Does NOT post inventory movement yet** (`INV-08`).

**Request Body (Method A — Canvas Pad):**
```json
{
  "expected_handover_row_version": 1,
  "method": "canvas",
  "recipient_name": "Maria Santos",
  "recipient_user_id": "12",
  "recipient_capacity": "Membership Committee Head",
  "signed_at": "2026-10-24T03:04:12.000000Z",
  "acknowledged_snapshot_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "accepts_partial_fulfillment": true,
  "canvas_payload": {
    "png_base64": "iVBORw0KGgoAAAANSUhEUgAA...",
    "vector_data": {
      "canvas_width": 600,
      "canvas_height": 220,
      "smoothing": "quadratic_bezier",
      "strokes": [
        { "points": [[42.1, 110.5], [48.4, 108.2], [55.0, 104.9]] }
      ]
    }
  }
}
```

**Request Body (Method B — Signed Paper Upload):**
```json
{
  "expected_handover_row_version": 1,
  "method": "paper",
  "recipient_name": "Maria Santos",
  "recipient_user_id": "12",
  "recipient_capacity": "Membership Committee Head",
  "signed_at": "2026-10-24T03:02:00.000000Z",
  "acknowledged_snapshot_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "accepts_partial_fulfillment": true,
  "paper_upload": {
    "staged_evidence_object_id": "9901"
  }
}
```

**Response `200 OK`:**
```json
{
  "operation": {
    "public_id": "01JAZ9Q8K1L2M3N4P5Q6R7S8T9",
    "action_code": "rf.handover_bind_evidence",
    "idempotency_key": "idem_rf_sig_5501_v1",
    "outcome": "committed",
    "committed_at": "2026-10-24T03:04:15.000000Z",
    "replayed": false
  },
  "data": {
    "handover_record_id": "5501",
    "acknowledgment_id": "6601",
    "evidence_binding_id": "7701",
    "evidence_object_id": "9902",
    "evidence_lifecycle": "ready",
    "content_hash": "4a7d1ed414474e4033ac29ccb8653d9b00000000000000000000000000000000",
    "acknowledged_snapshot_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "ready_to_confirm_posting": true
  }
}
```

---

#### **R-21: `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/handovers/{handoverId}/confirm`**
Commits the atomic `IS_AR` physical handover posting (`RF-04`, `RF-06`, `RF-07`, `BTH-02`, `INV-07–INV-10`, `TR-10–TR-12`, `F-08`).
- **Atomic Commit Boundary (`TR-11`, `DATABASE-SCHEMA.md §10.2`):**
  1. Rechecks authority, Gate 2 activation, subscription entitlement, `rfId` version, `handoverId` version, `acknowledgments.acknowledged_snapshot_hash`, and `evidence_objects.lifecycle == 'ready'`.
  2. Locks `reservations` and `stock_positions` (`FOR UPDATE`).
  3. Inserts `inventory_postings`:
     - `action_code = 'rf_issue'` (for `internal_issue`) or `'booth_checkout'` (for `booth_checkout`).
     - `source_batch_key` server-derived from `handoverId`.
  4. Inserts `inventory_movements`:
     - If `internal_issue`: `movement_kind = 'internal_issue'`, `from_position_id = stockroom_position`, `to_position_id = NULL`. Decrements `stock_positions.on_hand_qty` and `stock_positions.reserved_rf_qty`.
     - If `booth_checkout`: `movement_kind = 'booth_checkout'`, `from_position_id = stockroom_position`, `to_position_id = booth_position`. Decrements stockroom `on_hand_qty` and `reserved_rf_qty`; increments booth position `on_hand_qty` (View 5: `Booth Custody Stock`, `BTH-02`, `AC-05`). Inserts `booth_checkouts`.
  5. Inserts `handovers` and `handover_lines`.
  6. Updates `reservations.consumed_qty`, `demand_portions.fulfilled_qty`, `demand_lines.fulfilled_qty`, and `requisitions.fulfillment_state` (`'partial'` if remaining demand > 0, or `'complete'` if all approved demand is fulfilled/canceled).
  7. Finalizes `document_number_claims` (`state = 'issued'`) and inserts immutable `issued_documents` (`record_kind = 'IS_AR'`).
  8. Evaluates `INV-10` (Usable stockroom `on_hand_qty <= item_policy_versions.rop_qty`) and enqueues `durable_tasks` for low-stock alert / ROP evaluation if triggered.

**Request Body:**
```json
{
  "expected_rf_row_version": 5,
  "expected_handover_row_version": 2,
  "acknowledgment_id": "6601",
  "acknowledged_snapshot_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "actual_handover_at": "2026-10-24T03:04:12.000000Z"
}
```

**Response `200 OK`:**
```json
{
  "operation": {
    "public_id": "01JAZ9R5V6W7X8Y9Z0A1B2C3D4",
    "action_code": "rf.handover_confirm",
    "idempotency_key": "idem_rf_confirm_5501",
    "outcome": "committed",
    "committed_at": "2026-10-24T03:05:00.000000Z",
    "replayed": false
  },
  "record": {
    "id": "5001",
    "record_kind": "RF",
    "reference": "CEB-RF-2026-0042",
    "row_version": 6,
    "current_material_version": 1,
    "approval_state": "approved",
    "fulfillment_state": "partial",
    "exception_state": "none"
  },
  "data": {
    "handover_id": "5501",
    "issued_document_id": "3301",
    "display_reference": "CEB-ISAR-2026-0018",
    "handover_kind": "internal_issue",
    "inventory_posting_id": "7101",
    "posting_reference": "CEB-INV-2026-0112",
    "actual_handover_at": "2026-10-24T03:04:12.000000Z",
    "posted_at": "2026-10-24T03:05:00.000000Z",
    "lines_posted": [
      {
        "handover_line_id": "5601",
        "demand_line_id": "6001",
        "variant_id": "201",
        "lot_id": "501",
        "issued_qty": "30",
        "cumulative_fulfilled_qty": "30",
        "remaining_demand_qty": "20",
        "rop_triggered": true
      }
    ]
  }
}
```

---

### 5.7 Closure, Operation Lookup & Uncertain Physical Activity (`RF-08`, `F-08`, `F-11`, `TR-03`, `TR-12`)

#### **R-23: `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/close`**
Verifies record-specific closure predicates (`RF-08`, `BTH-14`, `DATABASE-SCHEMA.md §10.3`) and stamps `records.closed_at`.
- **Closure Predicates Checked Under Lock:**
  1. Every `demand_lines` row satisfies `fulfilled_qty + canceled_qty == approved_qty`.
  2. Every linked `reservations` row satisfies `consumed_qty + released_qty == qty` (`status IN ('fulfilled', 'released')`).
  3. `records.exception_state == 'none'` and no open `real_world_attempts` (`state IN ('uncertain', 'resolving')`) exist for this RF.
  4. **Booth RF Additional Gate (`BTH-14`):** If `requisitions.purpose_kind == 'booth'`, the linked `booth_events` row must have `stock_close_state == 'reconciled'`, `money_close_state == 'reconciled'`, `exception_state == 'none'`, and `closed_at IS NOT NULL`. If the booth event has open variances, damages, or unremitted cash/float, returns `422 Unprocessable Entity` (`BOOTH_CLOSEOUT_INCOMPLETE`).

---

#### **R-24: `GET /api/v1/chapters/{chapterId}/operations/{idempotencyKey}`**
Mandatory operation-outcome lookup (`TR-03`, `TR-12`, `F-11`, `Q17`, `ADD-AC-06`).
- When a mutation request times out or loses network connectivity, the React client **must** call this endpoint with the `Idempotency-Key` before offering any retry or allowing a second submission.
- **Response States:**
  - `outcome: "committed"` — Returns the original `result_snapshot` (filtered for current user authority) so the UI transitions directly to the committed state without re-submitting.
  - `outcome: "rejected"` — Returns the definitive rejection reason so the officer can correct input.
  - `outcome: "not_found"` — Confirms no transaction committed under that key; safe to retry with the identical `Idempotency-Key` and payload hash (or report a `real_world_attempt` if physical goods already changed hands).

---

#### **R-25: `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/real-world-attempts`**
Records an unconfirmed physical handover fact (`real_world_attempts`, `operational_blocks` with `block_kind = 'uncertain'`) when physical goods were already handed to the recipient prior to a connection drop, timeout, or stale-version conflict (`F-08`, `F-11`, `Q16`, `SEC-06`).
- **Rule:** Prevents the UI from instructing the officer to hand over a second batch of physical goods and pins the record to the top of `S-02 My Work` (`uncertain_outcomes` pinned first per `Q9`, `UI-Q21`).

**Request Body:**
```json
{
  "client_attempt_id": "01JAZ9T0M1N2P3Q4R5S6T7U8V9",
  "action_code": "rf.handover_confirm",
  "expected_operation_key": "idem_rf_confirm_5501",
  "actual_occurrence_at": "2026-10-24T03:04:30.000000Z",
  "evidence_binding_id": "7701",
  "facts": {
    "handover_record_id": "5501",
    "recipient_name": "Maria Santos",
    "physical_goods_handed_over": true,
    "lines": [
      { "variant_id": "201", "sku": "YSP-POLO-NVY-M", "qty": "30" }
    ],
    "notes": "Recipient signed paper IS/AR and took 30 shirts before mobile connection dropped."
  }
}
```

---

## 6. Standardized Blocking & Error Codes for `ModRF`

All blocking responses map directly to the officer feedback table in `APP-FLOW.md` (`Blocking feedback and next actions`):

| Error / Blocker Code | HTTP Status | Triggering Condition | Permitted Officer Next Step & Link | Trace |
| --- | --- | --- | --- | --- |
| `MISSING_APPROVED_POLICY` | `422` | Required unit precision, priority category, or item ROP/target policy is unapproved | Links to `S-21` Chapter Administration; allows saving RF draft | `GOV-08`, `GOV-09`, `MIG-01` |
| `STAGE_GATE_NOT_ACTIVATED` | `423` | Gate 2 (`MIG-05`) is not yet activated for the chapter | Links to `S-21` Readiness Checklist | `MIG-05`, `SUB-01` |
| `ENTITLEMENT_READ_ONLY_GRACE` | `423` | Chapter trial/subscription expired and is in 14-day unpaid grace | Allows `GET` and PDF/CSV export; blocks new postings | `SUB-03`, `TR-30` |
| `SOLE_SELF_APPROVAL_BLOCKED` | `403` | Approver `user_id` equals `requester_user_id` or `prepared_by_user_id` | Routes to another officer with `RF_APPROVER` or `CHAPTER_HEAD` | `GOV-05`, `RF-02` |
| `MFA_CHALLENGE_REQUIRED` | `403` | Approver session has not completed MFA authentication | Prompts MFA challenge (`S-01`) preserving form context | `SEC-01`, `TR-16` |
| `STALE_RECORD_VERSION` | `409` | `expected_row_version` or `material_version` differs from DB | Returns side-by-side `conflict_comparison` for review | `DOC-11`, `TR-10`, `Q17` |
| `INSUFFICIENT_ELIGIBLE_STOCK` | `409` | Concurrent allocation reduced `available_to_allocate` (`AC-01`) | Returns fresh availability; offers partial reservation + shortage split | `INV-05`, `AC-01`, `F-11` |
| `DONOR_RESTRICTION_INELIGIBLE` | `422` | Selected lot violates `allow_internal`/`allow_booth`, event/unit scope, or has `interpretation_state = 'blocked'` | Selects eligible lot or links to `S-13` Restriction Resolution (`DB-Q1`) | `INV-02`, `RCV-12`, `AC-12` |
| `DUPLICATE_SUPPLY_CLAIM_BLOCKED` | `409` | Shortage is already covered by an active `RepF` or `PO` (`supply_claims`) | Links to existing `RepF` (`S-10`) or requires approved additional-purchase reason | `INV-12`, `PRC-02`, `AC-16` |
| `SIGNATURE_EVIDENCE_NOT_READY` | `422` | `evidence_objects.lifecycle != 'ready'` or missing `acknowledgments` | Preserves batch input; prompts signature capture or upload retry (`S-07`) | `DOC-08`, `TR-15`, `ADD-AC-06` |
| `SNAPSHOT_HASH_MISMATCH_RESIGN_REQUIRED` | `409` | Batch quantities or recipient changed after `acknowledged_snapshot_hash` was signed | Prompts fresh recipient signature on the updated batch (`ADD-AC-05`) | `DOC-08`, `TR-15`, `RES-12` |
| `IDEMPOTENCY_PAYLOAD_MISMATCH` | `422` | Same `Idempotency-Key` reused with a different `payload_hash` | Instructs client to generate a new `Idempotency-Key` for modified payload | `TR-12`, `DOC-11` |
| `BOOTH_CLOSEOUT_INCOMPLETE` | `422` | Attempt to close a `purpose_kind = 'booth'` RF while `booth_events` has open stock/money closeout or variances | Links to `S-17` Booth Close-Out & `S-18` Variance ADJ | `RF-08`, `BTH-14`, `AC-06` |

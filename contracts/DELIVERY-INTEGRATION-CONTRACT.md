# Delivery / fulfillment integration contract (proposal)

**Status:** Proposed for review by the Sales, Requisitions and Inventory owners, plus the Documents/evidence owner. The route and payload below are a reviewable proposal, not an accepted interface or implementation authorization.

**23 October 2026 scoped decision:** Leader accepted action-aware lookup and explicit row/material versions in the [Stage 0 first-slice agreement](../docs/contracts/first-slice-agreement.md). Those shared conventions are reflected below. The handover route, payload as a whole and future source-operation assignments remain proposals; actual owner validation is pending.

## Purpose and boundary

Delivery/fulfillment owns the handover user experience, collection of actual quantities and recipient acknowledgment, and the typed client adapter. It is a workflow boundary, not a new backend module or persistence owner.

A handover can consume approved customer Sales demand or approved internal requisition demand. Delivery does not create, review or approve requisitions. Source-owning operations retain their workflow state and own the outer transaction:

- **Sales order:** Sales validates approval, buyer acceptance, remaining demand and verified financial release coverage.
- **Requisition:** Requisitions validates approval, authorized remaining quantity and closure rules; internal issue has no customer-payment gate.
- **Booth checkout:** Booth events require custody assignment and opening count verification before stockroom custody transfers to the booth.
- **Both/All:** Inventory revalidates eligible stock and posts the actual physical movement in the same transaction. Documents/evidence validates the acknowledgment binding. Client-supplied approval, coverage, stock allocation or status is never authoritative.

## Proposed versioned JSON API

These paths are proposed for owner review:

- `POST /api/v1/chapters/{chapterId}/handovers` records one actual signed handover batch.
- `GET /api/v1/chapters/{chapterId}/operations/by-key?action_code={action_code}&idempotency_key={idempotency_key}` provides an action-aware route for authorized terminal-result lookup after a timeout or lost response (matching `contracts/transport/v1/api-v1.json`). Lookup by known operation ID is also supported via `GET /api/v1/chapters/{chapterId}/operations/by-id/{operation_id}`.
- The Delivery adapter dispatches by source kind to the source-owning Sales or Requisitions application operation. The adapter does not coordinate separate commits.

### Requisition Lifecycle Alignment (`ModRF`)

For internal Requisitions (`source.kind = "requisition"`), the teammate-owned Requisition module (`contracts/REQUISITION-API-CONTRACTS.md`) specifies a fine-grained, 3-step staged workflow for screens `S-07` and `S-14`:
1. `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/handovers/prepare` (`R-19`): Stages the batch, reserves the `IS_AR` document number, and returns `acknowledged_snapshot_hash`.
2. `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/handovers/{handoverId}/evidence` (`R-20`): Binds dual-mode signature evidence (Method A Canvas pad PNG/vector or Method B scanned paper upload) to the snapshot hash.
3. `POST /api/v1/chapters/{chapterId}/requisitions/{rfId}/handovers/{handoverId}/confirm` (`R-21`): Commits the atomic inventory movement (`rf_issue` or `booth_checkout`), consumes reservations, and updates line fulfillment state.

The unified `POST /api/v1/chapters/{chapterId}/handovers` endpoint serves as the client facade / atomic dispatch contract for Delivery workflows (such as Track 1 customer sales releases and single-turn automated handover execution).

### Request

~~~http
POST /api/v1/chapters/{chapterId}/handovers
Idempotency-Key: <unique key for this exact handover attempt>
Content-Type: application/json
Accept: application/json
~~~

~~~json
{
  "source": {
    "kind": "sales_order",
    "id": "1042",
    "expected_row_version": 7,
    "expected_material_version": 3
  },
  "handover_kind": "customer_release",
  "recipient_name": "Maria Santos",
  "recipient_user_id": "12",
  "recipient_capacity": "Buyer / Authorized Representative",
  "actual_handover_at": "2026-10-22T09:30:00+08:00",
  "acknowledgment_id": "6601",
  "acknowledged_snapshot_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "booth_event_id": null,
  "opening_count_id": null,
  "custody_assignment_id": null,
  "lines": [
    {
      "source_line_id": "6001",
      "variant_id": "201",
      "actual_quantity": "2.000000"
    }
  ]
}
~~~

- Use `source.kind = "requisition"` and `handover_kind = "internal_issue"` for internal issues.
- Use `source.kind = "requisition"` and `handover_kind = "booth_checkout"` for booth event custody checkouts, providing `booth_event_id`, `opening_count_id`, and `custody_assignment_id`.
- Quantities are decimal strings (`DECIMAL(20,6)`) in the approved source-line unit and precision.
- The client submits actual handed-over quantities, source references, and signature acknowledgment proofs only; the server allocates lots/positions, validates stock eligibility, verifies payment coverage, and writes ledger movements under locks.
- Compare `expected_row_version` with current concurrency state and `expected_material_version` with the approved material snapshot; reject stale states with `409 Conflict`.

### Committed Response (`200 OK`)

Conforms to the shared TR-03 / `transport.schema.json` response envelope:

~~~json
{
  "schema_version": "1.0",
  "chapter_id": "1",
  "action_result": "success",
  "operation": {
    "identity": {
      "operation_id": "01JAZ9R5V6W7X8Y9Z0A1B2C3D4",
      "action_code": "sales.authorize_release",
      "idempotency_key": "idem_release_so_1042_b1"
    },
    "outcome": "committed",
    "committed_at": "2026-10-22T09:30:05.123456Z",
    "replayed": false
  },
  "record": {
    "id": "1042",
    "record_kind": "SO",
    "reference": "CEB-SO-2026-0089",
    "row_version": 8,
    "current_material_version": 3,
    "states": {
      "approval": "approved",
      "fulfillment": "partial",
      "exception": "none"
    }
  },
  "data": {
    "handover_id": "5501",
    "record_kind": "CUSTOMER_DR",
    "display_reference": "CEB-DR-2026-0045",
    "is_partial_batch": true,
    "actual_handover_at": "2026-10-22T09:30:00+08:00",
    "recipient": {
      "name": "Maria Santos",
      "user_id": "12",
      "capacity": "Buyer / Authorized Representative"
    },
    "lines": [
      {
        "source_line_id": "6001",
        "variant_id": "201",
        "sku": "YSP-POLO-NVY-M",
        "handed_over_qty": "2.000000",
        "remaining_unfulfilled_qty": "3.000000"
      }
    ],
    "inventory_movements": [
      {
        "movement_id": "9201",
        "posting_id": "8101",
        "movement_kind": "customer_release",
        "from_position_id": "901",
        "to_position_id": null,
        "qty": "2.000000"
      }
    ],
    "financial_coverage": {
      "coverage_consumed": {
        "currency": "PHP",
        "amount": "700.00"
      },
      "remaining_verified_coverage": {
        "currency": "PHP",
        "amount": "1050.00"
      }
    }
  },
  "field_feedback": [],
  "blocking_reason": null,
  "permitted_next_actions": [
    "delivery.view_dr_pdf",
    "sales.view_order_progress"
  ],
  "input_policy": "preserve",
  "lookup_state": "terminal"
}
~~~

### Blocked / Stale Response (`409 Conflict`)

~~~json
{
  "schema_version": "1.0",
  "chapter_id": "1",
  "action_result": "blocked",
  "operation": {
    "identity": {
      "operation_id": "01JAZ9R5V6W7X8Y9Z0A1B2C3E5",
      "action_code": "sales.authorize_release",
      "idempotency_key": "idem_release_so_1042_b1"
    },
    "outcome": "rejected",
    "committed_at": "2026-10-22T09:30:06.000000Z",
    "replayed": false
  },
  "record": {
    "id": "1042",
    "record_kind": "SO",
    "reference": "CEB-SO-2026-0089",
    "row_version": 8,
    "current_material_version": 3
  },
  "field_feedback": [],
  "blocking_reason": {
    "code": "INSUFFICIENT_PAYMENT_COVERAGE",
    "message": "Verified payment coverage is below the actual merchandise value of the release batch.",
    "conflict_comparison": {
      "required_coverage": { "currency": "PHP", "amount": "700.00" },
      "available_coverage": { "currency": "PHP", "amount": "500.00" }
    }
  },
  "permitted_next_actions": [
    "payments.verify_and_issue_or"
  ],
  "input_policy": "preserve",
  "lookup_state": "terminal"
}
~~~

## Validation and result behavior

- Recheck chapter membership, duty scope, independent actors where required, source approval/version, remaining line demand and current eligibility inside the owning transaction.
- For Sales, require any required buyer acceptance and verified release coverage at the approved price/discount basis. Consume coverage only for actual delivered quantities.
- For Requisitions, require approved internal demand and its eligible issue quantity; do not add a Sales payment requirement.
- Require ready, authorized, immutable evidence bound to the exact recipient and batch. Bind the validated evidence content hash and the acknowledged snapshot hash for that recipient and batch; hashes protect integrity but do not prove identity. A material change to quantity or recipient requires a new acknowledgment.
- Reject stale versions, ineligible or insufficient stock, exhausted demand, missing approvals/acceptance/coverage/evidence, and changed-payload idempotency-key reuse with a typed blocking result. Preserve input for correction.
- Preparation, printing, upload or signature capture alone does not post a movement. A signed DR records actual handover; it does not bypass release checks.
- If goods were physically handed over but the posting outcome is uncertain, preserve the physical fact in `real_world_attempts` for reconciliation. Do not prompt a second physical handover or let a retry duplicate stock movement, coverage consumption, receipt or number.

## Acceptance scenarios

1. Approved Sales demand with adequate verified coverage and ready evidence posts only the actual handed-over quantities.
2. A partial Sales handover consumes coverage only for that batch and leaves other accepted quantities and payment credit intact.
3. An internal requisition issue requires approved remaining demand and signed acknowledgment, without a customer-payment gate.
4. Insufficient or restricted stock, stale source version, missing acceptance/coverage or unready evidence blocks posting without a movement.
5. Same-key/same-payload retry returns the original result; same key with changed payload is rejected.
6. A lost response can be reconciled through authorized operation-result lookup without repeating a physical handover.
7. A handover for one chapter cannot read or mutate another chapter's source, evidence, movement or result.

**Traceability:** PRD RF-04–RF-08, SO-08–SO-10, INV-05–INV-08; DOC-06–DOC-08; APP-FLOW F-02, F-03 and F-08; TR-02–TR-03, TR-10–TR-11 and TR-15.

## Owner acceptance

Sales, Requisitions, Inventory and Documents/evidence owners must confirm the source identifiers, version semantics, operation ownership, request/response schema, route assignment and failure results. Record accepted revision, date, approver and scope in project docs. Until then, this remains a proposal and candidate-dependent production implementation remains gated.

# Delivery / fulfillment integration contract (proposal)

**Status:** Proposed for review by the Sales, Requisitions and Inventory owners, plus the Documents/evidence owner. The route and payload below are a reviewable proposal, not an accepted interface or implementation authorization.

**23 October 2026 scoped decision:** Leader accepted action-aware lookup and explicit row/material versions in the [Stage 0 first-slice agreement](../docs/contracts/first-slice-agreement.md). Those shared conventions are reflected below. The handover route, payload as a whole and future source-operation assignments remain proposals; actual owner validation is pending.

## Purpose and boundary

Delivery/fulfillment owns the handover user experience, collection of actual quantities and recipient acknowledgment, and the typed client adapter. It is a workflow boundary, not a new backend module or persistence owner.

A handover can consume approved customer Sales demand or approved internal requisition demand. Delivery does not create, review or approve requisitions. Source-owning operations retain their workflow state and own the outer transaction:

- **Sales order:** Sales validates approval, buyer acceptance, remaining demand and verified financial release coverage.
- **Requisition:** Requisitions validates approval, authorized remaining quantity and closure rules; internal issue has no customer-payment gate.
- **Both:** Inventory revalidates eligible stock and posts the actual physical movement in the same transaction. Documents/evidence validates the acknowledgment binding. Client-supplied approval, coverage, stock allocation or status is never authoritative.

## Proposed versioned JSON API

These paths are proposed for owner review:

- POST /api/v1/handovers records one actual handover.
- GET /api/v1/operations/by-idempotency-key/{key}?action={action} proposes an action-aware route for authorized terminal-result lookup after a timeout or lost response. Server-authorized chapter, action and key identify the attempt; a known operation ID also supports scoped lookup. No visible terminal result does not prove failure. The exact route remains proposed.
- The adapter dispatches by source kind to the source-owning Sales or Requisitions application operation. The adapter does not coordinate separate commits.

### Request

~~~http
POST /api/v1/handovers
Idempotency-Key: <unique key for this exact handover attempt>
Content-Type: application/json
~~~

~~~json
{
  "source": {
    "kind": "sales_order",
    "id": "source-record-id",
    "expected_row_version": 7,
    "expected_material_version": 3
  },
  "lines": [
    { "source_line_id": "source-line-id", "actual_quantity": "2.000" }
  ],
  "recipient_name": "Recipient as shown on the acknowledgment",
  "actual_handover_at": "2026-10-22T09:30:00+08:00",
  "acknowledgment_binding_id": "evidence-binding-id"
}
~~~

Use source.kind = "requisition" for an internal issue. Quantities are decimal strings in the approved source-line unit and precision. The client submits actual quantities and source references only; the server chooses and validates lot/position allocations. Bind chapter scope to the authorized operation context. Compare expected_row_version with current concurrency state and expected_material_version with the approved/evidence-bound material snapshot; check both where required. The sample versions are illustrative. Do not accept client-supplied approval, payment coverage, stock balance, or transaction status.

### Committed response

On success, return the operation ID, chapter, new source/record version, committed action result, null blocking reason, handover/document reference (customer DR or internal IS/AR as applicable), actual lines, movement references, remaining demand, and coverage consumed for a Sales release. A blocked result returns the operation ID when available, chapter, current record version, blocked action result, and a stable, chapter-scoped blocking reason. Do not return success until the owning transaction commits. Replays of the same key and payload return the original authorized response.

## Validation and result behavior

- Recheck chapter membership, duty scope, independent actors where required, source approval/version, remaining line demand and current eligibility inside the owning transaction.
- For Sales, require any required buyer acceptance and verified release coverage at the approved price/discount basis. Consume coverage only for actual delivered quantities.
- For Requisitions, require approved internal demand and its eligible issue quantity; do not add a Sales payment requirement.
- Require ready, authorized, immutable evidence bound to the exact recipient and batch. Bind the validated evidence content hash and the acknowledged snapshot hash for that recipient and batch; hashes protect integrity but do not prove identity. A material change to quantity or recipient requires a new acknowledgment.
- Reject stale versions, ineligible or insufficient stock, exhausted demand, missing approvals/acceptance/coverage/evidence, and changed-payload idempotency-key reuse with a typed blocking result. Preserve input for correction.
- Preparation, printing, upload or signature capture alone does not post a movement. A signed DR records actual handover; it does not bypass release checks.
- If goods were physically handed over but the posting outcome is uncertain, preserve the physical fact for reconciliation. Do not prompt a second physical handover or let a retry duplicate stock movement, coverage consumption, receipt or number.

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

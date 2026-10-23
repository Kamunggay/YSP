# Delivery / fulfillment integration contract (proposal)

**Status:** Proposed for review by the Sales, Requisitions and Inventory owners. This is not an accepted team interface yet. The route, payload and ownership split below must be confirmed before implementation depends on them.

## Purpose and boundary

This contract gives the assigned Delivery workflow a concrete way to record an actual signed handover for either an approved customer Sales order or an approved internal requisition. Delivery owns the handover user experience, collection of actual quantities/recipient acknowledgment, and the typed client adapter. It is not a new backend module or service.

The source-owning application operation remains responsible for its workflow state and owns the outer transaction:

- **Sales order:** Sales validates approved order state, buyer acceptance, remaining demand and required payment/release coverage.
- **Requisition:** the Requisitions owner validates approval and remaining authorized quantity. Internal issue does not require customer payment coverage.
- **Both:** Inventory revalidates eligible stock and posts the physical movement in that same transaction. Documents/evidence validates the acknowledgment binding. No client-supplied status, approval, coverage or stock claim is authoritative.

This preserves the backend architecture's one-transaction-owner rule and the schema's existing shared `handovers`, `handover_lines`, and `handover_receipts` records. It creates neither a separate Delivery persistence owner nor direct writes into teammate-owned tables.

## Proposed versioned API

These paths are a reviewable proposal, not an agreed endpoint assignment:

- `POST /api/v1/handovers` records one actual handover.
- `GET /api/v1/operations/by-idempotency-key/{key}` retrieves the authorized result after a timeout or lost response. The lookup is scoped to the active chapter and actor's authority.
- The API adapter dispatches by source kind to the owning Sales or Requisitions application operation. That operation owns the transaction; the HTTP adapter does not coordinate independent commits.

### Request

```http
POST /api/v1/handovers
Idempotency-Key: <unique key for this exact handover attempt>
Content-Type: application/json
```

```json
{
  "source": {
    "kind": "sales_order",
    "id": "source-record-id",
    "expected_version": 7
  },
  "lines": [
    { "source_line_id": "source-line-id", "actual_quantity": "2.000" }
  ],
  "recipient_name": "Recipient as shown on the acknowledgment",
  "actual_handover_at": "2026-10-22T09:30:00+08:00",
  "acknowledgment_binding_id": "evidence-binding-id"
}
```

For internal issues, `source.kind` is `requisition`. Quantity is a decimal string in the source line's approved unit and precision. The client submits only actual quantities and source references; the server chooses and validates lot/position allocations. The evidence binding must resolve to immutable, validated bytes and be bound to this exact source, recipient and actual line quantities before commit. A changed quantity requires evidence for the changed batch.

### Committed response

Return `201 Created` only when the handover, source progress, required coverage consumption, Inventory posting/movements, audit and operation result have committed together.

```json
{
  "operation_id": "operation-id",
  "outcome": "committed",
  "handover_id": "handover-id",
  "source": { "kind": "sales_order", "id": "source-record-id", "version": 8 },
  "lines": [
    {
      "source_line_id": "source-line-id",
      "committed_quantity": "2.000",
      "remaining_quantity": "1.000",
      "inventory_posting_id": "posting-id"
    }
  ],
  "acknowledgment_binding_id": "evidence-binding-id"
}
```

Do not expose or accept a client-calculated payment coverage result as authority. Sales returns a blocking result if actual quantities lack required coverage. A Requisition handover has no buyer-coverage fields.

## Validation and result behavior

- Recheck chapter and duty authority, source ownership/state/version, approval, remaining quantity, recipient, immutable evidence binding, stock eligibility, restrictions, and source-specific release rules at commit time under the appropriate locks.
- Reject stale source versions or insufficient remaining eligible quantities with a conflict response and stable machine-readable reason. Reject malformed quantities or missing/mismatched evidence as validation errors; reject unauthorized access without disclosing another chapter's data.
- A blocked operation commits no handover, movement, coverage consumption or source progress. Return the operation result and a reason safe for the caller.
- A repeated key with the same chapter, action and payload fingerprint returns the original authorized operation result; the same key with a different fingerprint is rejected. Persist key, fingerprint, result and writes atomically.
- If the physical handover may have happened but persistence/result is uncertain, show a reconciliation-required state. Look up the operation before any retry; never instruct the user to repeat the physical handover. Reconciliation records the original real-world fact and must not create a second movement.
- Preserve partial fulfillment: the response reports committed and remaining quantity per source line. A later handover is a distinct operation with its own evidence binding and idempotency key.

## Ownership and acceptance checklist

| Owner | Must confirm before implementation relies on this proposal |
| --- | --- |
| Sales | Source identifiers/version; accepted demand and buyer-acceptance rules; exact commit-time payment-coverage check; Sales operation owns the customer-release transaction. |
| Requisitions | Source identifiers/version; approved/remaining-quantity and closure rules; Requisitions operation owns the internal-issue transaction. |
| Inventory | Internal movement command/result; lot allocation and eligibility rules; posting idempotency; shared transaction participation without a second commit. |
| Delivery assignment | Client request/retry UX; actual quantity and recipient capture; evidence binding; blocked, partial and reconciliation states. |
| Documents/evidence owner | Evidence-binding lookup, immutability/hash validation, batch binding and acknowledgment requirements. |

Record each owner's acceptance or requested change alongside the implementation baseline decision. Until these checks are recorded, treat this document as an interface proposal and use fixtures only where an explicitly isolated test seam is needed.

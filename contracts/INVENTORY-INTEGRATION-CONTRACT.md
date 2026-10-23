# Inventory integration contract (proposal)

**Status:** Proposed for review by the Inventory owner and dependent module owners. This document describes an application-operation boundary; operation names are conceptual, and it does not assign final route or code names.

## Purpose and ownership

Inventory and custody owns stock provenance, eligibility, availability, reservations, accepted-stock postings, custody transfers, physical movements and inventory treatment of approved adjustments. Sales, Requisitions/fulfillment, Purchasing/Receiving coordination and Booth operations consume these operations through the Laravel application. They must not write inventory tables or balance projections directly.

The seven stock views remain distinct: usable stockroom on-hand, available-to-allocate, RF-reserved, SO-reserved, booth custody, quarantined/rejected and inbound open PO. These views overlap and must not be summed as separate physical quantities. Reservations affect availability, not on-hand. Inbound, quarantined and rejected goods are never available stock.

## Proposed operation contracts

These are logical application operations, not final symbols or endpoint assignments.

All versioned JSON operations use the shared response fields required by TR-03: operation ID, record version, chapter, action result and blocking reason. A successful response carries a null blocking reason; a blocked response carries a stable reason code and scoped explanation. Mutations accept an idempotency key and preserve entered input on failure.

| Operation | Input | Result and owner |
| --- | --- | --- |
| Read availability | Chapter scope, item/variant, purpose, requested quantity and optional source/lot constraints | Returns the seven named views, eligible quantities by source/lot/location, applicable restrictions and a freshness/version marker. A read does not reserve stock. |
| Commit or release reservation | Approved RF/SO source and line, quantity, purpose, effective policy and source version | Rechecks current authority, eligibility, remaining demand and competing commitments under locks. Returns reservation result, deadline/protection state, operation ID and blocking reason. Release changes availability only; it does not create a movement. |
| Post accepted receipt | One valid source path: approved PO plus supplier DR; authorized donation DA; or approved opening IPC. Also requires accepted RM, inspected actual quantities, condition, source and restrictions. | Posts only accepted quantities to the correct lot/location and updates applicable supply progress. Rejected, held or disputed quantities remain unavailable. Purchasing/Receiving owns its source workflow; the participating operation shares its transaction. |
| Post physical movement | Approved source, actual quantity, source/destination custody and condition, ready evidence and current version | Appends immutable movement history and updates controlled balance projections once. Used for signed issue/release, booth checkout/sale, accepted return or authorized adjustment, as applicable. |
| Record hold or count finding | Lot/location, observed condition or independent count evidence, reason and actor | Makes affected goods unavailable when policy requires and records the finding. A claim/count alone does not rewrite on-hand; correction requires authorized ADJ resolution. |

## Inputs and authority

- Every command carries chapter scope, actor context, source identity/version, exact decimal quantities in the approved unit precision, and the evidence required by its workflow.
- Recompute authority, independent approvals, source status, remaining demand and stock eligibility inside the owning application operation. Client-supplied balances, approval state, allocation choice or “verified” flags are never authoritative.
- Preserve source provenance, variant, lot, donor restriction, purpose, condition and location/custodian through every allocation and movement. An ordinary override cannot remove restrictions.
- Only accepted, usable receiving quantities become stock. An RF/SO, invoice, reservation, draft receiving record or printed handover form does not move stock.
- Booth checkout transfers stockroom custody to a named custodian. A booth sale reduces booth custody once and must not deduct stockroom stock again.

## Transaction, replay and failure behavior

- The application operation that owns the source workflow owns the outer transaction. Proposed ownership is Sales for its customer-release operation and Requisitions for its internal issue operation; Purchasing/Receiving ownership of receipt workflow must be confirmed. Inventory participates in that same transaction for stock checks, reservation/posting, balance changes, result and audit. Purely Inventory-owned postings use an Inventory operation as transaction owner. Confirm these assignments with the owners before implementation.
- Lock/recheck eligible balances and competing reservations before commitment or movement. Enforce nonnegative eligible balances and remaining-demand limits.
- Persist the chapter/action/idempotency key, payload fingerprint and committed result with the business writes. Same-payload retries return that result; changed payload reuse is rejected. A lost response requires operation-result lookup before retry.
- Return a typed blocking result for stale versions, insufficient or ineligible stock, invalid source/evidence, missing authority/approval, duplicate key with changed payload, or unresolved physical activity. Do not tell an operator to repeat a real-world handover when its posting outcome is uncertain.
- Keep immutable movement history; corrections use authorized linked reversals/ADJs rather than editing or deleting prior movements.

## Acceptance scenarios

1. With 10 usable units, 4 RF-reserved and 3 SO-reserved, on-hand remains 10 and available-to-allocate is 3.
2. Two concurrent commitments cannot reserve the same final eligible units; one succeeds and the other receives a blocking result.
3. Expiring an unpaid eligible SO reservation releases availability without changing on-hand; funded/paid quantities and RF reservations are unaffected by that timer.
4. Receiving a PO for 100 with 40 accepted posts exactly 40; the other 60 remain outstanding, and rejected/held goods remain unavailable.
5. A donor-restricted lot cannot satisfy an incompatible purpose even when another lot of the same item code is eligible.
6. Booth checkout and sale update their respective custody once, with no second stockroom deduction at close-out.
7. A repeated posting with the same idempotency key and payload returns the original movement; altered payload reuse is rejected.

**Traceability:** PRD INV-01–INV-14, RF-04–RF-08, SO-04/SO-08–SO-10, RCV-01–RCV-13 and ADJ-01–ADJ-10; TR-02–TR-03 and TR-06–TR-12; APP-FLOW F-02, F-03, F-06, F-07 and F-09.

## Approval and implementation gate

Inventory, Sales, Requisitions and Purchasing/Receiving owners must confirm the operations they call, transaction ownership, result schemas and acceptance scenarios. Record each accepted revision, date, approver and scope in project documentation. This proposal does not authorize behavior derived only from unsigned candidate requirements.

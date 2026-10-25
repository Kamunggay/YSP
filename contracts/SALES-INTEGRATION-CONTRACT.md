# Sales integration contract (proposal)

**Status:** Proposed for review by the Sales and Finance owners, Inventory owner and Delivery/fulfillment owner. Operation names are conceptual application boundaries; final routes and code symbols require owner agreement.

**23 October 2026 scoped decision:** The [Stage 0 first-slice agreement](../docs/contracts/first-slice-agreement.md) records Leader acceptance of shared Q1–Q6 conventions: action-aware operation lookup, explicit row/material versions and incremental P02–P06 contract scope. It does not accept the complete Sales/Finance interface or customer-release transaction assignment. Preserve this proposal for its later consumers; actual owner validation remains pending.

## Purpose and ownership

Sales and finance owns customer Sales orders (SO), Sales Invoices (SI), verified-payment records, Official Receipts (OR), payment allocations and release coverage, invoice adjustments/refunds, and financial reconciliation. Sales records and coordinates customer demand; it does not own inventory balances or physical movement history. Delivery collects actual handover details; Inventory revalidates and posts stock movements.

Requisitions, Purchasing/Receiving, Access/admin, Documents/evidence and Booth operations remain separate module dependencies. This contract grants no authority to access their tables or perform their workflows.

## Proposed operation contracts

All versioned JSON operations use the shared response fields required by TR-03: operation ID, record version, chapter, action result and blocking reason. A successful response carries a null blocking reason; a blocked response carries a stable reason code and scoped explanation. Mutations accept an idempotency key and preserve entered input on failure.

| Operation | Input | Result and boundary |
| --- | --- | --- |
| Submit or revise SO | Chapter/buyer, item and variant lines, exact quantities, approved price/discount/terms, requested date and pickup/delivery arrangement | Persists a versioned demand record. Material changes invalidate affected approval and require fresh review. |
| Approve SO | SO/version, reviewer authority and decision/reason | Records approval, return or cancellation with actor and history. Only approved demand can proceed to reservation or funding. |
| Commit SO demand | Approved SO/version, available-stock request, applicable expiry/protection policy | Coordinates with Inventory to recheck and reserve eligible available quantities, retain shortages separately, and record operation result in one transaction. Buyer acceptance and backorder deadlines remain distinct from the available-stock unpaid reservation timer. |
| Issue SI | Approved SO, current version, approved terms and line split | Issues the full-order billing record with available and backordered quantities visible. SI is not payment evidence and does not authorize release. |
| Verify payment and issue OR | Actual cash/official-account credit, amount/channel/reference/time, collector/verifier, evidence and numbering context | Records verified funds and issues/registers a unique OR only after verification. Pending screenshot/assertion creates no release authority or OR. |
| Allocate verified funds | OR/payment, SO lines or designated backorder, amount and allocation version | Maintains customer credit, procurement funding and release coverage as separate values. Prevents duplicate allocation and double use of coverage. |
| Authorize customer release | Approved SO/version, actual handover lines, current buyer acceptance, verified remaining coverage and ready recipient acknowledgment | Proposed transaction owner is the Sales application operation, subject to owner agreement. It rechecks demand, price/discount basis, coverage and remaining quantities; calls Inventory to revalidate and post actual movement; binds the evidence; consumes coverage only for quantities actually handed over. |
| Adjust or refund | Original SO/OR/payment, approved ADJ and Finance authority, exact amount/quantity and actual execution evidence when complete | Preserves original records and approval history. An approved refund remains distinct from a verified, executed refund. |

## Release and payment invariants

- An SI is a billing record; only verified funds support an OR. A screenshot, buyer assertion, pending bank/GCash check or unverified cash entry cannot authorize release.
- Release coverage is computed from current verified payment allocations and approved prices/discounts. A downpayment OR alone is insufficient unless it covers the actual merchandise value being released.
- Partial release consumes coverage only for actual quantities handed over. Preserve remaining payment, funded-backorder, paid-stock and canceled-quantity histories independently.
- Keep the 48-hour unpaid available-stock reservation timer separate from the accepted-backorder deposit timer. Do not expire paid/funded stock or commitments under the available-stock timer.
- Deposits remain customer credit against their SO even when they fund procurement. Procurement funding is not a second payment or charge.
- Recheck current authority, independent approval, material version, remaining demand, allocation and competing release state inside the transaction.
- Use exact decimal arithmetic for quantities and money. Persist chapter/action/idempotency key, request fingerprint and committed result with financial and release writes.

## Proposed cross-module behavior

- Sales obtains availability and requests reservation through the Inventory application operations; it never reads or writes Inventory-owned tables directly.
- Proposed customer-release transaction runs under the Sales-owned operation and includes coverage consumption, demand/reservation progress, Inventory movement, evidence binding, operation result and audit atomically; confirm that ownership split with the Sales, Inventory and Documents/evidence owners.
- Delivery owns the handover user experience and typed adapter. It supplies actual quantities, recipient acknowledgment and evidence binding to the Sales release operation; it cannot supply trusted approval, payment or stock state.
- Documents/evidence validates acknowledgment binding and retained evidence. Inventory validates eligible stock and posts the physical movement in the shared transaction.
- If a required owner has not accepted an interface, treat it as a dependency and keep its production semantics open; use only an explicitly marked test seam where implementation is otherwise authorized.

## Acceptance scenarios

1. An SO cannot reserve stock or proceed to release before authorized approval.
2. SI issuance does not create a payment, OR or release permission.
3. Pending payment evidence produces no OR and no release coverage; verified funds produce one OR and can be allocated only once.
4. An accepted partial/backorder records acceptance time and starts its own deposit deadline independently of any available-stock reservation.
5. A release whose verified allocated coverage is below actual merchandise value is blocked.
6. A partial handover consumes coverage only for actual quantities; remaining accepted demand and customer credit stay visible.
7. Duplicate operation retry returns the original authorized result; changed request reuse of the idempotency key is rejected.
8. An approved refund is not reported as complete until actual verified execution is recorded.

**Traceability:** PRD SO-01–SO-12, PAY-01–PAY-12, RSV-01–RSV-10; TR-02–TR-03, TR-06–TR-12; APP-FLOW F-03–F-04 and F-08.

## Approval and implementation gate

Sales/Finance, Inventory, Delivery and Documents/evidence owners must confirm the operation inputs, outputs, transaction participation and acceptance scenarios. Record accepted revision, date, approver and scope. This proposal does not turn review-candidate requirements into approved implementation authority.

# InventoryCustody Module

Internal domain boundary for Phase 1 (`P05`) chapter inventory catalog, units & precision (`0..6`), locations, custody assignments, item policy drafts & approvals, eligibility evaluation (`EligibilityQueryService`), disjoint interval reservations & holds (`StockHoldOperations` / `InventoryLedgerParticipant`), and strict JCS/ULID utilities (`InventoryFingerprint`).

Notes:
- Sibling modules (`RequisitionsFulfillment`, `SalesFinance`, `DocumentsReporting`) interact through `InventoryLedgerParticipant` rather than querying `stock_positions` or `item_variant_guards` directly.
- Chapter outcome envelopes (`ActionResult`, `blocked`, `stale`, `forbidden`, `ChapterOutcomes::fingerprint`), key/id lookups (`/operations/by-key`, `/operations/by-id/{operation_id}`), and HMAC pagination live in `App\Modules\DocumentsReporting\ChapterOutcomes`.

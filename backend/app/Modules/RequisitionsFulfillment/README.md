# RequisitionsFulfillment Module

Phase 2 (`P07`) internal chapter requisition intake, draft save/discard, submission, officer review/revise/cancel, and two-step stock allocation (`rf.prepare_reservation` -> `rf.allocate_stock` / `rf.release_reservation` / `rf.reallocate_reservation`) backed by `InventoryLedgerParticipant`, `ChapterInventoryAuthority`, and `ChapterOutcomes`.

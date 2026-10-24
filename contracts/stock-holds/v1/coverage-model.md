# Identifiable coverage and invariants

Revision `1.0.0-review.1`. This is an enforceable design contract awaiting intended-MySQL implementation and consumer review, not a claim that the existing `stock_holds`, `hold_reservation_links` or balance tables already enforce overlap.

## Disjoint cells with conserved origin

Inventory assigns every documented receipt lot an immutable coordinate extent `[0, documented_qty)`, in that lot's approved base unit. Coordinates are exact `DECIMAL(20,6)` offsets, aligned to the unit quantum (pieces/kits use whole offsets). They are logical coverage identifiers, not serial numbers or additional physical quantities. A ten-piece accepted lot starts as one cell `[0,10)`, not ten million micro-unit rows. Nonusable documented goods have their own source lot/extent and accepted quantity zero, following ticket 02.

A live coverage cell identifies a disjoint subset of that original extent. Its immutable identity/geometry includes chapter, variant, unit, lot, start and end. Its current position assigns location/custodian/condition; its lot preserves source RM/line and restriction provenance. Physical cell assignment is backed by source/inspection and custody identification: a labeled packet, counted subset, serial range or recorded segregation/reference. A new finding must identify existing cell coverage or split/refine it from such evidence. Matching position, reason total or reservation quantity never proves identical goods. If the finding cannot distinguish its affected subset, conservatively hold the entire identifiable enclosing cell pending authorized refinement; never invent a smaller overlap/availability from the reported totals.

All active reasons and physical reservations reference **whole live cells**. A cell can have any number of independent active holds and at most one active RF/SO reservation. Each hold retains its own source/version, reason, actor, evidence and resolution history. Historical links to retired cells remain readable through lineage.

When an operation needs a proper subset, it splits the live parent under the shared variant/position guards. Children have positive, ordered, adjacent intervals whose exact union is the parent, with identical lot/variant/unit. Retire the parent from the live projection and insert the children atomically. Every child inherits **every** active hold and its one reservation before the requested authorized change. Never create an uncovered child or count parent and children together. Keep immutable split, assignment and membership events; projection replacement is not deletion of history. No merging is required by this revision.

Example: A covers `[0,3)` and B `[2,4)` of a ten-piece lot. Live cells `[0,2)`, `[2,3)`, `[3,4)`, `[4,10)` have reason sets `{A}`, `{A,B}`, `{B}`, `{}` and quantities 2,1,1,6. Union is four. Clearing A leaves B's two cells, quantity two. This explicitly identifies the shared unit `[2,3)`; totals A=3 and B=2 would not.

## Origin through movements and nonusable goods

The v1 wire dimension pins the first consumer's typed RM source line. Gain-ADJ provenance and return/treatment operation payloads below are later-consumer obligations: extend the supported typed source alternatives and constraints before enabling those paths; do not disguise an ADJ as RM or widen to a generic registry reference.

Receipt creates coverage in the **same outer transaction** as its valid source-linked Inventory movement/lot/position (ticket 02). It cannot be seeded with an unrelated positive balance. A movement selects exact live cells, splitting first if needed. Current position assignment changes only alongside that approved movement; geometry and origin stay fixed. A release/consumption marks those leaves outside current custody with retained terminal assignment/history. An approved return reactivates its original identified geometry only after cumulative return checks; it must not mint a second copy. ADJ gains use their own authorized gain provenance/extent; losses retain consumed geometry. A reversible effect links original events rather than deleting them.

At every commit, the lot's live leaves, including terminal leaves, form one disjoint complete partition of its documented extent. Stored leaves grouped by position reconcile exactly to movement-derived physical quantity. A retired parent cannot be assigned or held/reserved as current stock. Split and hold events alone never create inventory movements. A quarantine transfer reassigns the identified cells to a nonusable position **with** the approved source-linked movement. Applicable holds remain attached until individually resolved.

The existing reservation header is position/lot-specific. An actual transfer of reserved goods must atomically reconcile that physical coverage and retain paid/funded/RF outstanding commitments and exception history. It cannot leave a reservation pointing to a different position's cells. Where nonusable goods cannot retain active physical reservation coverage, release/reclassify that coverage through authorized linked reservation history while preserving the protected outstanding demand/funding and blocking handover. No timer, hold, split or clearance silently cancels a commitment. Replacement coverage needs a fresh eligible guarded allocation. The later owning posting operation must implement this treatment before moving reserved goods; this contract does not introduce a paid-demand cancellation policy.

## Union and eligibility

For a single authorized chapter/variant/unit/query scope, let `U` be accepted usable stockroom cells. Holds do not remove cells from `U`. Let `E` be cells in `U` that pass all **non-hold** restrictions for the requested purpose/event/requesting unit and intended-use time. Let `H` be cells in `E` with at least one active applicable hold, and `R` cells in `E` with an active RF or SO reservation. All active holds here block every allocation/issue/sale use of their covered cells; this revision introduces no purpose-specific hold bypass.

```text
usable_stockroom_on_hand = measure(U)
active_held_union = measure(H)
reserved_in_eligible = measure(R)
held_reserved_intersection = measure(H intersect R)
blocked_union = measure(H) + measure(R) - measure(H intersect R)
available_to_allocate = measure(E) - blocked_union
```

Evaluate membership once per live cell; use `EXISTS`-style membership or preaggregate unique cell IDs rather than multiplying quantities through a hold×reservation join. Never `SUM` independent reason totals or pairwise hold/reservation links to derive either union. RF and SO reservations cannot overlap each other because a cell has only one active reservation. A given hold's explanatory quantity is the sum of its distinct cells. Coverage outside `E` remains visible with its reasons/commitments but is excluded from this formula; it is already ineligible and must not be subtracted again. Negative availability is an integrity failure, not a value to clamp to zero.

ROP compares `measure(U) <= approved_rop`, independently of holds/reservations/purpose eligibility. Shortage is `max(0, requested_quantity - available_to_allocate)` for **new allocation**, independent of ROP. Release of an existing reservation evaluates its own identified cells, remaining demand, current holds/restrictions/evidence and applicable payment controls; it does not require those already reserved cells to appear in new-allocation availability.

## Reconciliation and change identity

Before a write commits, verify geometry partition, current position sums, whole-cell hold membership, one-reservation ownership, per-hold/per-reservation exact coverage and the union equations under the shared guards. A hold spanning more than one current position uses explicit cell links; its original `position_id` is provenance, not a sufficient current-coverage selector. Persist no independent union counter without reconciliation to the live cells.

Every change to live geometry, assignment, holds, reservations, applicable restrictions or condition bumps the variant's `eligibility_version` and each affected position's `row_version` without wrapping. Row/material versions remain distinct: source progress may change row version while approved material version/hash remains unchanged. Resolving a hold also conditionally increments its own row version. Restriction/policy changes and time-dependent eligibility require current re-evaluation even if an earlier token is identical. A query snapshot is neither an allocation nor authorization to commit.

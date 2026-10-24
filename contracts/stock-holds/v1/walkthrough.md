# Query scope, examples and consumer handoff

Revision `1.0.0-review.1`. Every quantity, actor, evidence pin, threshold and schedule in this slice is synthetic expected data, not a chapter policy approval or executed stock acceptance.

## Source to screen to owning operation

Start with the IPC/RM acceptance contract's **expected** signed IPC → inspected RM: RM `901`, accepted line `601`, variant `71`, lot `1201`, usable stockroom position `1301`, ten accepted pieces. That source-linked receipt would create the root coverage `[0,10)` in its own transaction. Its separate damaged line `602`/nonusable lot `1202` does not enter these ten usable units. Query fixtures retain that RM line as provenance; a direct balance seed is not an admissible later integrated test setup.

An authorized screen requests `QueryInput` for chapter/variant/unit, intended purpose/time, event/requesting-unit context, requested **new-allocation** quantity and optional lot/location constraints. It displays `EligibilityResult`'s seven quantities separately, with source/lot/location/custodian/condition/restriction context, each active independent reason, reservation protection and union explanation. It displays `read_at`, freshness, current guard/policy/restriction versions and stable blocking codes. A failed/unavailable read preserves the last labeled stale view or shows an error, never zero stock. It cannot infer commitment success from these values.

For a finding/clearance the screen preserves input/attempt, submits to the future owning workflow adapter using shared transport identity and explicit versions, then refreshes after confirmed success. `CreateHoldInput`/`ClearHoldInput` are the internal resolved boundary, not permission to submit arbitrary authoritative cell choices, actor or balance. Current Access/Documents/Inventory checks run again inside commitment. A timeout uses chapter/action/key lookup; absent/unavailable result remains uncertain. A successful clear may still show goods blocked by another reason, reservation or donor restriction.

## Seven quantities and context

All rows in one result use the **same committed snapshot**, authorized chapter, variant/base unit and approved precision. No mixed-unit totals or addition across variants. Lot/location filters restrict the seven physical/reporting views and cell explanations. **ROP is explicitly broader:** `rop.basis` identifies all usable stockroom positions for that chapter/variant/unit and the approved item-policy version, regardless of those filters. Deny a result if the caller cannot see its complete ROP basis; never infer low stock from a partial scope. Inbound PO lines apply the variant, intended receiving location and compatible source constraints; when a query explicitly selects existing receipt lot IDs, inbound is zero because an unreceived PO has no such lot. The unrestricted lot-filter query can show matching inbound. Implement an authorized read-only consistent snapshot across arrays/aggregates/ROP; `read_at` alone does not make separate reads consistent. The existing variant guard covers changes outside the selected positions too. A valid empty-stock or zero-match read retains that guard but may have empty position/restriction arrays; mutation inputs still require their actual current position pins.

| Wire view | Exact reporting basis |
| --- | --- |
| `usable_stockroom_on_hand` | Accepted current usable stockroom cells, including reservations, holds and donor-restricted accepted goods. Excludes booth and nonusable custody. Purpose/hold eligibility never silently reduces on-hand. |
| `available_to_allocate` | Cells passing non-hold eligibility for the purpose/event/unit/time, less the union of applicable holds and active physical reservations, once. It is new-allocation capacity, not outstanding reserved demand's own release readiness. |
| `rf_reserved` | Active outstanding RF physical cell coverage within the physical filter scope, including blocked/restricted coverage. RF has no unpaid-sales timer. |
| `so_reserved` | Active outstanding SO physical coverage, including blocked/restricted and paid/funded-protected coverage. Excludes unallocated backorder quantities. Protected outstanding obligations without current physical coverage remain separate demand exceptions. |
| `booth_custody` | Current cells in named booth custody, with location/custody assignment/custodian. May also be nonusable; no booth quantity becomes available stockroom stock. Booth sale later reduces booth custody once. |
| `quarantined_rejected` | Current physically recorded nonusable/quarantine/rejected cells, with condition/location/custody and source. Never infer physical stock from an undelivered or unrecorded rejected quantity. Can overlap booth custody. |
| `inbound_open_po` | Approved not-yet-accepted supplier PO quantity after accepted/canceled progress, with typed PO/line/variant and scoped expected destination. Not stock, not a cell, not on-hand/availability. |

Headline RF/SO views are not blindly substituted into the availability formula: reservations outside the purpose-eligible base `E` are already excluded from `E`. `union.reserved_in_eligible` names the exact subset to subtract. `active_held_union` and `held_reserved_intersection` likewise refer to `E`; all active reasons outside `E` remain in `holds` and cell explanations. Those explanations are not additional additive stock views. Scope includes all current stored cells needed for the physical views, not only eligible cells. IDs must be visible within current chapter/duty scope; deny an unsupported detailed query rather than leak hidden references.

Predicate: allowed intended use AND required event permission AND required requesting-unit permission AND effective interval AND supported donor interpretation. Booth sale requires both sale and booth permission. Empty `listed` scopes or missing required context permit nothing. Unsupported terms stay blocked until authorized expressible interpretation; an ordinary override/hold clearance cannot remove them. Current condition/custody and all active reasons then gate allocation/release. Query freshness/guard pins are advisory and cannot replace current policy/time/authority checks in a write.

## Accepted literal examples

| Fixture | Usable | RF / SO | Held union / intersection | Available | Explanation |
| --- | --- | --- | --- | --- | --- |
| `rop-ten` | 10 | 4 / 3 | 4 / 2 | 1 | Ten > ROP eight, so no low-stock condition. Request two has independent shortage one. |
| `same-three` | 10 | 0 / 0 | 3 / 0 | 7 | A and B cover the same three cells' units; both reasons identifiable. |
| `clear-first` | 10 | 0 / 0 | 3 / 0 | 7 | A cleared; B unchanged. |
| `clear-last` | 10 | 0 / 0 | 0 / 0 | 10 | Last reason cleared; no movement/condition change. |
| `reserved-three` | 10 | 0 / 3 | 3 / 3 | 7 | Same three are paid-reserved and held by A+B. |
| `reserved-clear-first` | 10 | 0 / 3 | 3 / 3 | 7 | Clear A, keep B and reservation. |
| `reserved-clear-last` | 10 | 0 / 3 | 0 / 0 | 7 | Clear B too; reservation remains. |
| `partial-overlap` | 10 | 0 / 0 | 4 / 0 | 6 | A `[0,3)`, B `[2,4)` share exactly one. |
| `partial-clear-A` | 10 | 0 / 0 | 2 / 0 | 8 | B's two units stay held. |
| `expiry-before` → `expiry-keeps-holds` | 10 | 0 / 3 → 0 / 0 | 3 / 3 → 3 / 0 | 7 | Unpaid expiry does not clear either reason or create receipt. |
| `funded-protected` | 10 | 0 / 3 | 3 / 3 | 7 | Funded protection is retained; unpaid expiry cannot consume it. |

`verification-cases.json` adds exact fractional and split vectors, a mixed seven-view result, remaining restriction after clearance, actual quarantine, forbidden/stale/evidence cases and both race orders. Numerical checks are authored specification consistency only; the concurrency schedules are not a simulated runtime or executed lock proof.

Review regressions in `examples.json`: `query-zero-stock` has no position/restriction rows and returns truthful zeros with an existing variant/policy guard; `query-filtered-rop` selects a separate three-unit lot while another seven usable units remain outside its filter. Its visible filtered on-hand is three, but chapter-variant ROP basis is ten, so threshold eight does not trigger. `clear-quarantine` and `quarantine-cleared` explicitly pin current position1302/version6→7. In the allocation-first creation schedule, the old pins first produce a confirmed stale rejection; only a refreshed intentional attempt can record the hold on that now-reserved coverage.

## Later acceptance and actual reviews

At P05/P06-and-consumer integration, tests enter the **highest owning application operation** with real current authorization/evidence, a valid accepted receipt, actual Inventory/query/reservation participants and intended MySQL. Observe authorized query/result/evidence/audit/movement references through supported interfaces. Use two actual DB connections for contention and inject participant/audit/result/task failures to prove all-or-nothing effects. No private-helper test, mock authorizer or public positive-balance setter substitutes for that boundary. Required cases and ownership are in the schema register and operation document.

| Reviewer/gate | Actual state and concrete review question |
| --- | --- |
| Leader-authored P00 revision | Review candidate `1.0.0-review.1`; automated fixture results are recorded locally after validation. |
| Glenn, query/reservation/UI compatibility | **Pending.** Confirm whole-cell reservation/protection projections, E-scoped union explanations, snapshot/filter semantics, source/variant/unit relationships and freshness/refresh handling; no fabricated approval. |
| Efren, physical-posting compatibility | **Pending.** Confirm receipt root creation, split/assignment/terminal lineage, quarantined reserved coverage reconciliation and shared guard/outer-transaction participation. |
| Access/Documents maintainers | **Pending.** Confirm source-target/approval/material pins, actual signer/evidence policy, current authority locks and result/audit/task integration. |
| Intended-MySQL constraints and races | **Not executed.** Record exact migration/runtime revision and results before enabling affected consumers. |
| P05/P06/AC-04 and P00/P01/whole-spec review/merge | **Pending.** This authored slice closes none of these shared package gates. |

Retain reviewer identity, date, revision, scope and findings when actually supplied. The whole MVP P00–P29 roadmap, candidate status and live activation gates remain intact.

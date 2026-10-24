# IPC/RM acceptance contract

Leader revision **1.0.0-review.1**, 24 October 2026. Parent [Stage 0 spec](https://github.com/Kamunggay/YSP/issues/2); local ticket `.scratch/stage-0-leader/issues/02-ipc-rm-acceptance-contract.md`. This is a P00 authored review candidate. PRD v1.2/TRD v2.1 remain review candidates. Inventory (Efren), Documents consumer review and Glenn's screen/query compatibility acceptance are **pending**; no human approval is inferred from authored examples or agent reviews.

The boundary connects a signed IPC, persisted inspection and ready evidence to one Purchasing/Receiving-owned acceptance transaction. Inventory alone writes stock. Documents validates evidence. No P06 operation, screen, migration or application is implemented here.

| Artifact | Consumer |
| --- | --- |
| [contract.schema.json](contract.schema.json) | Internal command, inspected read model, stock effect/result and error schemas; register shared transport and identity-record-evidence v1 schemas first |
| [examples.json](examples.json) | Expected success/replay, blocked, stale, forbidden and uncertain wire values |
| [source-and-evidence.json](source-and-evidence.json) | Expected two-line IPC and immutable evidence bindings, using ticket 08's existing definitions |
| [internal-operations.md](internal-operations.md) | Purchasing/Receiving owner; Access, Documents and Inventory participants, locks/guards, commitment, rollback/retry |
| [schema-change-register.md](schema-change-register.md) | Leader integration reservations, ownership, exact relationships and deferred constraints |
| [walkthrough.md](walkthrough.md), [cases.json](cases.json) and [fingerprint-vector.json](fingerprint-vector.json) | S-13 → S-12 → acceptance/lookup; numerical expectations, literal operation fingerprint and future integrated verification cases |

Governing inputs are the **main workspace's working** `docs/PRD.md`, `docs/TRD.md`, `docs/DATABASE-SCHEMA.md` §§2, 4.2, 5, 10–12, `docs/BACKEND-ARCHITECTURE.MD`, `docs/APP-FLOW.md` F-01/F-06/S-12/S-13, `docs/IMPLEMENTATION-PLAN.md` P00/P02–P06, `docs/contracts/first-slice-agreement.md` Q2/Q4–Q5, root glossary and ADRs 0001/0003. Historical copies/proposals remain supporting design; this contract does not promote them. It implements the ticket's TR-02–TR-03/TR-06/TR-10–TR-12/TR-15, INV-07–INV-08, RCV-01–RCV-03/RCV-08–RCV-10 and MIG-01/MIG-04 handoff. P06 still implements and proves AC-04.

Run from the shared checkout:

```powershell
npm --prefix contracts/transport ci --ignore-scripts
# During development, target only this file and optionally one named slice:
node --test --test-name-pattern='P00: IPC/RM' contracts/transport/tests/ipc-rm-acceptance.test.mjs
# Once all slices are green:
npm --prefix contracts/transport test
```

Validation proves schema shapes, expected fixture relationships, exact arithmetic/hash vectors and outcome consistency. It does not execute authorization, signatures, object availability, SQL integrity/locking, stock posting or rollback. Source/evidence state flags in fixtures are explicit **expected server facts**, never command authority. See the local ticket 02 handoff for actual commands/results and review findings.

Outstanding consumer questions requiring actual review:

- **Efren / Inventory:** confirm accepted/nonusable lot and movement mapping, receipt-line source batch identity, guard participation and returned posting/lot/position/movement references against P05/P06 design. A nonusable intake receipt movement must never increase accepted progress or usable stock.
- **Documents provider/consumer maintainer:** confirm version-pinned binding storage, signer verification/availability checks and transaction participation; confirm the cyclic operation/attribution/evidence FKs can be enforced before enablement. Signed-sheet integrity alone does not establish genuine required signers.
- **Glenn / S-13/S-12 and lookup:** confirm separate quantity and exception displays, preservation of corrected/stale input and original uncertain attempt, and scoped recovery of the saved result without another acceptance.
- **Leader integration with affected maintainers:** validate the reserved DDL tuples, cutover source fence and complete graph against intended MySQL. Reservation is design ownership, not accepted DDL or a passed migration.

PO plus supplier DR and DA retain their own valid source paths in the wider requirements. They may extend the source discriminator and typed relationships later, without weakening operation/result/evidence guarantees. Their commands, financial/allocation workflow and complete migrations are not finalized here. Later-found goods and opening corrections retain the approved ADJ route.

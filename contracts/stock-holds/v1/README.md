# Stock hold coverage and clearance contract

Revision `1.0.0-review.1`, 24 October 2026. Leader-authored P00 contribution for stock-hold contracts, parent [spec #2](https://github.com/Kamunggay/YSP/issues/2). Requirements: INV-03–INV-05, INV-07–INV-08, INV-10, INV-14; TR-06–TR-10, TR-12; accepted Q1/Q7/Q8. PRD v1.2/TRD v2.1 remain review candidates. The existing Inventory, Sales and Delivery proposals retain their later scope.

This revision defines disjoint stock coverage shared by independent holds and reservations, seven stock views and evidence-linked clearance. It supplies schemas, expected reads/results and design proofs. It supplies no Laravel endpoint, query/reservation provider, posting participant, migration or stock acceptance. Glenn retains queries/reservations and UI; Efren retains physical posting; Leader coordinates schema/integration. Actual consumer acceptance remains pending.

| Artifact | Consumer purpose |
| --- | --- |
| [contract.schema.json](contract.schema.json) | Register after transport v1 and identity-record-evidence v1; validate normalized inputs, query reads and mutation outcomes. |
| [coverage-model.md](coverage-model.md) | Identifiable disjoint coverage, exact union/intersection, conservation and source preservation. |
| [internal-operations.md](internal-operations.md) | Mandatory relationship, authority, evidence, guard, replay, rollback and concurrency rules. |
| [schema-change-register.md](schema-change-register.md) | Additive reservations against the existing schema, ownership, keys and enablement order. |
| [walkthrough.md](walkthrough.md) | Seven-view scope, literal accepted examples, verification boundary and real reviewer questions. |
| [examples.json](examples.json), [cases.json](cases.json) | Wire examples and their numerical fixtures, all labeled `expected`. |
| [verification-cases.json](verification-cases.json) | Concrete split/restriction/quarantine/failure/race schedules for later operation acceptance. |

From `contracts/transport`, install with `npm ci`, then run the single file during this contract's development:

```powershell
node --test tests/stock-holds.test.mjs
```

The Node runner has no `--bail` option; the target is this file only. Run `npm test` once for final verification after the affected contract checks pass. These checks compile shared schemas, validate fixtures/negative wire probes and reconcile explicit cells against literal expected quantities. They are executed **contract consistency** checks, not executed MySQL, authorization, evidence or concurrency tests. The fixture oracle is confined to tests and is not Glenn's provider.

Sources: root `CONTEXT.md`; ADRs 0001/0003/0004; working `docs/PRD.md` INV-03–INV-05/INV-07–INV-08/INV-10/INV-14, `docs/TRD.md` TR-06–TR-10/TR-12, `docs/DATABASE-SCHEMA.md` §§4.3–4.4/5/10, `docs/contracts/first-slice-agreement.md` Q1/Q7/Q8 and the published Stage 0 specification. Read the governing requirements under `docs/agents/domain.md`; this repository checkout intentionally preserves earlier committed document revisions. This additive slice does not rewrite or promote those inputs.

# YSP Chapter Operations — Backend Architecture

| Field | Value |
| --- | --- |
| Status | Reconciled architecture review candidate; adopted design, no prototype or implementation verification claimed |
| Updated | 19 October 2026 |
| Requirements authority | [TRD.md](./TRD.md), version 2.1 review candidate; [PRD.md](./PRD.md), version 1.2 review candidate; [APP-FLOW.md](./APP-FLOW.md) (including Perspective 4 Operations Architecture Map, S-01–S-22) |
| Launch | One organization, Cebu pilot, four individual internal users |
| Deployment | React/TypeScript; modular Laravel; private MySQL; Docker Compose on one 4 GB Lightsail host |

This diagram describes deployment, module ownership and control paths. The TRD governs mandatory rules, configuration approvals, acceptance and recovery readiness. Boxes inside Laravel are application responsibilities within the same versioned codebase. API, worker and scheduler use the same Laravel image (TR-01–TR-02).

## Deployment and operation paths

```mermaid
flowchart TB
    Client["Browser Client: React/TypeScript<br/>Desktop and Mobile Officers (S-01–S-22)<br/>Perspective 4: Operations Architecture Map"]

    subgraph Host["4 GB AWS Lightsail Linux Host: Docker Compose (TR-01)"]
        Proxy["TLS Reverse Proxy: Nginx/Caddy<br/>Static React Build and /api on One Origin"]

        subgraph LaravelApp["Modular Laravel API Process"]
            Pipeline["HTTP Transport Controls<br/>HttpOnly Session and CSRF<br/>MFA for Approvers and Administrators<br/>Validated Requests and Operation Identity"]
            AppOps["Application Operations<br/>Shared Entry for HTTP and Background Work<br/>Server-Controlled Authority, Versions and Outcomes"]
            ExecutionGate["Three-Tier RBAC & Execution Policies (TR-17, TR-30)<br/>Tier 1: Tenancy Boundary (chapter_id isolation)<br/>Tier 2: 14 Chapter Duty Grants (duty_grants)<br/>Tier 3: Runtime Invariants (GOV-05, GOV-06, GOV-07)<br/>Business Posting / Scoped Read-Export / Essential Control"]
            TxCoordinator["One Operation-Owned MySQL Transaction (TR-10–TR-14)<br/>Fresh Authority, Independent Approval, Policy and Version Checks<br/>Stock, Funding and Evidence Checks under Consistent Locks<br/>One Commit across Participating Modules"]
            ScopedReads["Authorized Queries and Output Delivery<br/>Chapter and Duty Scope, Current Access Recheck<br/>Grace Permits Scoped Read/Export"]

            subgraph DomainModules["Seven Modules in One Laravel Application (TR-02)"]
                direction TB
                subgraph ModAdmin["Access and Chapter Administration"]
                    ChapterAdmin["Memberships, 14 Chapter Duties, Alternates and Versioned Policies<br/>Opening/Stage Activation and Entitlement History"]
                    ProviderAdmin["Controlled Provider/Provisioning Administration (GOV-03)<br/>Chapter and Initial Head Provisioning<br/>Subscription Verification, Extension and Reactivation<br/>Provider Admin Isolated from Operational Sign-Offs"]
                end
                ModRF["Requisitions and Fulfillment<br/>RF Review, Revision, Shortage and Partial Signed Issue<br/>RF Custody Assignment; Unpaid SO Clocks in Sales"]
                ModPurchasing["Purchasing and Receiving Coordination<br/>RepF Net Need, Budget, Quotations and PO<br/>PO/Supplier DR, DA or IPC Inspection and Discrepancies"]
                ModBooth["Booth Operations<br/>Signed Checkout, Event Custody & Stepper Sales (S-15)<br/>Float Accounting: Float PHP 2k + Sales PHP 4.5k = PHP 6.5k Remittance (BTH-06)<br/>Independent Recounts, Returns and Remittance Close-Out"]

                subgraph ModInventory["Inventory and Custody"]
                    InvOps["Shared Inventory Transaction Operations<br/>6 Balance Silos: Usable, Available, Reserved, Booth Custody, Quarantined, Open PO (INV-03)<br/>Accepted RM, Signed Movements and Ledger Projections<br/>Booth Sales Decrement Booth Custody ONLY<br/>Counts, Quarantine and ADJ Stock Treatment"]
                end

                subgraph ModSales["Sales and Finance"]
                    SalesWorkflow["SO Review and Full-Order SI (Billing Notice Only)<br/>Buyer Acceptance and Two Scoped 48-Hour Clocks<br/>Release Gated 100% on Verified OR Payment Coverage (PAY-02, SO-08)<br/>Claims, Financial Approval and Resolution"]
                    FinOps["Shared Financial Operations<br/>Actual Cash/Official GCash Verification (Ref GC-771201) and OR<br/>Procurement Funding vs Release Coverage<br/>Adjustments, Actual Refunds and Reconciliation"]
                end

                ModDocs["Documents and Reporting<br/>Dual-Mode Signatures: Method A Canvas Pad (Bezier Curves) vs Method B Upload<br/>Immutable SHA-256 Digest Binding to Underlying Record (DOC-08, TR-15)<br/>Issued Snapshots, Scoped PDF/CSV, In-App Alerts, Retained Audit"]
            end
        end

        Worker["One Queue Worker Process (TR-04)<br/>Same Laravel Image; Bounded PDF/Job Resources<br/>Durable Follow-Up Replay and Visible Failed Jobs"]
        Scheduler["One Scheduler Process (TR-04)<br/>Same Laravel Image; Due UTC Deadlines and Catch-Up<br/>Discoverable Work for Replay after Outages"]

        subgraph MySQL["Private MySQL: One Database (TR-06–TR-09)"]
            DBCore["15 Required Record Groups<br/>Global Identity plus Explicit Chapter Memberships<br/>Chapter-Owned Links Enforced in the Database<br/>Exact Decimals, Versions and Separate State Axes"]
            DBLedger["Immutable Inventory Movements<br/>6 Controlled Balance Projections and Custody<br/>Retained Payment, Approval and Source History"]
            DBInfra["Shared Sessions and MySQL Jobs<br/>Transactional Outbox or Durable Follow-Up Rows<br/>Idempotency Key, Payload Fingerprint and Result"]
        end
    end

    subgraph External["Private Off-Host Evidence and Independent Recovery (TR-18, TR-23–TR-24)"]
        S3["Private S3 or Equivalent Object Store<br/>Validated Evidence, Signatures and Issued Forms<br/>Authorized Short-Lived Downloads"]
        Backup["Verified Independent Recovery Location<br/>Topology and Account Eligibility Approved before Live Use<br/>Encrypted Database, Binlogs, Evidence and Recovery Material<br/>Restore within 4 Hours; At Most 1 Hour Committed Loss"]
    end

    Client -->|HTTPS and Session Cookie; Mutation Idempotency Key| Proxy
    Proxy -->|Versioned API| Pipeline
    Pipeline --> AppOps
    Worker -->|Same Authorized Application Operations| AppOps
    Scheduler -->|Durable Due-Work Discovery| DBInfra
    Worker -->|Poll Jobs and Durable Follow-Up| DBInfra
    AppOps --> ExecutionGate
    ExecutionGate -->|Mutation with Fresh Checks inside Transaction| TxCoordinator
    ExecutionGate -->|Authorized Read, Export or Output Work| ScopedReads
    TxCoordinator -->|Coordinate Participating Module Operations| DomainModules
    TxCoordinator -->|One Atomic Commit: Domain Writes, Audit, Result and Follow-Up| MySQL
    ScopedReads -->|Scoped Queries| MySQL
    ScopedReads -->|Evidence, Snapshots, PDF and CSV| ModDocs

    ModRF -->|Reserve and Actual Signed Issue| InvOps
    ModPurchasing -->|Net Need and Accepted RM Posting| InvOps
    ModPurchasing -->|Allocated SO Shortage Funding Gate| FinOps
    SalesWorkflow -->|Eligible Reservation and Actual Signed Release| InvOps
    SalesWorkflow -->|Verified Receipt, OR and Coverage| FinOps
    ModBooth -->|Checkout, Sale and Verified Return| InvOps
    ModBooth -->|Verified Payment, OR and Remittance| FinOps
    InvOps -->|Source-Linked Evidence and Stock Treatment| ModDocs
    FinOps -->|Financial Evidence and Issued Snapshot| ModDocs
    ModDocs -->|Validated Staging; Scoped Read or Generation| S3

    MySQL -->|Consistent Full Backup; 5-Minute Binlog Copy Target| Backup
    S3 -->|Verified Independent Recovery Copies| Backup
```

## Transaction ownership and retry rules

An application operation owns the outer MySQL transaction. Participating inventory, financial, workflow and document operations share that transaction and commit once. Each operation rechecks current authority, distinct-person approval, policy, material version, remaining demand, stock eligibility, payment/funding and ready evidence under appropriate locks. An HTTP middleware pass or a queued job's original actor snapshot cannot replace these checks (TR-10–TR-11; TR-17).

| Operation | Changes committed together |
| --- | --- |
| RF/SO reservation | Eligible availability, reservation/deadline/protection, operation result and audit |
| Customer release | Actual signed batch, applicable coverage consumption, demand/reservation progress, inventory movement and audit |
| Booth sale | Eligible event custody decrement, verified sale/payment and OR, actual quantities, result and audit |
| Accepted RM | Valid source and cumulative checks, accepted source lot/movement/balance, PO progress and allocation eligibility |
| ADJ/refund recording | Authorized source/cumulative checks, approved applicable stock/financial entries and actual execution status |
| Opening/cutover | Approved IPC/accepted RM baseline, carried outstanding obligations and exactly-once source links |

All business mutations persist the chapter/action/idempotency key, payload fingerprint and committed result with their writes. Required follow-up intent is committed alongside the initiating operation and dispatched after commitment. Same-payload retries return the existing authorized result; changed payloads cannot reuse the key. A lost response requires operation-result lookup before retry. Source-action, original OR and payment-account reference uniqueness prevents duplicate money or stock (TR-03–TR-04; TR-12).

Actual cash, GCash credit and physical handover remain real-world facts even if a database action fails. Uncertain outcomes require reconciliation; neither rollback nor retry permits a second physical handover or receipt (TR-11; SEC-06).

## Three-layer authorization

1. **Identity and membership:** Scope chapter operations to explicit current membership; audit the authority used. Provider/provisioning roles grant no automatic chapter operational authority. The same individual may receive separately approved chapter membership and duty grants; operational actions must use and audit that chapter authority and satisfy the same independence checks. Provider-role possession alone never satisfies an operational sign-off.
2. **Duties and permissions:** Use the fourteen chapter duties in [embedded duty and permission matrix](TRD.md#appendix-d-shared-role-matrix-and-candidate-control), granted through chapter memberships. System provisioning, subscription billing and technical recovery use separate provider-role grants. Do not grant launch buyer/member access. Four-person assignments are provisional until approved; no fixed user-ID matrix controls authorization.
3. **Contextual checks:** Apply independent review to the relevant action: own RF approval blocked, Inventory cannot approve its own purchase, ordinary ADJ preparer cannot be sole approver, and booth custody/cashiering needs another independent close-out reviewer. Count variances require Chapter Head and Finance approval by at least two distinct authorized people. The count preparer and the custodian whose stock is being checked cannot approve that variance. If one person holds both approving duties, retain both duty decisions and require an authorized independent co-approver, or use an approved alternate for a duty. No preparer/custodian may serve as that fallback. Missing independent coverage blocks approval; holding multiple roles does not bypass it.

There is no rule rejecting every operation by its preparer. A receiving officer may prepare and post an inspected RM when authorized, after valid-source, quantity, evidence, immutable-history and idempotency checks. Recheck authority/version, entitlement, duty scope and independent actors inside the operation transaction. HTTP, queued work, files and reports share these policies. Restrict and audit infrastructure access through approved support/recovery procedures.

## Ownership of inventory, finance and adjustments

The shared inventory operations belong to **Inventory and custody**. The shared financial operations belong to **Sales and finance**. They are module-owned operations in the same Laravel application. Controllers, report jobs and scheduled work use authorized application operations and cannot write stock or money around them (TR-02).

### Seven related stock views (INV-03, TR-08)

1. **Usable stockroom on-hand:** Accepted usable units physically held in the stockroom, including RF/SO-reserved units; excludes booth custody and quarantine/rejected goods.
2. **Available-to-allocate:** Eligible usable on-hand minus RF and SO reservations and applicable holds, with held/reserved intersections counted once. Eligibility is evaluated by lot, restriction, condition and purpose.
3. **RF-reserved:** Outstanding stock committed to approved internal or booth-checkout RFs. No unpaid-sales expiry clock applies.
4. **SO-reserved:** Outstanding stock committed to approved SO quantities. Only unpaid available-stock quantities use RSV-01 expiry; paid/funded protected quantities follow RSV-02/RSV-10.
5. **Booth custody:** Units checked out to a named event custodian. Booth sales reduce eligible booth custody once; they do not deduct stockroom stock again.
6. **Quarantined/rejected:** Physically held unavailable units, separately visible until authorized treatment. They are not inbound supply or available stock.
7. **Inbound open PO:** Approved supplier commitments not yet accepted through RM. They are not on-hand or available.

These are related reporting views, not mutually exclusive physical buckets to sum. For example, 10 usable on-hand with 7 reserved and no holds gives 3 available; on-hand remains 10. RF and SO reserved subtotals remain separately visible.

### Cash float and reconciliation (BTH-06)

Record approved float issued and returned separately from buyer receipts and sales revenue. Reconcile actual cash and official-account GCash independently. At the start of reconciliation, expected physical cash still due equals float issued plus verified cash sales, less executed authorized cash refunds, prior verified cash deposits/remittances and separately recorded verified float returns. Do not subtract one transfer twice: a float return is recorded only in float movements, a sales remittance only in remittances. Each prior movement is recognized once. Do not net GCash against physical cash or receive it again. Show float still due, sales cash still due, actual counted cash and any difference separately; a difference requires investigation and approved resolution. Example only: PHP 2,000 float + PHP 4,500 cash sales = PHP 6,500 physical cash before any refund, deposit or return; PHP 3,000 GCash reconciles separately. Amounts, item codes, account identities, payment references and schedules are approved setup/scenario inputs, not fixed policy.

| Responsibility | Owning/coordinating modules and controls |
| --- | --- |
| Claim intake and original evidence | Sales and finance coordinates buyer claims; Inventory and custody coordinates count variances; Booth operations links event discrepancies. Track 1 links original OR plus signed customer DR; booth claims use original OR. |
| Inspection/recount and eligibility | Inventory and custody records inspection, condition and independent recount; preserves cumulative original-sale/issue limits and unavailable returned/damaged stock. |
| Approval | Application operations enforce configured claim authority, preparer independence (`GOV-05`), and material-version approval. Variance requires strict dual co-approval by Chapter Head and Finance (`GOV-06`), hard-blocking count preparer (`actor_id != preparer_id`). |
| Stock execution | Inventory and custody posts approved resalable returns, eligible signed replacements, variance corrections and supported quarantine treatment once. |
| Financial execution | Sales and finance coordinates invoice/payment adjustments and Finance approvals; extra payment coverage gates unequal exchanges. Approved refund and actual verified refund remain distinct. |
| Supplier follow-up | Purchasing and receiving coordination retains RM/PO links, supplier claims, correction/replacement/return and outstanding commitments. Stock posting cannot conceal an unresolved claim. |

These responsibilities preserve ADJ-01–ADJ-10, PAY-10–PAY-12 and GOV-05–GOV-07. They do not require another independently deployed service.

## Authority, subscription and background execution

Provider/provisioning administration is a controlled authority surface within Access and chapter administration. Creating a chapter, appointing its initial Head or verifying a subscription does not grant operational membership. Provider subscription money is separate from buyer SO/SI/OR and official chapter GCash collections (GOV-03; SUB-05; TR-17; TR-30).

HTTP requests, jobs, operations, queries, downloads and output delivery enforce current chapter/duty authority. Disabled identities cannot post, approve, export or receive queued protected output. MFA is required for approvers and administrators; independent approval counts distinct individual identities (SEC-01–SEC-03; GOV-05–GOV-07; TR-16–TR-17).

Execution policy distinguishes:

- **Officer business postings:** require active applicable stage/entitlement; queued business execution rechecks before commitment.
- **Authorized reads/exports:** remain available within the 14-elapsed-day unpaid grace period, under the same chapter/duty restrictions.
- **Essential controls:** deadline/history, security, backup and reconciliation controls remain supported after trial expiry; this does not grant officers a posting bypass.

Chapter Head explicitly activates live operations once after applicable readiness; the original activation starts the 30-elapsed-day trial. Provider payment verification/extensions/reactivation are audited. Expiry does not automatically cancel funded orders, payment, stock, reservations or supplier obligations. Post-grace access and retention follow approved commercial terms (SUB-01–SUB-06; TR-30).

The worker calls the same application operations as HTTP. Output generation and delivery use current scoped authorization. Scheduler deadline discovery feeds durable work; resulting expiry/lapse operations recheck authoritative stored deadlines, actual verification/acceptance times and scoped protection. Separate available-stock and backorder-deposit clocks remain 48 elapsed hours; unrelated unpaid quantities can expire while paid/funded commitments stay protected (RSV-01–RSV-10; TR-04; TR-13).

## Evidence, independent state and live gates

Uploads use validated staging and immutable hash/version binding to the authorized record. The database transaction references ready evidence; MySQL and object storage do not share an atomic transaction. Reconcile missing evidence and clean unattached staging only under policy. Issued forms use committed immutable data/template snapshots; regeneration and external copies never create a second document, payment or movement. Downloads require scoped server authorization before issuing a short-lived link (TR-15; TR-18; DOC-06–DOC-11).

### Dual-Mode Signature Capture Architecture (DOC-08, TR-15)

Customer release and requisition issue (`S-07`), plus required count acknowledgments, support two signature evidence capture modes:
- **Method A — Live Digital Signature Pad:**
  - Client-side HTML5 Canvas capturing pen/touch vector coordinates.
  - Dynamically smoothed with quadratic Bezier curves (`smoothSignatures`) to eliminate jagged volunteer signatures.
  - Interactive Clear and Redo actions; exports dual formats (PNG base64 raster and vector path array).
- **Method B — Signed Paper Form Scan / Upload:**
  - File upload (`image/*`, `application/pdf`) for physical wet-signed delivery receipts or counter sheets.
   - Client preview and size/type feedback; server validation of actual content/type, configured size limit and file integrity before evidence is ready. A 10 MB limit is an implementation planning example, not approved chapter policy.
- **Cryptographic Binding Invariant:**
   - For both methods the server computes SHA-256 of the stored file bytes as `evidence_objects.content_hash`; `evidence_bindings.bound_hash` pins that file and object version. A client-supplied digest is not sufficient validation.
   - `acknowledgments.acknowledged_snapshot_hash` separately hashes the exact canonical recipient/batch business snapshot. Bind file evidence and acknowledgment to that same handover before commitment; changed material quantities or recipient require fresh evidence. Hashes establish integrity, not signatory identity.

### Financial and Goods Release Gates (PAY-02, SO-08)

The system enforces strict financial invariants on order fulfillment:
- **Sales Invoice (SI) as Billing Notice Only:** An SI is a billing statement requesting settlement. It never acts as proof of payment and cannot authorize stock release.
- **Official Receipt (OR) Gating:** OR issuance strictly requires verified payment credit (e.g., GCash Ref `GC-771201` verified against chapter collection account).
- **Physical Goods Release Gate:** Customer release (`CUSTOMER_DR`, `handovers`) is hard-gated on 100% verified OR payment coverage for the released batch (`handover_receipts`). Goods are never physically released against unverified payments or open invoices.

Approval, stock readiness, payment, fulfillment and exception progress remain separate at line/batch level. Material changes invalidate affected prior approvals with history. Each record uses its own closure rules: partial fulfillment is visible, accepted partial receipts may allocate immediately, and posted ADJ/receiving completion does not hide an unexecuted refund, supplier discrepancy or unresolved booth remittance (TR-09; RF-08; SO-12; PAY-12; RCV-04–RCV-05; BTH-14; ADJ-10).

Before applicable live actions, enforce approved roles/alternates, configuration/master data, document controls, official payment setup, recovery readiness and opening/cutover evidence. Opening IPC includes independent count and Chapter Head/Finance signatures; accepted RM posts one locked baseline. Carried payments, stock, POs and booth custody retain original references without duplicate receipt or commitment. Later-found stock uses approved ADJ (GOV-08–GOV-09; RCV-08–RCV-10; MIG-01–MIG-03; TR-22).

Gate 1 is approved setup/opening; Gate 2 pilots internal requisition/procurement/receiving; Gate 3 pilots Track 1/payment/donations/ADJ; Gate 4 pilots booth/outage/reconciliation. Enabling a stage does not restart the trial or declare complete release. Complete acceptance requires all MIG gates, AC-01–AC-23 and Appendix C evidence (MIG-04–MIG-08; TR-27–TR-30).

## Recovery and operating constraints

The recovery location must be verified independently accessible and sufficient for regional failure. A same-region-only copy is insufficient. This architecture does not preapprove another AWS region or imply account eligibility, permitted data location or funding. Select and approve the topology before live use (TRD section 11; TR-23–TR-24).

The five-minute binlog-copy cadence is an engineering target, monitored through destination acknowledgment and lag. Recovery copies include consistent database state, evidence/signatures, audit/idempotency results, issued sequences, release/configuration and independently accessible encryption/recovery material. Demonstrate service plus usable evidence/history restoration within four hours and at most one hour committed-record loss, including regional failure. Reconcile uncertain physical custody, documents, payments and manual booth records before authorized reopening (TR-23–TR-24; SEC-05–SEC-06; AC-22).

Keep MySQL private, use least-privilege credentials, bound worker/container/log resources, monitor backup lag and host capacity, and rehearse maintenance/failed-release recovery. Pin supported runtime versions during implementation. Preserve the approved single-host deployment and USD 35/month infrastructure planning target with USD 100 total credit and funding/preservation controls; measured growth and new spending require an updated plan (TR-19–TR-21; TR-25–TR-26).

This overview records the approved review corrections. It does not constitute implemented behavior, passed concurrency/security/recovery tests or authorized production acceptance.

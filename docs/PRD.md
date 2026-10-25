# YSP Chapter Operations — Product Requirements Document


| Field | Value |
| --- | --- |
| Version | 1.2 review candidate |
| Date | 19 October 2026 |
| Product baseline | Approved v2.0 workflow, clarified through interview questions Q1–Q26 |
| Initial rollout | Youth Service Philippines (YSP), Cebu Chapter |
| Initial team | One organization; four members reported by the project owner |
| Delivery surface | Internal responsive browser application |
| Currency | Philippine pesos (PHP) |
| Source | `YSP_Cebu_Proposed_System_Workflow_Documentation_and_Proposal_v2.0.docx`, dated 7 October 2026 |

## 1. Summary

Provide one chapter-controlled system for internal requisitions, merchandise orders, booth sales, stock custody and reservations, purchasing, receiving, donations, opening stock, and returns or adjustments. Officers must be able to follow every stock and payment movement from its initiating record through approval, fulfillment, reconciliation, and closure without double allocation or unsupported release.

The first release implements the complete approved v2.0 workflow for Cebu, in stages. Chapter ownership is present from the beginning so future chapters, including YSP Liloan and other city chapters, can operate with separate records and explicitly assigned officers.

### 1.1 Authority and supporting records

The user confirmed that reviewers have already approved v2.0. Its controls remain the baseline. Where diagram wording and narrative conflict, the explicit resolutions in section 3 take precedence; complete flowchart coverage means implementing every operational branch with these agreed corrections.

- Approved workflow proposal (historical source; locally retained): the original source, retained unchanged.
- Historical interview: original product Q1–Q26 and the 15 October 2026 readiness round established complete flowchart scope, a four-member team and an internal-workflow first milestone. Those requirements are specified below; section 21 records subsequent adoption. Reading the local interview is not required to interpret this package.
- [embedded domain glossary](PRD.md#22-domain-glossary): canonical terminology.
- [Chapter ownership requirements](PRD.md#4-chapter-governance-and-approved-configuration): chapter records and explicit membership authority are fully defined here.
- [Booth custody requirements](PRD.md#12-track-2-booth-custody-and-sales): checkout, sales and returns retain distinct custody movements.
- [embedded source-node and branch inventory](TRD.md#appendix-c-source-flowchart-coverage): individual source nodes and branches.
- [Technical requirements](TRD.md): deployment, implementation controls and growth plan; document status and pending inputs are explicit.

This review candidate additionally records the 19 October 2026 adoption decisions in [embedded adoption decisions](PRD.md#21-embedded-adoption-and-consistency-decisions). The original product interview Q1–Q26 remains historical source evidence; its adopted behavior is specified here and its authority is summarized in section 21; UI-Q20–UI-Q26 identify the separate interface/architecture additions.

This PRD specifies observable product behavior. It does not select a technology stack or prescribe internal implementation.

## 2. Scope, users, and outcomes

### 2.1 Required first-release scope

| Area | Included behavior |
| --- | --- |
| Internal requisition | RF preparation, approval, revision/cancellation, reservation, shortage procurement, partial issue, signed acknowledgment, closure |
| Track 1 sales | SO preparation/review, available/backordered quantities, full-order SI, payment allocation, expiry, funded backorders, partial release, signed customer DR |
| Track 2 sales | Approved booth stock checkout, custody balances, cash/GCash OR sales, manual outage records, returns/counts, variance approval, remittance, closure |
| Inventory | Item variants, locations/custodians, source restrictions, stock status, separate RF/SO reservations, availability, transaction history, ROP/target replenishment |
| Purchasing | Net need, RepF, budget approval, quotations, supplier comparison, approved PO, outstanding commitments and authorized changes |
| Receiving | Approved PO plus supplier DR, DA, or IPC; inspection, accepted RM quantities, discrepancies, partial receipts and allocation |
| Opening stock and donations | Independent opening count, signed IPC, one-time baseline, valuation evidence, restricted donation receiving |
| Exceptions | Returns, exchanges, defective replacements, refunds, count variances, quarantine and authorized resolution through linked evidence |
| Administration | Chapter selection and isolation, accounts/roles/alternates, independent controls, approved policies, numbering and audit history |
| Operational support | In-app alerts, recorded buyer communication, printable forms/PDF reports, CSV exports, archival and recovery requirements |

### 2.2 Users and authority

| User or role | Intended surface and authority |
| --- | --- |
| Committee requester | Prepare and track authorized committee RFs; revise returned requests; acknowledge authorized handovers |
| Department approver | Review RF necessity and completeness; approve or return with reasons within assigned authority |
| Sales/merchandise officer | Record buyer orders, prepare sales documents, record buyer acceptance/communication, coordinate fulfillment and claims |
| Sales reviewer | Authorize selling prices, discounts and terms; approve SOs and assigned return/exchange actions |
| Finance/Treasury | Verify payments, control financial templates/numbering/settings, approve cost estimates and financial adjustments, reconcile collections |
| Inventory custodian/reviewer | Track balances/reservations/custody, prepare issues and stock reports, allocate eligible goods, independently verify counts where authorized |
| Purchasing officer/committee | Review RepFs, obtain quotations, record supplier comparison, prepare approved POs and follow up commitments |
| Budget/purchase approver | Authorize budget and purchasing commitments within approved limits |
| Receiving officer | Inspect goods, document acceptance/discrepancies, prepare RM; include technical/requesting representatives where required |
| Dispatch/release officer | Verify release gates, record actual quantities and retain signed customer handover evidence |
| Booth custodian/in-charge | Request and acknowledge checkout, hold event stock, participate in counts and reconciliation |
| Authorized booth cashier | Record immediate sales, verify authorized payment, issue ORs and account for collections |
| Independent counter/reconciler | Verify opening counts, booth counts or recounts without being the sole custodian being checked |
| Chapter Head | Approve operational policies, officer roles/alternates, opening baseline and count variances as required |
| System administrator | Create chapters and appoint their initial Chapter Head; no automatic access to chapter transactions |
| Buyer/member | An external transaction participant, not a launch account holder; receives goods/documents and communicates through Sales |

Roles are chapter-assigned duties. An officer may hold more than one role if the required independent approval or reconciliation is supplied by another authorized person.

The current organization has four members. Plan the launch for a small internal team rather than a large hosted platform. Confirm the named account holders and chapter duties during setup. Four people may cover several duties, but GOV-05–GOV-07 still require different individuals for the relevant independent controls. An unavailable independent officer blocks the affected approval or reconciliation; the smaller team does not authorize self-approval.

### 2.3 Deferred capabilities

Customer self-service accounts/portal; cross-chapter stock transfers; organization-wide operational oversight; full offline synchronization; outbound email/SMS/messaging integrations; and automated payment-channel integration are outside the first release. Future chapter activation is supported through separate ownership and provisioning; it does not imply shared stock or unrestricted cross-chapter visibility.

### 2.4 Required outcomes

The pilot must demonstrate that two demands cannot reserve the same goods; every movement traces to source and approval; releases require payment or issuance evidence; booth stock and collections reconcile; and opening stock matches its approved physical count. Every process, decision branch, loop and connector in the four source flowchart sheets must also have implemented behavior and acceptance evidence.

### 2.5 Launch scale and growth

Launch serves one YSP organization through the Cebu pilot and its four-member team. Complete first-release workflow scope remains required. Future chapters and additional officers can be activated with explicit chapter ownership and memberships; adding capacity must preserve existing records, evidence and controls. Large-platform infrastructure is not a product requirement. The technical document defines a small initial deployment and measurable capacity-expansion gates.

The earlier 100-account/five-chapter technical planning envelope is future growth context rather than a prerequisite to operating the four-member pilot. The initial pilot must still pass all product acceptance scenarios, including concurrent allocation, full workflow coverage and recovery readiness. SEC-05/SEC-06 recovery requirements remain unchanged.

### 2.6 Provider-hosted trial and subscription

The project owner subsequently confirmed provider-hosted/provider-funded AWS, a monthly per-chapter subscription, and the following commercial extension. Provider subscription collections are separate from chapter buyer transactions. Pricing, permitted provider collection methods and post-grace commercial retention terms must be approved before the trial offer is activated; they are not invented here.

1. **SUB-01 — Trial activation.** Chapter Head explicitly activates live operations after applicable setup/opening/recovery readiness for the enabled rollout stage. Record activation once and start a 30-elapsed-day free trial then. Creating accounts or preparing master data does not start the trial; renaming the chapter or signing in again does not restart it.
2. **SUB-02 — Paid extension.** A monthly chapter subscription extends access through its recorded paid-through time after authorized provider payment verification. Record amount/reference, verifier and entitlement history; no automated recurring-payment integration is required at launch.
3. **SUB-03 — Unpaid grace.** On unpaid trial expiry, block new officer business postings and retain authorized read/export access for 14 elapsed days. The same chapter/duty restrictions apply to exports. Final post-grace access and retention terms must be approved before activation.
4. **SUB-04 — Outstanding obligations.** Trial expiry does not automatically cancel or forfeit funded orders, payments, stock, reservations or supplier commitments. Essential deadline/history, security, backup and reconciliation controls remain supported while new officer business postings are blocked; outstanding resolution remains visible.
5. **SUB-05 — Provider separation.** Provider subscription money is not a chapter buyer payment, SO receipt or chapter sales revenue. Billing administration does not confer operational chapter membership or unrestricted financial/evidence access.
6. **SUB-06 — Funding and preservation.** Provider plans funding for the trial, read/export grace and retained records/evidence. Credit exhaustion or subscription lapse does not authorize deleting history. Before hosting can no longer continue, follow the approved notification, export/preservation and retention procedure; do not promise access from an unavailable hosting account.

## 3. Explicit resolutions of source inconsistencies

| Source ambiguity | Required interpretation | Agreement |
| --- | --- | --- |
| Sheet 2 permits full-payment or downpayment OR before release | A deposit funds procurement. Release additionally requires payment covering the merchandise actually handed over. | Q7 |
| Any OR appears to stop the entire SO expiry clock | Protection applies only to fully paid available quantities or designated funded backorders; unrelated unpaid reservations expire. | Q13 |
| B4 invoices only reserved quantities while shortage deposits need SI linkage | One SI covers the approved SO, distinguishing available and backordered quantities; multiple payments link to it. | Q12 |
| Booth checkout and net sales both appear to deduct stockroom quantity | Checkout moves stock to booth custody; booth sales reduce booth custody only; verified returns restore stockroom stock. | Q9 |
| Booth sales have no customer DR, but ADJ evidence requires one | Booth purchase evidence is original OR; Track 1 evidence is original OR plus signed customer DR. | Q16 |
| Sheet 3 routes allocation after complete PO receipt | Accepted partial receipts can serve eligible demand immediately while the remaining PO stays open. | Q10 |
| Sheet 1 shortage branch obscures partial fulfillment | Available portions may fulfill RF/SO demand with acceptance and all relevant evidence/payment controls. | Q10 |
| Expiry says stock returns to usable stock | Expiry changes reservation and available-to-allocate quantities; it does not create a physical receipt or increase on-hand stock. | Q9, Q13; source §5.4 |
| Sheet 1 refers to booth reservations | A booth RF reserves stock before checkout; checkout creates booth custody. Completed booth sales require no per-sale SO reservation. | Q9; source B8–B10 |
| Count discrepancy appears to block all booth returns | Independently verified usable returns may post while unexplained custody remains open; no unexplained variance is written off without approval. | Q21 |

## 4. Chapter governance and approved configuration

1. **GOV-01 — Chapter ownership.** Inventory, reservations, officers' role assignments, buyers, approvals, payments, policies and document sequences belong to a chapter. A role in one chapter grants no access to another chapter's records, attachments, reports or exports.
2. **GOV-02 — Chapter selection.** An officer with several authorized memberships selects a chapter before working. The active chapter is visibly identified. Switching chapters does not move or relabel existing transactions. An unfinished form cannot be posted into a different chapter without explicit review.
3. **GOV-03 — Provisioning.** A system administrator can create a chapter and appoint its initial Chapter Head. Operational access requires a separately authorized chapter membership; provisioning authority does not confer operational oversight.
4. **GOV-04 — Role administration.** Chapter Head authorizes role assignments and alternate approvers. Record who granted, changed, revoked or substituted authority and when. An unavailable approver does not permit automatic self-approval.
5. **GOV-05 — Independent controls.** Requesters cannot approve their own RF where a separate approver is required. Inventory cannot authorize its own purchase commitment. Ordinary return/exchange ADJ preparers cannot be sole approvers; count-variance preparers and affected custodians cannot approve the variance at all. Booth custodians/cashiers cannot provide the sole independent close-out review of their own activity. Opening counts include at least one person independent of the regular custodian. Apply independence to the specified decision, not every subsequent operation by a preparer; an authorized receiving officer may prepare and post their inspected RM after required source/evidence checks.
6. **GOV-06 — Dual variance approval.** Count variances require Chapter Head and Finance approval by at least two distinct authorized people. The count preparer and the custodian whose stock is being checked cannot approve that variance. If one person holds both approving duties, retain both duty decisions and require an authorized independent co-approver, or use an approved alternate for a duty. No preparer/custodian may serve as that fallback. Missing independent coverage blocks approval; holding multiple roles does not bypass it. The prohibition on any count-variance approval by its preparer/affected custodian is an explicit 19 October 2026 policy extension to the original minimum rule; it does not impose dual Head/Finance approval on every return or exchange.
7. **GOV-07 — Overlapping duties.** Where sales preparation, collection and verification overlap due to staffing, retain each duty's actor and require an authorized independent officer's review of sales documents and cash/bank reconciliation under the source policy.
8. **GOV-08 — Configuration ownership.** Chapter Head approves operational settings; Finance approves financial settings. Changes carry effective dates, approval, reasons and history. New settings do not silently recalculate completed or issued transactions.
9. **GOV-09 — Missing settings.** Explain which required setting is absent or unapproved and block the affected action. Officers may still prepare drafts or correct setup; missing policy does not authorize an override.
10. **GOV-10 — Manual overrides.** Reservation/allocation overrides, supplier substitutions and quantity/price changes require the applicable authorized approval and reason. Preserve the previous state and evidence. An override cannot bypass independence, donor restrictions, verified payment, or required source records.
11. **GOV-11 — Emergency procurement.** Apply approved emergency rules with documented justification and required authorization. Emergency status does not bypass budget approval, purchasing approval or SO-shortage funding.
12. **GOV-12 — Currency.** Display and record launch prices, payments, cost estimates and adjustments in PHP, with explicit amounts and consistent monetary precision. Do not mix currencies in one transaction.

### 4.1 Required chapter inputs before their workflows activate

| Configuration | Required approval/control |
| --- | --- |
| Named officers, alternates, operational roles and monetary limits | Chapter Head; independence checks remain mandatory |
| Item codes, description, variants, units, locations and custodians | Authorized item/inventory setup review |
| Selling prices, discounts and price override authority | Authorized Sales/Finance approval |
| ROP, target levels and allocation priority categories | Approved inventory/operational policy |
| Quotation counts, procurement thresholds, supplier selection and emergency rules | Chapter purchasing/budget authority |
| Official GCash account/QR, authorized collectors and permitted channels | Finance approval |
| Invoice/receipt templates, chapter sequences and externally issued reference rules | Finance approval |
| Return windows, eligibility, refund/unequal-exchange rules and approvers | Chapter-approved Sales/Finance policy |
| Pickup dates, buyer acceptance and backorder cost estimates | Recorded order terms and applicable approval |
| Opening cutoff, count team and valuation basis | Chapter Head/Finance approval |
| DA signatories, donation valuation and restriction handling | Authorized chapter/Finance policy |
| Booth cashier/custodian, event price list, cash float and remittance schedule | Approved event setup and Finance policy |
| Physical-count/report-review frequency and escalation responsibility | Approved operational review policy |
| Document retention, archival and authorized disposal/resolution rules | Approved chapter policy |

Exact amounts, windows and schedules are chapter inputs intentionally left configurable. The PRD requires their approval and enforcement rather than inventing values absent from the source or interview.

## 5. Records, approvals, evidence and history

1. **DOC-01 — References.** Assign unique references to RF, SO, SI, OR, IS/AR, supplier DR, customer DR, RepF, PO, RM, DA, IPC, ADJ and inventory transactions within their chapter/document context. Preserve external references and distinguish supplier DR from customer DR.
2. **DOC-02 — Parent links.** A record exposes its initiating and related records. Follow RF → reservation/RepF → IS/AR → movement; SO → SI → payment/OR → customer DR → movement; RepF → quotations → PO → supplier DR/RM; and DA/IPC → RM. Booth sales link OR to event checkout/custody.
3. **DOC-03 — Required fields.** Validate source-required identifying fields, items/variants, quantities, purposes, dates, parties, prices/terms where applicable, approval and evidence before advancing a record. Show specific correction messages without discarding entered information.
4. **DOC-04 — Preparation and approval.** Officers may save drafts, submit, review, approve, or return with reasons within their authority. Approval records the authenticated individual, role, chapter and time. Returned RF/SO records allow revision/resubmission or cancellation with retained reasons.
5. **DOC-05 — Reapproval.** Material changes to approved quantities, price, purpose, terms, source or supplier are reviewed under the relevant authority before further commitment. Retain previous versions; do not quietly change issued financial records or completed handovers.
6. **DOC-06 — Forms.** Generate operational forms and printable copies with reference, chapter, document type, status, items, totals where relevant, linked references and required signature/approval fields. Finance controls approved SI/OR templates and numbering.
7. **DOC-07 — External documents.** Record externally issued document references and attach evidence, subject to the same validation and linkage controls. A generated copy and an external copy of the same transaction must not cause a second payment or stock movement.
8. **DOC-08 — Recipient signatures.** Retain recipient identity, acknowledgment time and signed evidence for required IS/AR and customer DR handovers. Offer on-device signature capture with Clear/Redo and signed-paper scan/photo upload. Show the exact batch quantities and recipient before signing. A material batch change invalidates the prior acknowledgment and requires fresh matching evidence; retain superseded evidence as history. Empty, failed or unvalidated evidence blocks posting. Preparing/printing a form, capturing a signature or uploading a file alone does not post a stock movement. Booth immediate sales retain their existing OR process without an added signature requirement.
9. **DOC-09 — Historical integrity.** Keep rejected, canceled, voided, expired and disputed records with reference and reason. Changes to posted stock/payments require linked reversals or adjustments; never overwrite a balance to hide a discrepancy.
10. **DOC-10 — Traceability.** Record who prepared, reviewed, approved, posted, received, released, canceled or adjusted each action, with timestamps and material-change reasons. Original evidence remains accessible to authorized reviewers when officers leave.
11. **DOC-11 — Duplicates and stale actions.** Repeated submissions, retries or concurrent officers cannot post the same payment, receipt, handover, adjustment or custody movement twice. If another action has changed eligibility, show the current state and require review before commitment.

### 5.1 Source document fields

| Record | Minimum business content |
| --- | --- |
| RF | Requesting unit/person; item/variant and quantity; internal-use or booth purpose; need date; justification; approval |
| SO | Buyer/member details; item/variant and quantity; approved prices/discounts; terms; requested date; pickup/delivery arrangement; acceptance of partial/backordered quantities |
| SI | SO link; complete ordered quantities; available/backordered split; prices, discounts and total due; later linked adjustments |
| OR/payment | Verified amount and channel; payer; actual receipt time; collector/verifier; external transaction reference where applicable; SO/SI or booth/event link; allocations |
| IS/AR | Approved RF; actual issue quantities; stock source; authorized recipient/custodian; signatures; booth opening/closing references where applicable |
| Customer DR | SO/SI/OR links; actual handed-over items/quantities; pickup/delivery and recipient; signed acknowledgment |
| RepF | Trigger(s); demand links; stock, reservations and supply commitments; shortage/ROP quantity; priority/urgency; estimated cost/funding; SO-shortage OR allocation references |
| Quotations/comparison | Supplier offers; comparable specification; price/total cost; availability/lead time; quality/warranty; reliability; commercial terms; selection rationale |
| PO | Approved supplier/specifications/quantities; price/terms; location/date; approvals; linked RepF; supplier acknowledgment where available |
| Supplier DR/RM | Source reference; delivered/count quantities; inspection; accepted/rejected/missing quantities; condition; discrepancies and inspector |
| DA | Donor/sponsor; goods/variants/quantity; condition; declared/estimated value and basis; restrictions; authorized acknowledgment |
| IPC | Cutoff/count team; item/variant/unit; counted quantities; condition/location; valuation basis; independent count and Chapter Head/Finance signatures |
| ADJ | Type; original purchase/handover/count evidence; item/quantity; reason; present/proposed status; inspection/recount; preparer; approvals; resulting movement and replacement acknowledgment |
| Booth reconciliation | Event/checkouts; opening stock; sales/ORs; expected versus actual unsold counts; damage/variance; independent verifier; cash/GCash totals; remittance and resolution links |

## 6. Inventory, reservations and replenishment quantities

1. **INV-01 — Item identity.** Track item code, description, size/variant, unit, approved prices, ROP and target level. Goods of different variants or incompatible units are not interchangeable without authorized correction.
2. **INV-02 — Eligibility.** Retain location/custodian, source, condition and donation restrictions. Purchased and donated goods may share an item code but must retain distinguishable eligibility and provenance.
3. **INV-03 — Balance views.** Show seven separately labeled quantities: usable stockroom on-hand (including reserved goods), available-to-allocate, RF-reserved, SO-reserved, booth custody, quarantined/rejected, and inbound open PO. These views overlap and must not be summed as distinct stock. Inbound and booth quantities are not available stockroom stock. Booth sales reduce booth custody only. Leader clarified on 23 October 2026 that an eligibility hold on previously accepted usable goods does not itself reduce usable on-hand; authorized condition treatment changes the condition view. Applicable holds still block use under INV-14. INV-10 continues to compare usable on-hand with ROP; demand shortage remains independently actionable. See the [Stage 0 agreement](contracts/first-slice-agreement.md#held-stock-example).
4. **INV-04 — Availability.** Available-to-allocate equals eligible usable stockroom stock minus active reservations for that eligibility group. Reservations change availability, not physical on-hand. Expiry/cancellation releases commitments without creating receipts.
5. **INV-05 — Concurrent demands.** Confirm current eligible availability when committing a reservation or handover. Two demands cannot reserve the same units; no operational posting may create a negative eligible balance or exceed remaining demand.
6. **INV-06 — Reservation detail.** Each RF/SO reservation identifies its parent and line, item/source eligibility, quantity, creation time, status, fulfilled quantity, expiry where applicable and release/cancellation history. Keep RF and SO commitments separately visible.
7. **INV-07 — Posting evidence.** Receipts require approved PO plus supplier DR, DA or IPC, and accepted RM. Internal issues require approved RF and signed IS/AR. Track 1 releases require approved SO, SI, verified OR/payment coverage and signed customer DR. Booth movements/sales require their approved checkout, OR and reconciliation evidence. Corrections require approved ADJ.
8. **INV-08 — Actual movement.** Post only accepted/actually handed-over/approved-adjustment quantities. An SO, SI, reservation, draft RM or printed DR alone does not change physical stock. Booth movements follow section 12 and never double-deduct stockroom sales.
9. **INV-09 — Allocation order.** Preserve active commitments and designated funded-backorder allocation. Among remaining eligible demands, use approved priority, then required date, then approval time. Overrides require independent approval and reason; ineligible donor-restricted goods remain excluded.
10. **INV-10 — Low stock.** After receipts, internal issues, sales/custody changes and posted ADJs, compare usable stockroom on-hand with the approved ROP. A value less than or equal to ROP raises a visible low-stock condition. A demand shortage can exist even above ROP.
11. **INV-11 — Proposed replenishment.** Show the approved target, eligible stock, outstanding demand, existing reservations, confirmed relevant inbound quantities and replenishment already in progress. Propose the uncovered quantity needed for approved demand/target stock, avoiding overlap between shortage and ROP portions. Purchasing reviews the proposed amount before commitment.
12. **INV-12 — No duplicated supply need.** Existing RepFs, POs and confirmed inbound allocations covering the same need prevent another purchase request for that covered quantity. Identify supply that is late, disputed or ineligible separately; additional procurement requires a documented reason and approval.
13. **INV-13 — Physical counts.** Compare signed independent count evidence with recorded custody/stock quantities. Differences remain visible and unavailable for unsupported corrections until investigation and approved ADJ. No direct balance edit is permitted.
14. **INV-14 — Quarantine.** Damaged, rejected, defective or otherwise held goods are unavailable for allocation, issue or sale. Retain quantities and custody separately, with authorized clearance, replacement, return or disposal evidence. A pending damage review may block use immediately without silently changing its recorded quantity. Under Leader's 23 October 2026 Q7–Q8 clarification, independent hold reasons may cover the same units: count affected units once and keep them blocked until every applicable hold is cleared. If recorded quantity and usable condition never changed, authorized evidence-linked hold clearance needs no movement and restores only the eligibility permitted by remaining commitments and restrictions. Actual quarantine/condition treatment retains its approved source-linked movement.

### 6.1 Quantity examples

| Event | Required result |
| --- | --- |
| Stockroom usable 10; RF reserves 4 and SO reserves 3 | On-hand remains 10; available becomes 3 |
| Unpaid SO reservation of 3 expires | On-hand remains 10; SO reserved decreases by 3; available increases by 3 |
| PO orders 100; RM accepts 40 | On-hand increases by 40; outstanding PO remains 60; accepted goods may allocate now |
| Unrestricted and distribution-only donations share a SKU | Sale availability excludes distribution-only quantities |
| Target stock 40; eligible usable stock 10; relevant uncommitted confirmed inbound 20; no other demand overlap | Proposed uncovered target replenishment is 10, subject to approval |

## 7. Internal requisition

1. **RF-01 — Intake.** An authorized requester records the fields in section 5.1 and chooses internal use or event-booth checkout. Incomplete records may remain drafts but cannot proceed as approved demand.
2. **RF-02 — Review.** Department Head/designated approver reviews necessity, completeness, relevance and authority. Approval retains the RF reference and forwards the approved demand to Inventory.
3. **RF-03 — Return branch.** A nonapproved RF retains the reason. The requester either revises and resubmits for review or cancels with reason; cancellation does not erase the record.
4. **RF-04 — Sufficient stock.** Reserve eligible quantity against the approved RF. Prepare IS, verify actual quantities with the authorized recipient and retain signed AR/IS-AR before completing issue.
5. **RF-05 — Shortage branch.** Reserve eligible available quantities without double allocation, record the shortage and create the verified RepF pathway. RF shortages use chapter budget approval and do not require buyer deposits.
6. **RF-06 — Partial issue.** With recipient acceptance, issue available approved quantities while shortage remains open. Show cumulative issued, outstanding and formally canceled quantities; do not label a partial RF fully fulfilled.
7. **RF-07 — Replenished demand.** Allocate accepted eligible goods to the pending RF under INV-09, then repeat issuance and acknowledgment for each batch.
8. **RF-08 — Closure.** Close normal RF fulfillment only when all approved demand is issued or its remainder is formally canceled. For booth RFs, additionally apply custody/count/remittance closure in BTH-14.

## 8. Track 1 sales and billing

1. **SO-01 — Staff-recorded orders.** Sales records buyer/member identity, order lines, prices/terms, requested date and pickup/delivery arrangement. Buyers do not need application accounts at launch.
2. **SO-02 — Review.** Authorized Sales/Finance reviewer checks approved prices, discounts, terms, completeness and sales conditions. Only an approved SO can reserve or proceed to billing/funding commitments.
3. **SO-03 — Correction branch.** Return nonapproved SOs with reason. Sales revises/resubmits or cancels with retained history. Price or quantity revisions follow applicable reapproval.
4. **SO-04 — Stock split.** Check current eligible availability per line. Reserve available quantities and separately show unmet quantities. Inform the buyer of shortages, lead time and approved minimum deposit.
5. **SO-05 — Buyer acceptance.** Retain acceptance of partial supply/backorder and its time. If declined, cancel the unaccepted portion and release reservations no longer needed; do not procure that declined demand.
6. **SO-06 — Full-order SI.** Issue one SI covering the approved SO promptly upon reservation/backorder acceptance so the buyer knows the amount due within the applicable payment window. Visibly separate available and backordered quantities, quantity, price, discount and total due. An SI is billing evidence, not proof of payment.
7. **SO-07 — Payment visibility.** Show verified payments/ORs, allocations, invoice adjustments, remaining balance, released quantities and remaining quantities. Clearly distinguish partially paid from fully paid.
8. **SO-08 — Release gate.** Each release needs verified payment covering the actual merchandise value being released, using approved prices/discounts and Finance allocations. A downpayment OR without that coverage cannot authorize release.
9. **SO-09 — Actual handover.** Prepare customer DR for actual quantities. Releasing officer and buyer/authorized recipient verify the goods and retain signed acknowledgment. Deduct only actual released quantity, refresh inventory and run ROP review.
10. **SO-10 — Partial fulfillment.** Maintain each batch's DR, payment coverage and remaining demand. An unpaid or canceled portion must not erase fulfilled, paid or funded portions.
11. **SO-11 — Pickup/delivery follow-up.** Record the agreed pickup/delivery arrangement and deadline. Flag overdue paid goods for officer follow-up; do not automatically free their stock or forfeit funds.
12. **SO-12 — Closure.** An SO is fully fulfilled only when all accepted quantities are released. Formal cancellation of a remainder retains history and resolves linked reservations, payments and procurement commitments under authorized policy.

## 9. Payments, receipts and financial resolution

1. **PAY-01 — Launch channels.** Accept cash and the approved chapter GCash account/QR. Personal or unapproved channels do not qualify as verified chapter payment. Additional channels require approved setup.
2. **PAY-02 — Verification.** Authorized collectors confirm actual cash receipt. Finance/authorized booth cashiers confirm actual GCash credit in the designated account. A screenshot or buyer assertion alone is insufficient.
3. **PAY-03 — Evidence.** Retain amount, payer, channel, actual receipt time, collector/verifier, relevant transaction reference and supporting evidence. Unverified evidence may be recorded as pending but cannot produce verified-payment release authority or an issued OR.
4. **PAY-04 — OR issue.** Issue/register OR only for verified payment, using Finance-approved numbering/templates. Track 1 references SO/SI; booth OR references the event and actual sold items. Record downpayments as downpayments, not full settlement.
5. **PAY-05 — Allocation.** Finance attributes verified payments to specified SO items/quantities, including backorder funding. Allocations and changes are traceable. Combined release coverage across batches cannot exceed the applicable net verified payment, and one payment cannot fund unrelated obligations twice.
6. **PAY-06 — Deposit credit.** A backorder deposit remains customer credit against its SO even when it enables supplier procurement. The procurement check does not create a second customer payment or charge the deposit again. For a PHP 1,000 order with PHP 400 deposit and PHP 600 later payment, total received is PHP 1,000.
7. **PAY-07 — Duplicate protection.** Detect repeated channel transaction references and duplicate OR/payment entries, including manual outage entries. Legitimate installment payments retain separate references; reuploading evidence does not create another payment.
8. **PAY-08 — Payment hold.** Unresolved payment prevents OR issuance and merchandise release. Show pending verification, expiry effects and required officer action; follow RSV rules for unpaid quantities. Require Sales to attempt notifying the buyer of the hold and record its time, channel and outcome.
9. **PAY-09 — Reconciliation.** Match SO/SI/OR/customer DR for Track 1 and OR/event sales/remittance for booths. Finance reviews receipt sequences, cash collections/deposits and GCash credits, with visible discrepancies and resolution history.
10. **PAY-10 — Refunds and unequal exchanges.** Require approved ADJ plus Finance approval and linked OR/payment reversal or adjustment. Record actual verified refund separately from an approved but unexecuted refund. Adjust available payment coverage without rewriting original payment history.
11. **PAY-11 — Funded exceptions.** Sales and Finance resolve funded cancellation, supplier failure, excess procurement cost and uncollected goods under approved policy. Check existing POs/commitments before changing demand; do not automatically forfeit money, cancel funded demand, or conceal committed costs.
12. **PAY-12 — Completion controls.** A transaction with unresolved money, procurement or stock discrepancies remains visibly pending resolution even if some quantities are fulfilled. Financial approval does not substitute for physical handover evidence.

## 10. Reservation expiry and funded backorders

1. **RSV-01 — Available-stock clock.** Unpaid SO reservations expire 48 elapsed hours after recorded reservation creation. Each affected quantity retains its own creation/expiry history; weekends do not silently extend elapsed time.
2. **RSV-02 — Scope of protection.** Fully paid available quantities remain reserved. A verified accepted deposit meeting the approved shortage procurement cost protects the designated funded backorder commitment and eligible stock received for it. It does not protect unrelated unpaid quantities.
3. **RSV-03 — Expiry action.** At expiry, release only the unpaid/unprotected reservation, log SO/line/quantity/time/reason, restore available-to-allocate quantity and show payment hold–reservation expired for the affected portion. Require a Sales action to attempt notifying the buyer of the affected quantity and availability change, recording time, channel and outcome. Do not change physical on-hand or delete the SO.
4. **RSV-04 — Separate backorder clock.** The buyer's backorder acceptance time starts a separate 48-hour deadline for the required verified deposit. Record acceptance, deadline and shortage state independently of available-stock reservations.
5. **RSV-05 — Deposit gate.** Finance approves estimated shortage procurement cost before Sales requests the deposit. Do not forward an SO-shortage RepF to Purchasing until verified payments allocated to that shortage meet the approved cost and have OR evidence.
6. **RSV-06 — Cost exceeds sale amount.** Route a procurement estimate above the agreed selling amount to pricing/budget review. Do not silently increase buyer charges or commit chapter funds for an unpaid backorder; any revised terms need relevant approval and buyer acceptance.
7. **RSV-07 — Unfunded lapse.** If the required deposit is not verified within 48 hours of acceptance, lapse/cancel the unfunded backorder portion with reason. Preserve any separately paid/fulfilled/funded portion. A partial payment that fails the minimum is a financial resolution item and is not silently forfeited.
8. **RSV-08 — No automatic extension.** Neither pending screenshots nor staff delay automatically extend either clock. Record original event times and actual verification; backdated data entry cannot fabricate a timely OR or buyer acceptance.
9. **RSV-09 — Late payment.** Recheck eligible availability before any new reservation. If fully paid stock is available, record the new committed allocation and retain old expiry history; do not assign an unpaid deadline to already fully paid goods. If unavailable, obtain backorder acceptance or Finance-approved refund resolution.
10. **RSV-10 — Paid/funded follow-up.** Track agreed pickup deadlines and alert officers when overdue. Paid reservations/funded commitments end only through fulfillment or authorized resolution; passing another 48 hours does not automatically free them.

## 11. Purchasing, receiving, opening stock and donations

### 11.1 Purchasing and replenishment

1. **PRC-01 — Valid triggers.** Approved RF shortages, funded/accepted SO shortages and ROP needs can initiate RepF. Tag each trigger and demand line. RF/ROP chapter-funded purchases follow budget approval; unpaid SO shortages cannot evade the funding gate by relabeling their demand.
2. **PRC-02 — Net need.** Reconfirm eligible usable stock, active allocations, relevant accepted receipts, open POs and replenishment in progress. Order only uncovered need unless a documented additional-purchase reason is approved.
3. **PRC-03 — RepF content.** Show linked triggers/demand, quantity calculation components, urgency/priority, estimate, funding source and SO-shortage OR allocations where applicable. Combining triggers cannot double-count their overlapping need.
4. **PRC-04 — Budget branch.** Authorized purchasing/budget reviewer checks need, funding, quantity and limits. Approval proceeds to quotations. Nonapproval holds, returns for revision or cancels the RepF with reasons and notification; demand stays pending unless separately canceled.
5. **PRC-05 — Quotations.** Enforce approved quotation counts/thresholds and emergency rules. Compare like-for-like goods, total cost, availability, lead time, quality/warranty, reliability and terms; retain supplier selection rationale.
6. **PRC-06 — PO approval.** Prepare PO for selected supplier, specifications, quantities, price, terms, location and expected date. Require applicable supplier-selection/purchase authority approval before issuance. Retain supplier acknowledgment where available.
7. **PRC-07 — Inbound commitments.** Show ordered, accepted, rejected/disputed and outstanding quantities. Goods on order do not increase on-hand availability. Notify Inventory and affected demand owners of planned supply.
8. **PRC-08 — Changes/cancellation.** Before changing or canceling RepF/PO, identify active demand, deposits and supplier commitments. Require approval/reason, preserve versions and notify affected officers/buyers through Sales.
9. **PRC-09 — Shortage completion.** A PO issuance alone does not resolve demand. Keep its shortage open until eligible quantities are accepted and allocated or the remainder is formally resolved.

### 11.2 Receiving and inspection

1. **RCV-01 — Three source triggers.** Purchased goods require approved PO plus supplier DR; donations require DA; opening stock requires IPC. Each accepted receipt needs RM. Goods with none of these valid sources remain held outside usable inventory pending documentation or authorized rejection/return.
2. **RCV-02 — Inspection.** Compare source specifications, descriptions/variants, quantities, packaging/condition and quality requirements with actual goods. Include technical/requesting representative where required. Record inspector, actual counts and discrepancy evidence.
3. **RCV-03 — Partial acceptance.** Post accepted RM quantities only. Missing, incorrect, damaged, expired or nonconforming quantities remain separately recorded and unavailable. A mixed acceptable/unacceptable delivery can produce accepted stock and an open discrepancy simultaneously.
4. **RCV-04 — Immediate allocation.** Once accepted quantities post, they may serve eligible approved demand under INV-09 even if the source PO remains incomplete. Do not hold all accepted goods merely because another PO quantity is outstanding.
5. **RCV-05 — Outstanding PO branch.** If accepted quantities leave a balance, keep PO open, track expected remaining delivery and follow up supplier. If quantity is complete/formally resolved, mark receiving complete while retaining any independently open return/discrepancy.
6. **RCV-06 — Rejected goods.** Record supplier correction/replacement/return or another authorized resolution. Donated goods may be declined/returned/disposed under approved policy. Quarantined goods never become usable merely because a PO or DA is closed.
7. **RCV-07 — No unauthorized substitutions.** Overdeliveries, changed variants/specifications or changed sources need valid approval/document amendment before becoming eligible accepted stock. Do not quietly receive them against an incompatible approved quantity.

### 11.3 Opening stock

1. **RCV-08 — Cutoff and count.** Record approved go-live cutoff and suspend informal movements during counting. Count every existing stock item/variant/location using at least two people, one independent of the regular custodian. Capture condition and valuation basis.
2. **RCV-09 — Opening authorization.** Chapter Head and Finance sign IPC; inspect quantities and post accepted RM quantities as the opening balance. Separate damaged units from usable stock and approve item ROP/target settings before live use. Uncounted undocumented goods are not saleable/issuable.
3. **RCV-10 — One baseline.** Lock the posted chapter opening baseline. Later-found goods and count corrections require ADJ and approval, not a second IPC or an overwritten opening balance. Repeated IPC/RM submission cannot duplicate opening stock.

### 11.4 In-kind donations

1. **RCV-11 — DA acknowledgment.** Retain donor/sponsor, goods/quantity/condition, declared or estimated value, approved valuation basis and restrictions. Authorized chapter officer acknowledges DA; inspect and post accepted RM quantity only.
2. **RCV-12 — Restricted use.** Preserve restrictions at allocation and handover. Distribution-only goods cannot be sold; other restrictions apply to both internal RFs and SOs. Changing a restriction needs documented authorized resolution of the donor condition, not an ordinary stock override.
3. **RCV-13 — Not cash.** DA acknowledges in-kind goods and does not create cash received, an OR or a customer payment.

## 12. Track 2 booth custody and sales

1. **BTH-01 — Event setup.** Prepare booth RF identifying event/dates, items/quantities, approved prices, custodian and cashier. Obtain RF approval. Shortages follow chapter-funded Module D, not buyer-deposit procurement.
2. **BTH-02 — Checkout.** Prepare IS; custodian counts and signs AR/IS-AR. Move actual approved quantities out of usable stockroom balance and into that booth's custody balance. Record opening count/price list. Multiple events retain distinct custody balances.
3. **BTH-03 — Immediate sale.** Sell only eligible goods on hand in the booth at approved prices. Verify cash or actual official-account GCash credit, issue OR immediately and hand over the stated quantity. Completed on-the-spot sales require no SO, SI or customer DR.
4. **BTH-04 — Sale posting.** Each sale reduces the event's booth custody quantity once. It does not reduce stockroom quantity again or create a per-sale reservation. OR records actual items, quantities, prices and payment.
5. **BTH-05 — No credit/unapproved discounts.** An unverified payment or unauthorized price does not authorize handover. Do not sell more than eligible booth stock. Out-of-stock/custom requests become Track 1 SOs rather than booth backorders.
6. **BTH-06 — Collections.** Record approved float issued and returned separately from buyer receipts and sales revenue. Reconcile actual cash and official-account GCash independently. At the start of reconciliation, expected physical cash still due equals float issued plus verified cash sales, less executed authorized cash refunds, prior verified cash deposits/remittances and separately recorded verified float returns. Do not subtract one transfer twice: a float return is recorded only in float movements, a sales remittance only in remittances. Each prior movement is recognized once. Do not net GCash against physical cash or receive it again. Show float still due, sales cash still due, actual counted cash and any difference separately; a difference requires investigation and approved resolution. Example only: PHP 2,000 float + PHP 4,500 cash sales = PHP 6,500 physical cash before any refund, deposit or return; PHP 3,000 GCash reconciles separately. Amounts, item codes, account identities, payment references and schedules are approved setup/scenario inputs, not fixed policy.
7. **BTH-07 — Expected closing stock.** Derive expected unsold quantity from signed checkout quantities less recorded sales and any other approved custody movements. Independently count actual usable, damaged and unexplained quantities per item/variant; preserve count-sheet and verifier identities.
8. **BTH-08 — Reconciled returns.** Independently verified usable returns move from booth custody back to stockroom usable stock with signed closing evidence. This return is not supplier receiving and does not create a new PO/DA/IPC receipt.
9. **BTH-09 — Open variance.** Keep unexplained quantities visible against the booth custodian; do not silently reduce them or adjust stockroom. Prepare linked count-variance ADJ requiring Chapter Head and Finance approval. Verified usable returns may post while the separate variance stays open.
10. **BTH-10 — Damaged goods.** Physically separate and block damaged units from sale/issue. Retain custody until the approved ADJ defines quarantine or other authorized treatment. Record quantity, condition and evidence; damage is not an unrecorded write-off.
11. **BTH-11 — Outage procedure.** During lost connectivity, use approved manual receipt/count controls and official-account payment verification. If actual GCash credit cannot be confirmed, do not treat it as paid. Internet loss does not authorize credit sales.
12. **BTH-12 — Later entry.** Enter manual sales with event, original receipt number, original actual sale time, actual entered time, officer and evidence. Apply the sale once to the correct booth, reconcile receipt ranges and flag duplicates/missing references. Do not issue a second OR for an already receipted sale.
13. **BTH-13 — Reconciliation consequences.** Posting returned stock or an approved ADJ refreshes balances/reports and ROP review. Remittance disagreement remains a financial discrepancy even where stock counts match.
14. **BTH-14 — Closure.** Close booth RF only when checkout/sales/returns reconcile, damages and variances have authorized resolutions, and all collections are remitted/reconciled. Retain RF, IS/AR, ORs, counts, ADJs and remittance links.

### 12.1 Required custody example

| Action | Stockroom change | Booth change |
| --- | --- | --- |
| Signed checkout of 100 units | −100 | +100 |
| Verified sales of 30 units | 0 | −30 |
| Independently verified return of 70 units | +70 | −70 |
| Total | −30 | 0 |

The chapter has sold 30 units. Reconciliation must not post another stockroom deduction of 30.

## 13. Returns, exchanges, replacements and adjustments

1. **ADJ-01 — Initiation.** Record a buyer claim or count variance without immediately changing stock. Hold returned goods unavailable pending inspection. Link ADJ to Track 1 OR/signed DR, booth OR, or the applicable count/IPC/booth evidence.
2. **ADJ-02 — Eligibility.** Apply configured approved return window and eligibility, verify genuine source evidence and ensure cumulative returned/exchanged/refunded quantities do not exceed the original actual sale/issue. A prior resolved claim cannot be reused for another replacement.
3. **ADJ-03 — Inspection/recount.** Inventory inspects returns/defects and records current/proposed status before approval. A nondefective item is not automatically resalable; any unsalable returned unit stays unavailable pending authorized treatment. Count variances require a second-person recount. Missing or contradictory evidence leaves the ADJ pending correction/investigation.
4. **ADJ-04 — Approval branch.** Apply configured return/exchange authority; an ordinary claim preparer cannot be sole approver. Count variances use GOV-06: Chapter Head and Finance, at least two independent authorized people, and no approval by the count preparer or affected custodian. Refunds and unequal exchanges additionally require Finance and linked financial adjustments. Rejection retains reasons and posts no stock change. Ordinary returns/replacements do not automatically require dual Head/Finance approval.
5. **ADJ-05 — Even exchange.** After approval, accepted resalable return enters usable stock and actual replacement leaves eligible stock. Record variant/value, quantities and buyer acknowledgment on ADJ or DR. No replacement exceeding available eligible stock is released.
6. **ADJ-06 — Defective replacement.** Confirm defect; returned unit goes to quarantine/rejected rather than usable stock. Deduct actual eligible replacement only after approval and retain signed buyer acknowledgment. Link supplier RM/PO and claim where relevant.
7. **ADJ-07 — Refund/unequal exchange.** Require Finance approval and linked financial adjustments in addition to ADJ. Show additional amount due/refundable and verify applicable payment before releasing a more expensive replacement. Preserve original receipt and stock history.
8. **ADJ-08 — Count variance.** Only fully approved ADJ posts the specified positive/negative correction to the affected location/custodian. Keep original count and prior movements; approval cannot be replaced by a direct balance overwrite.
9. **ADJ-09 — Resolution.** Link authorized quarantine clearance, supplier return/replacement or disposal evidence. Never count quarantined units as accepted saleable stock before authorized clearance and its supported movement.
10. **ADJ-10 — Completion.** Post approved quantities once, refresh inventory/report/ROP, record handover/refund execution where applicable, investigate variance causes and retain supplier-claim follow-up. An unresolved payment or supplier claim stays visible even if the stock adjustment is posted.

## 14. State visibility and closure

Approval, stock readiness, payment, fulfillment and exception resolution can differ for the same transaction. Display them without erasing partially completed work; one unpaid line must not label a separately funded line canceled.

| Record | Required visible states or progress | Closure rule |
| --- | --- | --- |
| RF | Draft, submitted, returned for revision, approved, reserved/short, partially issued, fulfilled, canceled remainder; booth close-out where applicable | All demand issued/canceled; booth conditions additionally satisfied |
| SO/lines | Draft, pending review, returned, approved; available/backordered; awaiting deposit, funded procurement, payment verification hold, expired unpaid reservation; partly/fully paid; ready, partly/fully released; exception resolution | All accepted demand fulfilled/canceled and linked commitments/payments resolved |
| Reservation | Active unpaid, paid/funded protected, partially consumed, expired, released/canceled, fulfilled | No active outstanding committed quantity |
| RepF | Draft, awaiting funding where applicable, budget review, held/returned/rejected, approved, linked PO, revised/canceled | Need ordered/resolved with retained links; does not imply demand fulfilled |
| PO | Pending approval, issued, acknowledged where available, partially received, outstanding/disputed, receiving complete, authorized change/cancellation | Accepted quantity complete or remainder formally resolved; related discrepancies remain visible |
| Receipt/RM | Draft inspection, accepted partial/full, held/rejected quantities, posted acceptance | Accepted posting/evidence complete; discrepancies independently tracked |
| Booth | Approved setup, checked out, trading, manual outage records pending entry, counting, open variance/remittance, reconciled, closed | BTH-14 satisfied |
| ADJ | Prepared, inspection/recount, awaiting approvals, returned/rejected, approved, posted, pending financial/supplier follow-up, resolved | Authorized stock action and required related resolution recorded |
| Payment/refund | Pending evidence, verified/receipted, allocated, partly applied, adjusted/reversed; refund approved versus actually executed | Actual money movement reconciled with retained evidence |

## 15. Alerts, reports and exports

1. **RPT-01 — Officer alerts.** Provide chapter-scoped in-app alerts for approval actions, expired reservations/deposit deadlines, shortages, ready orders, overdue pickup, receiving discrepancies, low stock and unresolved booth balances. Link each alert to the relevant record and responsible role.
2. **RPT-02 — Buyer communication.** Sales records buyer acceptance and notification attempts with time/channel/outcome. Backorder acceptance deadlines start from recorded acceptance, not merely from drafting a message. No launch customer portal or automatic external messaging is required.
3. **RPT-03 — Inventory reports.** Show balances by item/variant, location/custodian, eligibility/condition, RF/SO reservations, availability, receipts/issues/sales/ADJs, shortages, ROP/target and inbound/outstanding commitments.
4. **RPT-04 — Demand/procurement reports.** Show RF/SO fulfilled/outstanding/canceled quantities, expiry/funding state, priority/need date, RepF approvals, quotations/PO progress, accepted/rejected quantities and supplier discrepancies.
5. **RPT-05 — Finance/booth reports.** Show SI/OR links, payment allocation and remaining balance, collections/refunds/reversals, receipt-sequence exceptions, booth opening/sales/returns/variance, actual remittances and unresolved differences. Do not count cash float or custody transfers as sales revenue.
6. **RPT-06 — Control reports.** Include donation sources/restrictions, IPC/count history, ADJ approvals/resolution, overdue exceptions and actor/time/reason audit history. Apply configured report review/count schedules.
7. **RPT-07 — Outputs and filters.** Offer printable/PDF reports and CSV exports using relevant chapter, date, item, event and status filters. Label units/currency/stock categories and report time. Enforce role/chapter access in exports as well as screens; mixed historical/entry dates are distinguishable.

## 16. Access, reliability and browser behavior

1. **SEC-01 — Individual identities.** Use individual accounts and chapter-role permissions. Shared officer credentials cannot substitute for individual approval attribution. Approvers and administrators use multifactor authentication.
2. **SEC-02 — Account lifecycle.** Authorized administration can disable an officer immediately and remove/reassign authority without deleting historical attribution. Disabled access cannot approve/post/export. Account recovery must not grant additional chapter authority.
3. **SEC-03 — Scoped information.** Restrict buyer details, financial evidence, signatures, attachments and audit exports to authorized duties. A chapter identifier or document link alone grants no access. System administrator provisioning remains distinct from operational membership.
4. **SEC-04 — Retention.** Apply approved retention/archival policy to records and evidence. Archival preserves required links and audit readability; officers cannot delete history merely to correct balances or hide canceled/voided transactions.
5. **SEC-05 — Recovery targets.** After a major failure, target service restoration within four hours and loss of no more than one hour of committed records. Recovery includes usable supporting evidence and history, not only displayed balances. Readiness must demonstrate recoverability against these targets.
6. **SEC-06 — Recovery reconciliation.** Before resuming affected operations, identify the uncertain interval and reconcile physical custody, issued documents, payments and manual outage records. Restoring service must not silently convert uncertain/missing financial or stock actions into verified ones.
7. **UX-01 — Responsive access.** Officers can complete authorized core tasks in a browser on phones and computers. Show chapter, document status, required next action and blocking reason clearly; do not require a native app.
8. **UX-02 — Input and feedback.** Mark required fields, preserve correct input on validation errors, identify pending versus successful posting and provide actionable error/retry guidance. Users must be able to determine whether a commitment succeeded before retrying.
9. **UX-03 — Online commitment.** Posting requires connectivity. On connection loss, show that commitment is unconfirmed/blocked and support review of current record state after reconnection. Follow approved booth manual controls rather than silently pretending to synchronize offline.
10. **UX-04 — Usable forms.** Support keyboard navigation, visible field labels/focus, readable status text and usable controls on small screens. Do not communicate payment/stock/approval status solely through color.

## 17. Cutover and staged rollout

1. **MIG-01 — Readiness before live movement.** Approve required role/policy/master data, document controls, official payment setup, cutoff/count plan and recovery readiness. Establish signed IPC/RM opening stock and traceability before live issues or sales.
2. **MIG-02 — Existing commitments.** Reconcile any active external RF/SO, buyer payments/deposits, POs and custody obligations carried into launch. Retain their original references/evidence and authorized opening commitment review. Only genuine outstanding quantities/amounts enter active tracking.
3. **MIG-03 — No duplicated history.** A carried payment is recorded once and remains tied to its issued evidence; a carried PO is inbound, not on-hand. Stock physically included in IPC is not also received again merely because its old supplier delivery is attached. Reconcile existing booth custody separately from available stockroom stock.
4. **MIG-04 — Gate 1.** Approve setup and opening count. Demonstrate physical-to-record match, independent signatures, restriction/condition segregation and duplicate-posting prevention before live movement.
5. **MIG-05 — Gate 2.** Pilot internal requisition, reservations, shortage/ROP procurement and receiving, including rejection/revision, partial receipt/issue, open commitments and signed handovers.
6. **MIG-06 — Gate 3.** Pilot Track 1 sales, deposits, both expiry clocks, partial paid release, late-payment resolution, donations/restrictions and approved ADJ/refund paths.
7. **MIG-07 — Gate 4.** Pilot booth checkout, cash/GCash sales, manual outage entries, independent returns/counts, damages/variances and remittance closure.
8. **MIG-08 — Complete release.** Staging changes activation order, not required scope. Declare the release complete only after every required workflow/branch and the acceptance evidence below pass. A successful happy path alone is insufficient.

## 18. Acceptance and source coverage

Each scenario requires observable results and its supporting records. These are product acceptance conditions; implementation-specific test design is separate.

### 18.1 Mandatory pilot scenarios

| ID | Scenario | Required evidence/result |
| --- | --- | --- |
| AC-01 | Two officers request the last eligible units concurrently | Combined reservations never exceed available stock; unsuccessful commitment shows current availability |
| AC-02 | Follow an internal issue and a customer sale end to end | Source, approvals, reservation, payment where relevant, signed handover, movement and report remain linked |
| AC-03 | Attempt release using SI alone, screenshot alone or insufficient deposit | Release blocked; authorized fully covered release succeeds with correct signed evidence |
| AC-04 | Count opening stock including damaged units | Usable opening balances match signed independent accepted counts; damage excluded; reposting does not duplicate |
| AC-05 | Checkout 100, sell 30, return 70 at booth | Stockroom net −30; booth zero; receipts/collections reconcile; no second stockroom sale deduction |
| AC-06 | Booth has good returns, damage and missing units | Verified usable returns post; damage unavailable; unresolved custody visible; variance requires dual/independent approval; closure blocked |
| AC-07 | Receive 40 accepted units on PO for 100, with rejected/missing evidence | Accepted stock allocates immediately; remaining PO/discrepancy stays open; rejected stock unavailable |
| AC-08 | SO has unpaid available item and funded backorder | Only unpaid available reservation expires; funded commitment remains; deposit cannot authorize unpaid release |
| AC-09 | No required backorder deposit within its acceptance deadline | Unfunded portion lapses; no RepF/PO for it; partial money and separate paid demand retained for resolution |
| AC-10 | Late payment after stock was allocated elsewhere | No over-allocation; fresh check leads to accepted backorder or approved refund resolution |
| AC-11 | Partial paid release over several batches | Payment coverage consumed only for actual released quantities; deposit remains valid SO credit; no reuse beyond verified amount |
| AC-12 | Restricted donation shares SKU with saleable goods | Sale uses only eligible goods; restricted quantity remains identifiable; permitted internal use succeeds |
| AC-13 | Booth purchaser requests eligible exchange; Track 1 purchaser claims defect | Booth OR accepted as evidence; Track 1 OR/DR linked; approved stock status/replacement and cumulative limits enforced |
| AC-14 | RF/SO approval rejected then revised or canceled | Both decision branches retain reasons/history; unused reservations released appropriately |
| AC-15 | Budget rejected, quotation policy unmet or emergency procurement attempted | No unauthorized PO; held/revised/canceled RepF and documented emergency authority visible |
| AC-16 | Low stock with an existing RepF/PO covering need | Alert remains accurate; no duplicate uncovered purchase quantity created |
| AC-17 | Count preparer/affected custodian attempts variance approval, including alongside another approver | Their approval is blocked; Chapter Head/Finance duties and independent fallback use at least two eligible people; unavailable coverage blocks posting |
| AC-18 | Enter manual outage sale twice using same OR/payment reference | One sale/payment posts; original and entry times retained; missing ranges/discrepancies visible |
| AC-19 | Change chapter, disable officer, or use provisioning account to open financial record | Explicit membership and role checks enforced; history retained; no implicit administrator operational access |
| AC-20 | Cancel funded order with an open supplier commitment | No automatic stock release/payment forfeiture; authorized linked stock/fund/procurement resolution retained |
| AC-21 | Carry an existing payment/PO/physical stock into opening setup | No duplicate cash receipt, on-hand quantity or purchasing commitment |
| AC-22 | Demonstrate major-failure recovery | Service/evidence/history recover within four hours with at most one hour of committed-record loss; uncertain interval reconciled |
| AC-23 | Export reports as different roles/chapters | Correct balances/statuses/filters and printable/PDF/CSV output; access does not broaden through export |

### 18.2 Source traceability

The companion coverage checklist maps every source node, edge and connector to the numbered requirements and acceptance evidence. Every Yes/No branch, revision loop, rejection/hold path, actual stock update, ROP check and closure must appear. Rows marked with a correction use section 3's agreed interpretation rather than reproducing a source inconsistency.

See [complete embedded source-flow coverage](TRD.md#appendix-c-source-flowchart-coverage).

## 19. Completion boundary

There are no unresolved product choices from the original Q1–Q26. Chapter-specific settings listed in section 4.1 are deliberate pre-live inputs; an absent approval/value blocks its affected workflow. The subsequent commercial extension in section 2.6 additionally requires approved pricing/collection and post-grace retention terms before activation. Deployment dates, implementation architecture and test tooling are outside this product definition.

This document defines the requested system. It does not claim that software or the pilot has already been implemented or passed. Release acceptance requires the complete first-release scope, all source coverage rows and the agreed operational controls.

### 19.1 Revision record

Version 1.1 records the project owner's one-organization/four-member launch clarification and subsequently agreed provider-hosted commercial extension. All original requirement identifiers, operational workflows, independent controls and recovery targets remain intact; SUB-01–SUB-06 add explicit subscription behavior. Implementation architecture and cost details are recorded in the TRD and supporting technical interview.

## 20. Adopted interface additions — review candidate

The following behaviors supplement the existing core workflows. UI-Q20–UI-Q26 are decision labels, not replacements for existing requirement IDs. Chapter setup values and actual officer assignments remain pre-live inputs. The operations map is a supporting feature to implement after the core workflows; it must not become an extra posting gate.

1. **ADD-01 — Operations map (UI-Q20).** Provide five views: end-to-end workflow, money/OR flow, seven stock views and custody, duty/independence matrix, and scenario tracer with node details linked to S-01–S-22. Distinguish illustrative scenario values from current operational records. Live data and links enforce chapter/duty scope. A user without access sees a neutral unavailable-action explanation and no restricted details. Map failure does not stop an otherwise authorized core workflow. Provide a readable text/list alternative to the diagram.
2. **ADD-02 — Work queues (UI-Q21).** Switch between Needs my action, Waiting on others and Resolved/history without a full page reload. Preserve urgency ordering and put uncertain outcomes first. Retain authorized filters during the current session/chapter; clear chapter-specific context on chapter switch. Distinguish loading, no matching work, failed refresh and stale data. Filter changes cannot approve, cancel or repost anything. Recheck authority and current record state before action.
3. **ADD-03 — Demand tabs (UI-Q22).** Provide Summary & Review, Lines & Clocks, Connected Documents and Version/Approval History. Preserve entered values and each tab's scroll/focus context within the current authorized demand. Warn before discarding unsaved edits. Tab changes do not save, submit or imply approval. Stale data requires review rather than silently overwriting another officer's work. Scope every linked document separately.
4. **ADD-04 — Signature choices (UI-Q23).** Offer touch/mouse signature capture with Clear/Redo, plus signed-paper scan/photo upload. Keyboard users can select and upload paper evidence. Preview recipient, actual items/quantities, date/time and evidence status. Validate and bind evidence to the exact acknowledged batch before commitment. Changed quantities/recipient require new acknowledgment. Retrying an uncertain posting looks up the original operation before another attempt; it never instructs a second physical handover. Hashes protect artifact integrity and do not themselves verify a person's identity. Connectivity remains required to post; no durable offline-signature synchronization is promised.
5. **ADD-05 — Booth cart (UI-Q24).** Provide labeled quantity increment/decrement controls, direct numeric input and an explicit cart reset. Enforce permitted unit precision, positive final quantities, approved event prices and eligible current booth stock. Show reset confirmation when a nonempty cart would be lost. Include configured event-authorized merchandise and kits; no sample SKU is mandatory. Review payment and quantities before sale. Pending/uncertain submission disables repeat posting and preserves the attempt for lookup. A reset changes only an unposted cart; it cannot reverse a posted sale. Booth sale posting reduces booth custody once.
6. **ADD-06 — Approval visibility (UI-Q25).** Show required approving duties, actual people, alternate authority, remaining steps and blocking reasons. Count-variance preparers/affected custodians cannot approve their variance, including as a second approver. Ordinary claim approvals follow ADJ-04, with Finance additionally required where applicable. Selecting another role cannot bypass an identity conflict.
7. **ADD-07 — Chapter/duty access (UI-Q26).** Officers receive explicitly authorized chapter duties from the shared role matrix. Buttons and menus reflect permissions; every operation, record link, report and export independently checks current authority. Provider authority confers no operational access; a separately approved chapter membership can. Buyer participants receive no launch login role. Actual assignments and limits are approved setup inputs; missing independent coverage blocks the relevant action.
8. **ADD-08 — Accessibility and failure behavior.** Queue filters and tabs support keyboard operation, visible focus, clear selected state and status announcements. Quantity inputs have labels and actionable validation. Preserve valid form input on failed refresh/upload/posting, show loading/error/uncertain states, and never convey stock/payment/approval state solely by color. Offline screens explain posting restrictions and manual booth controls.

### 20.1 Additional acceptance scenarios

These are required future demonstrations, not passed tests. AC-01–AC-23 and every source-flow coverage row remain required.

| ID | Scenario | Required result |
| --- | --- | --- |
| ADD-AC-01 | Ten usable on-hand units, RF reserved four, SO reserved three | On-hand 10, RF 4, SO 3, available 3; quarantine/inbound/booth remain separate; no sum of overlapping views |
| ADD-AC-02 | RF, unpaid SO, fully paid SO and funded backorder cross 48 hours | Only the applicable unpaid SO portion/deposit deadline expires; funded/paid/RF commitments are not automatically freed |
| ADD-AC-03 | Filter work queues with urgent and uncertain actions | Correct scoped rows, urgency/uncertainty ordering, accessible empty/loading/error states, no business posting |
| ADD-AC-04 | Switch tabs with edits, then encounter a stale version or changed chapter | Edits preserved or explicit discard review; no silent save/merge or cross-chapter posting |
| ADD-AC-05 | Sign on device, then change quantity; repeat with paper upload | Old acknowledgment cannot authorize revised batch; fresh matching evidence required for both methods |
| ADD-AC-06 | Empty signature, invalid upload or uncertain signed handover response | Posting blocked until ready; operation lookup before retry; no duplicated movement or handover |
| ADD-AC-07 | Concurrent booth sale changes stock after cart entry; reset an unposted cart | Fresh eligible stock check prevents oversale; reset cannot reverse any posted sale; retry uses existing sale identity |
| ADD-AC-08 | Count preparer/custodian tries either approval slot; Head and Finance overlap | Ineligible approvals blocked; independent fallback or approved alternate supplies at least two eligible people |
| ADD-AC-09 | Provisioner opens chapter record before and after separate membership approval | No access from provider role; later access only within approved chapter duties, with audit attribution |
| ADD-AC-10 | Reconcile float 2,000, cash sales 4,500, refund 500, prior sales deposit 1,000 and float return 2,000 | Remaining physical sales cash due 3,000; float due zero; each transfer counted once; GCash separate |
| ADD-AC-11 | Prepare RF/ROP shortage and an unpaid SO shortage | Approved chapter-budget procurement can proceed without buyer OR; SO-shortage procurement stays blocked pending required OR funding |
| ADD-AC-12 | Restricted officer opens map, tracer, linked record or export | Scope does not broaden; scenario data labeled illustrative; text alternative available; map outage does not block core posting |

### 20.2 Review revision

Version 1.2 review candidate adopts the recommended additions and corrections authorized in the current conversation on 19 October 2026. It strengthens count-variance independence explicitly, keeps actual staffing and monetary setup unapproved, and makes no historical claim of a verified prototype or accepted software. The user authorized publication of this five-document review candidate; publication does not establish implementation acceptance or live readiness.

## 21. Embedded adoption and consistency decisions

Recorded 19 October 2026 under the user's authorization to adopt the recommended additions and prepare review documents. The user subsequently requested a five-document package without publishing supporting records. This section embeds the decision register so the package can be interpreted without the local interview or adoption files. Historical source records remain evidence of origin, not additional required implementation specifications. Publication of this candidate is authorized; implementation acceptance and live readiness remain pending.

### Authority and identifier rules

The original product interview Q1–Q26 is valid historical evidence for the original product decisions; the product requirements and adopted resolutions are embedded in this package. The pulled APP-FLOW used Q20–Q26 for a different interface/architecture package; those labels become **UI-Q20–UI-Q26** here. APP-FLOW's earlier local Q1–Q19 remain local interaction labels. UI decision labels do not renumber the PRD's existing requirements.

PRD v1.2 candidate states observable behavior; TRD v2.1 candidate states technical controls and reproduces the operational requirements. APP-FLOW, backend architecture and schema must agree with them. Within this candidate, the explicit resolutions below supersede conflicting pulled wording. The stronger count-variance rule is a deliberate extension, not a claim that the original proposal already prohibited all preparer participation.

### Adopted additions

| Decision | Disposition | Product behavior and validation |
| --- | --- | --- |
| UI-Q20 Operations map | Adopt as a supporting feature after core workflows | Five scoped views, text alternative, scenario values clearly illustrative; map unavailability does not block core operations. ADD-01; ADD-AC-12 |
| UI-Q21 Queue filters | Adopt | In-place action/waiting/history changes, urgency and uncertain outcomes retained; explicit loading/empty/error states. ADD-02; ADD-AC-03 |
| UI-Q22 Demand tabs | Adopt | Summary, Lines & Clocks, Documents and History preserve draft/scroll context; explicit save/discard and stale-version handling. ADD-03; ADD-AC-04 |
| UI-Q23 Signature capture | Adopt with signed-paper fallback | Canvas smoothing and Clear/Redo, PNG evidence and optional structured strokes; exact batch acknowledgment, validated stored file hash and separate business snapshot hash. ADD-04; ADD-AC-05–ADD-AC-06 |
| UI-Q24 Booth cart | Adopt | Approved event catalog, labeled quantity controls, numeric entry, confirmed reset, fresh stock/payment checks and uncertain-posting lookup. ADD-05; ADD-AC-07 |
| UI-Q25 Variance approval | Adopt stricter count-variance rule | No variance approval by the count preparer/affected custodian; Head and Finance with eligible independent fallback. Ordinary claims retain configured approval. ADD-06; ADD-AC-08 |
| UI-Q26 RBAC | Adopt | Membership, canonical chapter duty permissions and action-specific checks; no automatic provider access; separate membership permitted. ADD-07; ADD-AC-09 |

### Inconsistency resolutions

| ID | Resolution | Affected review copies | Verification obligation |
| --- | --- | --- | --- |
| RES-01 | Usable on-hand includes reserved accepted goods; subtract reservations once to derive availability, counting hold/reservation intersections once | PRD sections 6/22, TRD, architecture, schema, flow | 10 on-hand / RF 4 / SO 3 → available 3; no physical movement from reservation |
| RES-02 | Seven quantities remain separately visible; they are overlapping views, not additive stock buckets | PRD INV-03, TRD TR-08/INV-03, flow, architecture, schema | RF/SO subtotals, quarantine, inbound and booth stay distinguishable |
| RES-03 | Available unpaid SO clock starts at reservation; separate deposit clock starts at buyer backorder acceptance; no RF or paid/funded auto-expiry | PRD RSV-01–RSV-10, TRD, flow, architecture, schema | ADD-AC-02; original AC-08–AC-10 |
| RES-04 | Fourteen chapter duties reflect PRD users; provider duties and buyer participation are separate; one role matrix controls references | TRD Appendix D/TR-17, flow, architecture, schema | Required duty coverage and per-operation scope/independence reviewed before setup |
| RES-05 | Actual people, scopes, limits and alternates remain provisional; illustrative four-person coverage is not automatic seed data | TRD Appendix D, embedded decisions, flow, schema | Demonstrate conflicts/absences, including cashier versus independent close-out review |
| RES-06 | Count preparer/affected custodian cannot approve their variance at all; Head/Finance and independent fallback use eligible people; no blanket preparer posting ban | PRD GOV-05/GOV-06/ADJ-04, TRD, flow, architecture, schema | ADD-AC-08; authorized receiving preparer can still post inspected RM |
| RES-07 | Provider authority grants no automatic chapter access; separate approved operational membership is allowed and audited | PRD GOV-03, TRD TR-17, role matrix, flow, architecture, schema | ADD-AC-09; original AC-19 |
| RES-08 | Float/amounts/references/SKUs are examples or approved configuration. Reconcile float, cash, refunds and prior transfers exactly once; GCash separately | PRD/TRD BTH-06, flow, architecture, schema | ADD-AC-10; original booth finance scenarios |
| RES-09 | Buyer OR funding gate applies to SO shortage procurement; RF/ROP procurement uses approved chapter funds; cannot relabel unpaid SO need | PRD/TRD PRC-01, flow map and F-05, architecture/schema invariants | ADD-AC-11; original AC-09/AC-15 |
| RES-10 | Ordinary claims follow configured approval; Finance additionally for refunds/unequal exchanges; Head-plus-Finance variance rule is not universal claim approval | PRD/TRD ADJ-04, flow, architecture, schema | Ordinary exchange, refund and count variance exercise different approval branches |
| RES-11 | Keep original product Q1–Q26 and separate UI-Q20–UI-Q26; distinguish design adoption, prototype demonstration and executed acceptance | PRD section 21, candidate metadata, flow/schema closure | No missing prototype or schema existence is counted as passed acceptance |
| RES-12 | Signature file bytes hash and acknowledged business snapshot hash have different purposes; validate server-side and require re-signing after material batch change | PRD DOC-08/ADD-04, TRD TR-15, flow, architecture, schema | Both capture methods; changed recipient/quantity; invalid evidence; duplicate/uncertain posting |

### Remaining inputs

Actual officer identities/duties and alternates, chapter policies/limits, item/catalog data, float and remittance schedule, Finance-approved payment accounts, cutover obligations, commercial terms and independent recovery readiness remain pre-live inputs. This review package supplies behavior and controls, not values or approvals for those inputs.

### Evidence status

- **Source evidence:** approved v2.0 proposal, original product interview and supporting flow coverage records.
- **Design adoption evidence:** the current conversation authorized the recommended resolutions and feature additions for review on 19 October 2026.
- **Prototype evidence:** `ysp_chapter_operations_ui.html` was referenced by the pull but is absent from this checkout. No demonstration/verification is certified here.
- **Implementation acceptance:** no application, migration, security, concurrency, recovery or live workflow tests are claimed by this package. Existing acceptance and new ADD-AC scenarios remain required.
- **Publication:** the user authorized this five-document review candidate in `docs/`. The root glossary and original proposal remain unchanged; prototype verification, application acceptance and live activation are separate requirements.

## 22. Domain glossary

These definitions are embedded for the five-document package. Usable on-hand continues to include reserved goods, consistent with the existing root glossary. No root glossary update is required to interpret these documents.

The language used for YSP chapter requisitions, merchandise sales, inventory, purchasing, and receiving.

### Organization and people

**Chapter**:
A local YSP organizational unit, such as YSP Cebu or YSP Liloan.
_Avoid_: Branch, tenant

**Event**:
A named chapter occasion that may provide the permitted-use context for goods. Its booth operation additionally records approved stock custody, trading and close-out.

**Committee requester**:
An authorized chapter member who requests goods for a committee or department.
_Avoid_: Customer, buyer

**Buyer**:
A member or external customer purchasing YSP merchandise, event kits, or program goods.
_Avoid_: Committee requester

**Chapter Head**:
The chapter president or authorized chapter lead.

**Chapter membership**:
An officer's explicitly authorized association with a chapter and its assigned operational roles.
_Avoid_: Buyer record

### Stock and custody

**Stockroom stock**:
Goods held in a chapter's stockroom rather than entrusted to an event booth.
_Avoid_: Booth stock

**Booth custody stock**:
Goods entrusted to a named booth custodian for an event.
_Avoid_: Available stockroom stock, booth reservation

**Usable on-hand stock**:
Accepted stock held in the stockroom, including reserved goods and goods under an eligibility hold until authorized condition treatment, excluding goods in quarantine or booth custody.
_Avoid_: Available-to-allocate stock

**Stock hold**:
A restriction on use of identified stock while a finding or condition is unresolved; several holds may cover the same goods. Holds block use until every applicable hold is cleared, without themselves changing recorded physical quantity or condition.
_Avoid_: Write-off, quarantine movement

**Reserved stock**:
Usable stock committed to an approved requisition or sales order and awaiting handover. RF-reserved and SO-reserved quantities remain separately identifiable; reservation does not remove units from usable on-hand.

**Available-to-allocate stock**:
Usable stockroom stock eligible for the intended demand, excluding active reservations and applicable holds.
_Avoid_: Usable on-hand stock

**Quarantined stock**:
Goods held outside usable stock because of damage, rejection, a defect, or another unresolved condition.
_Avoid_: Saleable stock

**Custody movement**:
A handover of goods between a stockroom and a named booth custodian.
_Avoid_: Merchandise sale

### Demand and sales

**Requisition Form (RF)**:
A department or committee request for internal goods or an event booth's bulk stock checkout.

**Sales Order (SO)**:
A buyer's standard or preorder merchandise order recorded by Sales.

**Track 1 sale**:
A standard or preorder sale involving an SO and later pickup or delivery.

**Track 2 sale**:
A completed event-booth or counter sale of goods available for immediate handover.

**Sales Invoice (SI)**:
A billing record stating the merchandise and amount owed.
_Avoid_: Proof of payment

**Official Receipt (OR)**:
A record of verified payment, including a verified downpayment where applicable.
_Avoid_: Sales Invoice, payment screenshot

**Downpayment**:
A verified advance payment associated with a buyer's order, including funding for backorder procurement.
_Avoid_: Proof of full settlement

**Payment allocation**:
The portion of a verified buyer payment attributed to specified order items or quantities.
_Avoid_: New payment

**Procurement-funding designation**:
The portion of verified buyer credit designated to the approved cost of a particular accepted backorder. The designation does not create another payment or consume that credit a second time.
_Avoid_: Supplier payment, additional buyer charge

**Release coverage**:
Verified buyer credit allocated to the merchandise value of specified quantities awaiting or undergoing handover. Coverage is consumed only for the actual quantities handed over.
_Avoid_: Procurement funding, proof of full-order settlement

**Funded backorder commitment**:
An accepted order shortage supported by a verified downpayment allocated to its approved procurement cost.
_Avoid_: Fully paid merchandise

**Partial fulfillment**:
Handover of part of an approved requisition or sales order while its remaining demand stays outstanding.

**Partial receipt**:
Acceptance of part of a purchase order's quantity while the rest remains outstanding or disputed.

### Receiving and replenishment

**Initial Physical Count Sheet (IPC)**:
The signed count of existing goods forming a chapter's opening-stock baseline.
_Avoid_: Routine recount

**Donation / Sponsorship Acknowledgment (DA)**:
A record of in-kind donated goods, their donor, valuation basis, and any conditions on use.
_Avoid_: Cash receipt

**Receiving Report (RM)**:
The record of accepted goods inspected against a PO, DA, or IPC.

**Restricted donation stock**:
Donated goods whose eligibility for sale or internal use is limited by donor conditions.
_Avoid_: Unrestricted merchandise

**Uninterpreted donor condition**:
A donor condition whose permitted use has not been recorded in the supported restriction vocabulary. The affected goods remain unavailable for allocation until an authorized interpretation or resolution makes eligibility expressible.
_Avoid_: Unrestricted stock, ordinary allocation override

**Reorder point (ROP)**:
An approved item-level threshold marking low usable stockroom stock.

**Target stock level**:
The approved stock level used to determine a proposed replenishment quantity.
_Avoid_: Reorder point

**Stock Adjustment / Return Slip (ADJ)**:
The controlled record of a return, exchange, replacement, or physical-count variance.
_Avoid_: Direct balance edit

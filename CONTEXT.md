# YSP Chapter Operations

The language used for YSP chapter requisitions, merchandise sales, inventory, purchasing, and receiving.

## Organization and people

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

## Stock and custody

**Stockroom stock**:
Goods held in a chapter's stockroom rather than entrusted to an event booth.
_Avoid_: Booth stock

**Booth custody stock**:
Goods entrusted to a named booth custodian for an event.
_Avoid_: Available stockroom stock, booth reservation

**Usable on-hand stock**:
Accepted stock held in the stockroom, including reserved goods, excluding goods in quarantine or booth custody.
_Avoid_: Available-to-allocate stock

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

## Demand and sales

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

## Receiving and replenishment

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

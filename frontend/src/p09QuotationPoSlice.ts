import { computeDeterministicHash } from './canonicalHash';
import type { UnitQuantity } from './p05InventorySlice';
import { fromMicroUnits, isValidUnitQuantity, toMicroUnits } from './p05InventorySlice';

export const P09_CONTEXT_STORAGE_KEY = 'ysp_p09_context';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{2})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

function moneyToCents(raw: string): bigint {
  const clean = raw.trim();
  if (!MONEY_PATTERN.test(clean)) {
    throw new Error(`INVALID_MONEY: "${raw}"`);
  }
  const [whole = '0', cents = '00'] = clean.split('.');
  return BigInt(whole) * 100n + BigInt(cents);
}

export interface ApprovedRepfSource {
  source_id: string;
  repf_reference: string;
  preparer_user_id: string;
  variant_id: string;
  item_name?: string | undefined;
  approved_need_quantity: UnitQuantity;
  budget_ceiling_amount: string;
  min_required_quotes: number;
  is_emergency: boolean;
  selected_quotation_id: string | null;
  po_id: string | null;
}

export interface SupplierQuotation {
  quotation_id: string;
  repf_source_id: string;
  supplier_name: string;
  unit_price: string;
  total_cost: string;
  lead_time_days: number;
  warranty_terms: string;
  payment_terms: string;
  spec_matches_repf: boolean;
  selected: boolean;
  selection_rationale: string | null;
}

export type PurchaseOrderStatus = 'issued' | 'acknowledged' | 'canceled';

export interface PurchaseOrderRecord {
  po_id: string;
  chapter_id: string;
  reference: string;
  repf_source_id: string;
  repf_reference: string;
  quotation_id: string;
  supplier_name: string;
  variant_id: string;
  ordered_quantity: UnitQuantity;
  accepted_quantity: string;
  outstanding_quantity: string;
  total_cost: string;
  payment_terms: string;
  delivery_location: string;
  expected_delivery_at: string;
  preparer_user_id: string;
  approver_user_id: string;
  supplier_acknowledged_at: string | null;
  status: PurchaseOrderStatus;
  version: number;
  material_version: number;
  amendment_reason: string | null;
}

export interface P09HistoryEntry {
  event_id: string;
  po_id: string | null;
  repf_source_id: string;
  version: number;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P09SupplySummary {
  usable_on_hand: string;
  confirmed_inbound_quantity: string;
  uncovered_net_need: string;
  issued_po_count: number;
}

export interface P09OperationLedgerEntry {
  operation_id: string;
  chapter_id: string;
  action_code: string;
  actor_user_id: string;
  target_id: string | null;
  idempotency_key: string;
  payload_fingerprint: string;
  http_status: number;
  code: string;
  message: string;
  snapshot: unknown;
}

export interface P09ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P09LookupResult {
  action_result: 'recovered' | 'uncertain' | 'forbidden';
  input_policy: 'may_clear' | 'preserve';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P09EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  repf_sources: ReadonlyArray<ApprovedRepfSource>;
  quotations: ReadonlyArray<SupplierQuotation>;
  purchase_orders: ReadonlyArray<PurchaseOrderRecord>;
  history: ReadonlyArray<P09HistoryEntry>;
  summary: P09SupplySummary;
  operation_ledger: ReadonlyArray<P09OperationLedgerEntry>;
  last_action: P09ActionResult | null;
}

export interface P09EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
}

export interface P09QuotationPoEngine {
  getSnapshot: () => P09EngineSnapshot;
  registerApprovedRepfSource: (input: {
    chapter_id?: string | undefined;
    repf_reference: string;
    preparer_user_id: string;
    variant_id: string;
    item_name?: string | undefined;
    approved_need_quantity_value: string;
    quantity_scale: number;
    budget_ceiling_amount: string;
    min_required_quotes: number;
    is_emergency: boolean;
  }) => P09ActionResult<ApprovedRepfSource>;
  recordSupplierQuotation: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    repf_source_id: string;
    supplier_name: string;
    unit_price: string;
    total_cost: string;
    lead_time_days: number;
    warranty_terms: string;
    payment_terms: string;
    spec_matches_repf: boolean;
    idempotency_key?: string | undefined;
  }) => P09ActionResult<SupplierQuotation>;
  selectWinningQuotation: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    repf_source_id: string;
    quotation_id: string;
    selection_rationale: string;
    idempotency_key?: string | undefined;
  }) => P09ActionResult<SupplierQuotation>;
  issueApprovedPo: (input: {
    chapter_id?: string | undefined;
    repf_source_id: string;
    approver_user_id: string;
    has_purchase_authority: boolean;
    delivery_location: string;
    expected_delivery_at: string;
    idempotency_key?: string | undefined;
  }) => P09ActionResult<PurchaseOrderRecord>;
  acknowledgeSupplierPo: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    po_id: string;
    acknowledged_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P09ActionResult<PurchaseOrderRecord>;
  amendOrCancelPo: (input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    po_id: string;
    action_type: 'amend' | 'cancel';
    new_quantity_value?: string | undefined;
    new_expected_delivery_at?: string | undefined;
    reason: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }) => P09ActionResult<PurchaseOrderRecord>;
  lookupPoOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P09ActionResult<P09LookupResult>;
}

function readStoredP09Options(): P09EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P09_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P09EngineOptions;
  } catch {
    return undefined;
  }
}

function formatTrimmedMicro(micro: bigint): string {
  const whole = micro / 1000000n;
  const rem = micro % 1000000n;
  if (rem === 0n) return whole.toString();
  return `${whole.toString()}.${rem.toString().padStart(6, '0').replace(/0+$/, '')}`;
}

export function createP09QuotationPoEngine(options?: P09EngineOptions): P09QuotationPoEngine {
  const seed = options ?? readStoredP09Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 9000;
  let poRefSeq = 0;

  const repfSources: ApprovedRepfSource[] = [];
  const quotations: SupplierQuotation[] = [];
  const purchaseOrders: PurchaseOrderRecord[] = [];
  const history: P09HistoryEntry[] = [];
  const operationLedger: P09OperationLedgerEntry[] = [];
  let lastAction: P09ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P09${String(seq).padStart(19, '0')}`;
  }

  function nextTimestamp(): string {
    return `2026-11-22T12:25:${String(seq % 60).padStart(2, '0')}.000000Z`;
  }

  function allocatePoReference(): string {
    poRefSeq += 1;
    return `${chapterPrefix}-PO-2026-${String(poRefSeq).padStart(6, '0')}`;
  }

  function recordOutcome<T>(res: P09ActionResult<T>): P09ActionResult<T> {
    lastAction = res;
    return res;
  }

  function checkChapter<T>(requested?: string): P09ActionResult<T> | null {
    if (requested !== undefined && requested !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested procurement record is outside authorized chapter scope.',
      });
    }
    return null;
  }

  function checkIdempotency<T>(params: {
    action_code: string;
    actor_user_id: string;
    target_id: string | null;
    idempotency_key?: string | undefined;
    payload: unknown;
  }):
    | { status: 'replay'; result: P09ActionResult<T> }
    | { status: 'conflict'; result: P09ActionResult<T> }
    | { status: 'fresh'; key: string | null; fingerprint: string } {
    const key = params.idempotency_key?.trim() || null;
    const fingerprint = computeDeterministicHash({
      target_id: params.target_id,
      payload: params.payload,
    });
    if (!key) return { status: 'fresh', key: null, fingerprint };

    const existing = operationLedger.find(
      (e) =>
        e.chapter_id === chapterId &&
        e.action_code === params.action_code &&
        e.actor_user_id === params.actor_user_id &&
        e.idempotency_key === key
    );
    if (!existing) return { status: 'fresh', key, fingerprint };
    if (existing.payload_fingerprint === fingerprint) {
      return {
        status: 'replay',
        result: recordOutcome<T>({
          ok: true,
          http_status: existing.http_status,
          code: existing.code,
          message: existing.message,
          replayed: true,
          data: structuredClone(existing.snapshot) as T,
        }),
      };
    }
    return {
      status: 'conflict',
      result: recordOutcome<T>({
        ok: false,
        http_status: 409,
        code: 'ACTION_KEY_CONFLICT',
        message: 'Idempotency key was already committed with a different request payload.',
      }),
    };
  }

  function commitToLedger<T>(params: {
    action_code: string;
    actor_user_id: string;
    target_id: string | null;
    key: string | null;
    fingerprint: string;
    http_status: number;
    code: string;
    message: string;
    snapshot: T;
  }): P09ActionResult<T> {
    if (params.key) {
      operationLedger.push({
        operation_id: nextUlid(),
        chapter_id: chapterId,
        action_code: params.action_code,
        actor_user_id: params.actor_user_id,
        target_id: params.target_id,
        idempotency_key: params.key,
        payload_fingerprint: params.fingerprint,
        http_status: params.http_status,
        code: params.code,
        message: params.message,
        snapshot: structuredClone(params.snapshot),
      });
    }
    return recordOutcome({
      ok: true,
      http_status: params.http_status,
      code: params.code,
      message: params.message,
      replayed: false,
      data: structuredClone(params.snapshot),
    });
  }

  function computeSummary(): P09SupplySummary {
    const totalNeedMicro = repfSources.reduce(
      (acc, src) => acc + toMicroUnits(src.approved_need_quantity.value),
      0n
    );
    const activeInboundMicro = purchaseOrders
      .filter((po) => po.status !== 'canceled')
      .reduce((acc, po) => acc + toMicroUnits(po.outstanding_quantity), 0n);
    const uncoveredMicro =
      totalNeedMicro > activeInboundMicro ? totalNeedMicro - activeInboundMicro : 0n;

    return {
      usable_on_hand: '0', // Issued POs never increase physical on-hand inventory
      confirmed_inbound_quantity: formatTrimmedMicro(activeInboundMicro),
      uncovered_net_need: formatTrimmedMicro(uncoveredMicro),
      issued_po_count: purchaseOrders.filter((po) => po.status !== 'canceled').length,
    };
  }

  function appendHistory(params: {
    po_id: string | null;
    repf_source_id: string;
    version: number;
    action: string;
    actor_user_id: string;
    reason: string | null;
  }) {
    history.push({
      event_id: nextId(),
      po_id: params.po_id,
      repf_source_id: params.repf_source_id,
      version: params.version,
      action: params.action,
      actor_user_id: params.actor_user_id,
      reason: params.reason,
      timestamp: nextTimestamp(),
    });
  }

  function registerApprovedRepfSource(input: {
    chapter_id?: string | undefined;
    repf_reference: string;
    preparer_user_id: string;
    variant_id: string;
    item_name?: string | undefined;
    approved_need_quantity_value: string;
    quantity_scale: number;
    budget_ceiling_amount: string;
    min_required_quotes: number;
    is_emergency: boolean;
  }): P09ActionResult<ApprovedRepfSource> {
    const scopeErr = checkChapter<ApprovedRepfSource>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const ref = input.repf_reference.trim();
    const prepId = input.preparer_user_id.trim();
    const variantId = input.variant_id.trim();
    const qtyVal = input.approved_need_quantity_value.trim();

    if (!ref || !prepId || !variantId) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'SOURCE_FIELDS_REQUIRED',
        message: 'Approved purchase request reference, preparer ID, and variant ID are required.',
      });
    }
    if (!isValidUnitQuantity({ value: qtyVal, quantity_scale: input.quantity_scale }) || toMicroUnits(qtyVal) <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: `Approved quantity "${qtyVal}" must be positive at scale ${input.quantity_scale}.`,
      });
    }
    if (!MONEY_PATTERN.test(input.budget_ceiling_amount.trim()) || input.budget_ceiling_amount.trim() === '0.00') {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_MONEY_AMOUNT',
        message: 'Budget ceiling must be a valid positive decimal amount.',
      });
    }
    if (!Number.isInteger(input.min_required_quotes) || input.min_required_quotes < 1) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUOTE_THRESHOLD',
        message: 'Minimum comparable quote count must be at least 1.',
      });
    }

    const src: ApprovedRepfSource = {
      source_id: nextId(),
      repf_reference: ref,
      preparer_user_id: prepId,
      variant_id: variantId,
      item_name: input.item_name?.trim() || undefined,
      approved_need_quantity: fromMicroUnits(toMicroUnits(qtyVal), input.quantity_scale),
      budget_ceiling_amount: input.budget_ceiling_amount.trim(),
      min_required_quotes: input.min_required_quotes,
      is_emergency: input.is_emergency,
      selected_quotation_id: null,
      po_id: null,
    };
    repfSources.push(src);

    return recordOutcome({
      ok: true,
      http_status: 201,
      code: 'APPROVED_REPF_REGISTERED',
      message: `Registered approved source ${src.repf_reference} (${src.approved_need_quantity.value} units needed; budget ceiling PHP ${src.budget_ceiling_amount}).`,
      data: structuredClone(src),
    });
  }

  function recordSupplierQuotation(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    repf_source_id: string;
    supplier_name: string;
    unit_price: string;
    total_cost: string;
    lead_time_days: number;
    warranty_terms: string;
    payment_terms: string;
    spec_matches_repf: boolean;
    idempotency_key?: string | undefined;
  }): P09ActionResult<SupplierQuotation> {
    const scopeErr = checkChapter<SupplierQuotation>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<SupplierQuotation>({
      action_code: 'po.quote.record',
      actor_user_id: actor,
      target_id: input.repf_source_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const src = repfSources.find((s) => s.source_id === input.repf_source_id);
    if (!src) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Approved purchase request source was not found.',
      });
    }
    if (!input.spec_matches_repf) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INCOMPATIBLE_QUOTATION_SPEC',
        message: 'Quotations must compare like-for-like approved item specifications.',
      });
    }
    if (!input.supplier_name.trim() || !input.warranty_terms.trim() || !input.payment_terms.trim()) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'QUOTATION_FIELDS_REQUIRED',
        message: 'Supplier name, warranty details, and commercial payment terms are required.',
      });
    }
    if (
      !MONEY_PATTERN.test(input.unit_price.trim()) ||
      !MONEY_PATTERN.test(input.total_cost.trim()) ||
      input.total_cost.trim() === '0.00'
    ) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_MONEY_AMOUNT',
        message: 'Unit price and total cost must be valid positive 2-decimal amounts.',
      });
    }

    const quote: SupplierQuotation = {
      quotation_id: nextId(),
      repf_source_id: src.source_id,
      supplier_name: input.supplier_name.trim(),
      unit_price: input.unit_price.trim(),
      total_cost: input.total_cost.trim(),
      lead_time_days: input.lead_time_days,
      warranty_terms: input.warranty_terms.trim(),
      payment_terms: input.payment_terms.trim(),
      spec_matches_repf: true,
      selected: false,
      selection_rationale: null,
    };

    quotations.push(quote);
    appendHistory({
      po_id: null,
      repf_source_id: src.source_id,
      version: 1,
      action: 'recordSupplierQuotation',
      actor_user_id: actor,
      reason: `${quote.supplier_name} quoted PHP ${quote.total_cost}`,
    });

    return commitToLedger({
      action_code: 'po.quote.record',
      actor_user_id: actor,
      target_id: quote.quotation_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 201,
      code: 'QUOTATION_RECORDED',
      message: `Recorded supplier quotation #${quote.quotation_id} from ${quote.supplier_name} (PHP ${quote.total_cost}).`,
      snapshot: quote,
    });
  }

  function selectWinningQuotation(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    repf_source_id: string;
    quotation_id: string;
    selection_rationale: string;
    idempotency_key?: string | undefined;
  }): P09ActionResult<SupplierQuotation> {
    const scopeErr = checkChapter<SupplierQuotation>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<SupplierQuotation>({
      action_code: 'po.quote.select',
      actor_user_id: actor,
      target_id: input.quotation_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const src = repfSources.find((s) => s.source_id === input.repf_source_id);
    const quote = quotations.find(
      (q) => q.quotation_id === input.quotation_id && q.repf_source_id === input.repf_source_id
    );
    if (!src || !quote) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Purchase request source or quotation was not found.',
      });
    }

    const sourceQuotes = quotations.filter((q) => q.repf_source_id === src.source_id);
    if (!src.is_emergency && sourceQuotes.length < src.min_required_quotes) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'QUOTATION_THRESHOLD_UNMET',
        message: `Chapter policy requires at least ${src.min_required_quotes} comparable quotations (${sourceQuotes.length} recorded).`,
      });
    }

    const cleanRationale = input.selection_rationale.trim();
    if (!cleanRationale) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'RATIONALE_REQUIRED',
        message: 'Selection rationale is required when choosing a winning supplier.',
      });
    }

    if (moneyToCents(quote.total_cost) > moneyToCents(src.budget_ceiling_amount)) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'BUDGET_CEILING_EXCEEDED',
        message: `Quotation total (PHP ${quote.total_cost}) exceeds approved chapter budget ceiling (PHP ${src.budget_ceiling_amount}).`,
      });
    }

    for (const q of sourceQuotes) {
      q.selected = q.quotation_id === quote.quotation_id;
      if (!q.selected) q.selection_rationale = null;
    }
    quote.selection_rationale = cleanRationale;
    src.selected_quotation_id = quote.quotation_id;

    appendHistory({
      po_id: null,
      repf_source_id: src.source_id,
      version: 1,
      action: 'selectWinningQuotation',
      actor_user_id: actor,
      reason: cleanRationale,
    });

    return commitToLedger({
      action_code: 'po.quote.select',
      actor_user_id: actor,
      target_id: quote.quotation_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'WINNING_QUOTATION_SELECTED',
      message: `Selected ${quote.supplier_name} (PHP ${quote.total_cost}) for ${src.repf_reference}.`,
      snapshot: quote,
    });
  }

  function issueApprovedPo(input: {
    chapter_id?: string | undefined;
    repf_source_id: string;
    approver_user_id: string;
    has_purchase_authority: boolean;
    delivery_location: string;
    expected_delivery_at: string;
    idempotency_key?: string | undefined;
  }): P09ActionResult<PurchaseOrderRecord> {
    const scopeErr = checkChapter<PurchaseOrderRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const approver = input.approver_user_id.trim();
    const idem = checkIdempotency<PurchaseOrderRecord>({
      action_code: 'po.issue',
      actor_user_id: approver,
      target_id: input.repf_source_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    if (!input.has_purchase_authority) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'PURCHASE_AUTHORITY_REQUIRED',
        message: 'Authorized purchase authority approval is required before issuing a Purchase Order.',
      });
    }

    const src = repfSources.find((s) => s.source_id === input.repf_source_id);
    if (!src) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Purchase request source was not found.',
      });
    }
    if (approver === src.preparer_user_id) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'INDEPENDENCE_REQUIRED',
        message: 'Purchase request preparer cannot approve and issue their own Purchase Order.',
      });
    }
    if (src.po_id !== null) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'DUPLICATE_PO_FOR_REPF',
        message: 'A Purchase Order has already been issued for this approved purchase request.',
      });
    }

    const quote = quotations.find((q) => q.quotation_id === src.selected_quotation_id && q.selected);
    if (!quote) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'WINNING_QUOTATION_REQUIRED',
        message: 'Select a policy-compliant winning supplier quotation before issuing a Purchase Order.',
      });
    }
    if (!input.delivery_location.trim()) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'DELIVERY_LOCATION_REQUIRED',
        message: 'Receiving location is required on the Purchase Order.',
      });
    }
    if (!UTC_INSTANT_PATTERN.test(input.expected_delivery_at.trim())) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_INSTANT',
        message: 'Expected delivery date must be a valid Z-suffixed UTC instant.',
      });
    }

    const po: PurchaseOrderRecord = {
      po_id: nextId(),
      chapter_id: chapterId,
      reference: allocatePoReference(),
      repf_source_id: src.source_id,
      repf_reference: src.repf_reference,
      quotation_id: quote.quotation_id,
      supplier_name: quote.supplier_name,
      variant_id: src.variant_id,
      ordered_quantity: structuredClone(src.approved_need_quantity),
      accepted_quantity: '0',
      outstanding_quantity: src.approved_need_quantity.value,
      total_cost: quote.total_cost,
      payment_terms: quote.payment_terms,
      delivery_location: input.delivery_location.trim(),
      expected_delivery_at: input.expected_delivery_at.trim(),
      preparer_user_id: src.preparer_user_id,
      approver_user_id: approver,
      supplier_acknowledged_at: null,
      status: 'issued',
      version: 1,
      material_version: 1,
      amendment_reason: null,
    };

    purchaseOrders.push(po);
    src.po_id = po.po_id;
    appendHistory({
      po_id: po.po_id,
      repf_source_id: src.source_id,
      version: po.version,
      action: 'issueApprovedPo',
      actor_user_id: approver,
      reason: `Issued ${po.reference} to ${po.supplier_name} for ${po.ordered_quantity.value} units`,
    });

    return commitToLedger({
      action_code: 'po.issue',
      actor_user_id: approver,
      target_id: po.po_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 201,
      code: 'PO_ISSUED',
      message: `Issued ${po.reference} to ${po.supplier_name} (${po.outstanding_quantity} confirmed inbound; usable on-hand unchanged at 0).`,
      snapshot: po,
    });
  }

  function acknowledgeSupplierPo(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    po_id: string;
    acknowledged_at: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }): P09ActionResult<PurchaseOrderRecord> {
    const scopeErr = checkChapter<PurchaseOrderRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<PurchaseOrderRecord>({
      action_code: 'po.acknowledge',
      actor_user_id: actor,
      target_id: input.po_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const po = purchaseOrders.find((p) => p.po_id === input.po_id);
    if (!po) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Purchase Order was not found.',
      });
    }
    if (po.version !== input.expected_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Purchase Order version changed before acknowledgment.',
      });
    }
    if (po.status === 'canceled') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: 'Canceled Purchase Orders cannot be acknowledged.',
      });
    }
    if (!UTC_INSTANT_PATTERN.test(input.acknowledged_at.trim())) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_INSTANT',
        message: 'Acknowledgment timestamp must be a valid Z-suffixed UTC instant.',
      });
    }

    po.status = 'acknowledged';
    po.supplier_acknowledged_at = input.acknowledged_at.trim();
    po.version += 1;
    appendHistory({
      po_id: po.po_id,
      repf_source_id: po.repf_source_id,
      version: po.version,
      action: 'acknowledgeSupplierPo',
      actor_user_id: actor,
      reason: `Supplier acknowledged at ${po.supplier_acknowledged_at}`,
    });

    return commitToLedger({
      action_code: 'po.acknowledge',
      actor_user_id: actor,
      target_id: po.po_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'PO_ACKNOWLEDGED',
      message: `Recorded supplier acknowledgment on ${po.reference}.`,
      snapshot: po,
    });
  }

  function amendOrCancelPo(input: {
    chapter_id?: string | undefined;
    actor_user_id: string;
    po_id: string;
    action_type: 'amend' | 'cancel';
    new_quantity_value?: string | undefined;
    new_expected_delivery_at?: string | undefined;
    reason: string;
    expected_version: number;
    idempotency_key?: string | undefined;
  }): P09ActionResult<PurchaseOrderRecord> {
    const scopeErr = checkChapter<PurchaseOrderRecord>(input.chapter_id);
    if (scopeErr) return scopeErr;

    const actor = input.actor_user_id.trim();
    const idem = checkIdempotency<PurchaseOrderRecord>({
      action_code: `po.${input.action_type}`,
      actor_user_id: actor,
      target_id: input.po_id,
      idempotency_key: input.idempotency_key,
      payload: input,
    });
    if (idem.status !== 'fresh') return idem.result;

    const po = purchaseOrders.find((p) => p.po_id === input.po_id);
    const src = po ? repfSources.find((s) => s.source_id === po.repf_source_id) : undefined;
    if (!po || !src) {
      return recordOutcome({
        ok: false,
        http_status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Purchase Order was not found.',
      });
    }
    if (po.version !== input.expected_version) {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'VERSION_CONFLICT',
        message: 'Purchase Order version changed before update.',
      });
    }
    if (po.status === 'canceled') {
      return recordOutcome({
        ok: false,
        http_status: 409,
        code: 'STATE_CONFLICT',
        message: 'Purchase Order is already canceled.',
      });
    }

    const cleanReason = input.reason.trim();
    if (!cleanReason) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'REASON_REQUIRED',
        message: 'An explicit audit reason is required to amend or cancel a Purchase Order.',
      });
    }

    if (input.action_type === 'cancel') {
      po.status = 'canceled';
      po.outstanding_quantity = '0';
      po.amendment_reason = cleanReason;
      po.version += 1;
      src.po_id = null;

      appendHistory({
        po_id: po.po_id,
        repf_source_id: po.repf_source_id,
        version: po.version,
        action: 'cancelPo',
        actor_user_id: actor,
        reason: cleanReason,
      });

      return commitToLedger({
        action_code: 'po.cancel',
        actor_user_id: actor,
        target_id: po.po_id,
        key: idem.key,
        fingerprint: idem.fingerprint,
        http_status: 200,
        code: 'PO_CANCELED',
        message: `Canceled ${po.reference}; net supply need reopened for ${src.repf_reference}.`,
        snapshot: po,
      });
    }

    const scale = po.ordered_quantity.quantity_scale;
    const nextQtyVal = input.new_quantity_value?.trim() || po.ordered_quantity.value;
    if (!isValidUnitQuantity({ value: nextQtyVal, quantity_scale: scale }) || toMicroUnits(nextQtyVal) <= 0n) {
      return recordOutcome({
        ok: false,
        http_status: 422,
        code: 'INVALID_QUANTITY',
        message: `Amended quantity "${nextQtyVal}" must be positive at scale ${scale}.`,
      });
    }

    if (input.new_expected_delivery_at?.trim()) {
      if (!UTC_INSTANT_PATTERN.test(input.new_expected_delivery_at.trim())) {
        return recordOutcome({
          ok: false,
          http_status: 422,
          code: 'INVALID_UTC_INSTANT',
          message: 'Amended expected delivery date must be a valid Z-suffixed UTC instant.',
        });
      }
      po.expected_delivery_at = input.new_expected_delivery_at.trim();
    }

    const qtyFormatted = fromMicroUnits(toMicroUnits(nextQtyVal), scale);
    po.ordered_quantity = qtyFormatted;
    po.outstanding_quantity = qtyFormatted.value;
    po.amendment_reason = cleanReason;
    po.version += 1;
    po.material_version += 1;

    appendHistory({
      po_id: po.po_id,
      repf_source_id: po.repf_source_id,
      version: po.version,
      action: 'amendPo',
      actor_user_id: actor,
      reason: cleanReason,
    });

    return commitToLedger({
      action_code: 'po.amend',
      actor_user_id: actor,
      target_id: po.po_id,
      key: idem.key,
      fingerprint: idem.fingerprint,
      http_status: 200,
      code: 'PO_AMENDED',
      message: `Amended ${po.reference} (qty: ${po.ordered_quantity.value}, m${po.material_version}).`,
      snapshot: po,
    });
  }

  function lookupPoOperation(input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }): P09ActionResult<P09LookupResult> {
    if (input.chapter_id !== chapterId) {
      return recordOutcome({
        ok: false,
        http_status: 403,
        code: 'FORBIDDEN_REDACTED',
        message: 'Requested operation scope is outside authorized chapter.',
        data: {
          action_result: 'forbidden',
          input_policy: 'preserve',
          lookup_state: null,
          operation_id: null,
          idempotency_key: null,
          recovered_snapshot: null,
        },
      });
    }

    const found =
      input.query_type === 'by_key'
        ? operationLedger.find(
            (e) =>
              e.chapter_id === chapterId &&
              (!input.action_code || e.action_code === input.action_code) &&
              e.idempotency_key === input.idempotency_key?.trim()
          )
        : operationLedger.find(
            (e) => e.chapter_id === chapterId && e.operation_id === input.operation_id?.trim()
          );

    if (found) {
      return recordOutcome({
        ok: true,
        http_status: 200,
        code: 'OPERATION_RECOVERED',
        message: `Recovered committed operation (${found.code}) for key "${found.idempotency_key}".`,
        data: {
          action_result: 'recovered',
          input_policy: 'may_clear',
          lookup_state: null,
          operation_id: found.operation_id,
          idempotency_key: found.idempotency_key,
          recovered_snapshot: structuredClone(found.snapshot),
        },
      });
    }

    return recordOutcome({
      ok: false,
      http_status: 200,
      code: 'OPERATION_UNCERTAIN',
      message:
        'No visible Purchase Order operation found. Preserve entered details before retrying.',
      data: {
        action_result: 'uncertain',
        input_policy: 'preserve',
        lookup_state: 'pending_or_not_visible',
        operation_id: null,
        idempotency_key: input.idempotency_key?.trim() || null,
        recovered_snapshot: null,
      },
    });
  }

  return {
    getSnapshot: () => ({
      chapter_id: chapterId,
      chapter_prefix: chapterPrefix,
      chapter_name: chapterName,
      repf_sources: repfSources.map((s) => structuredClone(s)),
      quotations: quotations.map((q) => structuredClone(q)),
      purchase_orders: purchaseOrders.map((p) => structuredClone(p)),
      history: history.map((h) => structuredClone(h)),
      summary: computeSummary(),
      operation_ledger: operationLedger.map((o) => structuredClone(o)),
      last_action: lastAction,
    }),
    registerApprovedRepfSource,
    recordSupplierQuotation,
    selectWinningQuotation,
    issueApprovedPo,
    acknowledgeSupplierPo,
    amendOrCancelPo,
    lookupPoOperation,
  };
}

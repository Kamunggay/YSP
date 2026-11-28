import {
  ContractApiError,
  apiGetRaw,
  apiGetText,
  apiMutate,
  buildQuery,
  newActionKey,
} from './client.ts';
import type {
  AdditionalPurchaseReason,
  AllocationQueueListResponse,
  BoundedRestriction,
  ControlReportResponse,
  ControlReportStatus,
  Donation,
  DonationHistoryEntry,
  DonationLineInput,
  DonationMutationName,
  DonationOperationReceipt,
  DonationRelatedEntry,
  DonationStatus,
  InlineSupplierMetadata,
  InventoryReportResponse,
  InventoryReportStatus,
  OfficerAlertListResponse,
  OfficerAlertSeverity,
  OfficerAlertType,
  ProcurementActor,
  ProcurementOperationName,
  ProcurementOperationReceipt,
  ProcurementReportResponse,
  ProcurementReportStatus,
  PurchaseOrder,
  PurchaseOrderAmendment,
  PurchaseOrderAmendmentLineInput,
  PurchaseOrderHistoryEntry,
  PurchaseOrderLineInput,
  PurchaseOrderRelatedRecord,
  PurchaseOrderStatus,
  QuarantinedLotDisposition,
  ReceivingDiscrepancy,
  ReceivingDiscrepancyResolutionKind,
  ReceivingDiscrepancyStatus,
  ReceivingHold,
  ReceivingHoldHistoryEntry,
  ReceivingHoldItemInput,
  ReceivingHoldStatus,
  ReceivingMovement,
  ReceivingOperationName,
  ReceivingOperationReceipt,
  ReceivingReport,
  ReceivingReportHistoryEntry,
  ReceivingReportLineInput,
  ReceivingReportRelatedRecord,
  ReceivingReportStatus,
  ReceivingSourceKind,
  Repf,
  RepfBudgetDecision,
  RepfHistoryEntry,
  RepfLineInput,
  RepfQuotation,
  RepfQuotationLineInput,
  RepfRelatedRecord,
  RepfStatus,
  RepfTriggerKind,
  RepfUrgency,
  ReplenishmentNeedItem,
  ReplenishmentTriggerFilter,
  Stage2Duty,
  Stage2EvidenceByteBinding,
  SupplierSelection,
} from './stage2Types.ts';
import type { CursorPage } from './types.ts';

export interface Stage2PagedResult<T> {
  data: T[];
  page: CursorPage;
}

export interface Stage2PreviewRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body: unknown | null;
  actionKey?: string;
}

export interface Stage2PreviewAdapter {
  isEnabled(): boolean;
  handleJson<T>(request: Stage2PreviewRequest): Promise<T | null>;
  handleText(path: string): Promise<string | null>;
}

let previewAdapter: Stage2PreviewAdapter | null = null;

/**
 * Registers an injectable request adapter for automated contract-fixture unit tests.
 */
export function registerStage2PreviewAdapter(adapter: Stage2PreviewAdapter | null): void {
  previewAdapter = adapter;
}

/** Returns current UTC instant formatted with 6 fractional digits per OpenAPI UtcInstant. */
export function nowUtcInstant(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, '.000000Z');
}

/** Converts an `<input type="datetime-local">` value to a canonical 6-digit UTC instant. */
export function localDateTimeToUtcInstant(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return nowUtcInstant();
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return nowUtcInstant();
  }
  return parsed.toISOString().replace(/\.\d+Z$/, '.000000Z');
}

/** Formats a UTC instant (default now) for `<input type="datetime-local">` in local wall time. */
export function utcInstantToLocalDateTimeInput(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    return utcInstantToLocalDateTimeInput(null);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Returns current calendar date in Asia/Manila as YYYY-MM-DD (OpenAPI IsoDate). */
export function currentManilaIsoDate(offsetDays = 0): string {
  const base = new Date(Date.now() + offsetDays * 86_400_000);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(base);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) {
      return `${y}-${m}-${d}`;
    }
  } catch {
    // Fallback below
  }
  return base.toISOString().slice(0, 10);
}

/** Opens server-escaped printable HTML in a new tab with an explicit script-free CSP meta tag. */
export function openSandboxedPrintableHtml(rawHtml: string): void {
  const cspMeta =
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">';
  const hardenedHtml = /<head[\s>]/i.test(rawHtml)
    ? rawHtml.replace(/<head([\s>])/i, `<head$1${cspMeta}`)
    : `${cspMeta}${rawHtml}`;
  const blob = new Blob([hardenedHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    URL.revokeObjectURL(blobUrl);
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

/**
 * Enforces Stage 2 OpenAPI report date range constraints (`YYYY-MM-DD`, non-inverted, <= 366 days).
 */
export function validateReportDateRange(dateFrom: string, dateTo: string): string | null {
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoPattern.test(dateFrom) || !isoPattern.test(dateTo)) {
    return 'Report start and end dates must use YYYY-MM-DD format.';
  }
  const fromMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return 'Report dates must represent valid calendar dates.';
  }
  if (fromMs > toMs) {
    return 'Report end date must be on or after the start date.';
  }
  const diffDays = (toMs - fromMs) / 86_400_000;
  if (diffDays > 366) {
    return 'Report window cannot exceed 366 days.';
  }
  return null;
}

function normalizeStage2Path(basePath: string): string {
  return basePath.startsWith('/api/v1') ? basePath : `/api/v1${basePath}`;
}

async function s2Get<T>(
  basePath: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  const fullPath = `${normalizeStage2Path(basePath)}${buildQuery(query ?? {})}`;
  if (previewAdapter?.isEnabled()) {
    const handled = await previewAdapter.handleJson<T>({
      method: 'GET',
      path: fullPath,
      body: null,
    });
    if (handled !== null) {
      return handled;
    }
  }
  return apiGetRaw<T>(fullPath);
}

async function s2GetText(
  basePath: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): Promise<string> {
  const fullPath = `${normalizeStage2Path(basePath)}${buildQuery(query ?? {})}`;
  if (previewAdapter?.isEnabled()) {
    const handled = await previewAdapter.handleText(fullPath);
    if (handled !== null) {
      return handled;
    }
  }
  return apiGetText(fullPath, 'text/html');
}

async function s2Mutate<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  basePath: string,
  body: unknown | null,
  query?: Record<string, string | number | boolean | null | undefined>,
  explicitActionKey?: string,
): Promise<{ data: T; actionKey: string; replayed: boolean }> {
  const fullPath = `${normalizeStage2Path(basePath)}${buildQuery(query ?? {})}`;
  const key = explicitActionKey ?? newActionKey();
  if (previewAdapter?.isEnabled()) {
    const handled = await previewAdapter.handleJson<{ data: T } | T>({
      method,
      path: fullPath,
      body,
      actionKey: key,
    });
    if (handled !== null) {
      if (typeof handled === 'object' && handled !== null && 'data' in handled) {
        return { data: (handled as { data: T }).data, actionKey: key, replayed: false };
      }
      return { data: handled as T, actionKey: key, replayed: false };
    }
  }
  const { result, actionKey } = await apiMutate<T>(method, fullPath, body, key);
  return { data: result.data, actionKey, replayed: Boolean(result.replayed) };
}

function emptyCursor(): CursorPage {
  return { next_cursor: null, snapshot_version: 1 };
}

async function s2GetList<T>(
  basePath: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): Promise<Stage2PagedResult<T>> {
  const payload = await s2Get<{ data?: T[]; page?: CursorPage }>(basePath, query);
  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    page: payload.page ?? emptyCursor(),
  };
}

/**
 * Follows cursor pagination across Stage 2 list endpoints, retrying once from
 * page 1 if a live snapshot expires mid-scroll (`409 snapshot_stale`).
 */
export async function listAllStage2Pages<T>(
  fetchPage: (opts: { limit: number; cursor?: string }) => Promise<Stage2PagedResult<T>>,
  options?: { pageSize?: number; maxPages?: number; shouldContinue?: () => boolean },
): Promise<T[]> {
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 100));
  const maxPages = Math.max(1, options?.maxPages ?? 25);

  const runLoop = async (): Promise<T[]> => {
    const items: T[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    for (let i = 0; i < maxPages; i += 1) {
      if (options?.shouldContinue && !options.shouldContinue()) {
        return items;
      }
      const res = await fetchPage(cursor ? { limit: pageSize, cursor } : { limit: pageSize });
      items.push(...res.data);
      const next =
        typeof res.page?.next_cursor === 'string' && res.page.next_cursor.trim() !== ''
          ? res.page.next_cursor
          : null;
      if (!next || seenCursors.has(next)) {
        break;
      }
      seenCursors.add(next);
      cursor = next;
    }
    return items;
  };

  try {
    return await runLoop();
  } catch (err) {
    if (err instanceof ContractApiError && err.status === 409 && err.code === 'snapshot_stale') {
      return runLoop();
    }
    throw err;
  }
}

async function s2GetItem<T>(basePath: string): Promise<T> {
  const payload = await s2Get<{ data?: T } | T>(basePath);
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function s2FindByKey<T>(basePath: string): Promise<T | null> {
  try {
    return await s2GetItem<T>(basePath);
  } catch (err) {
    if (err instanceof ContractApiError && err.status === 404 && err.code === 'operation_not_found') {
      return null;
    }
    throw err;
  }
}

/* ==================== 1. Net Shortage & Replenishment ==================== */

export interface ListReplenishmentNeedsQuery {
  limit?: number;
  cursor?: string | null;
  item_id?: string | null;
  variant_id?: string | null;
  trigger_filter?: ReplenishmentTriggerFilter;
  q?: string;
}

export function listReplenishmentNeeds(
  chapterId: string,
  query?: ListReplenishmentNeedsQuery,
): Promise<Stage2PagedResult<ReplenishmentNeedItem>> {
  return s2GetList<ReplenishmentNeedItem>(
    `/chapters/${chapterId}/replenishment/needs`,
    query ? { ...query } : undefined,
  );
}

/* ==================== 2. RepF & Budget Review ==================== */

export interface ListRepfsQuery {
  limit?: number;
  cursor?: string | null;
  status?: RepfStatus;
  trigger_kind?: RepfTriggerKind;
  rf_id?: string | null;
  linked_demand_canceled?: boolean;
  q?: string;
}

export interface CreateRepfPayload {
  funding_source: 'chapter_funds';
  urgency: RepfUrgency;
  justification: string;
  lines: RepfLineInput[];
}

export interface ReplaceRepfPayload extends CreateRepfPayload {
  expected_version: number;
  expected_material_version: number;
}

export interface RepfVersionPayload {
  expected_version: number;
  expected_material_version: number;
}

export interface ReviewRepfBudgetPayload extends RepfVersionPayload {
  decision: RepfBudgetDecision;
  reason: string | null;
}

export interface RepfReasonedPayload extends RepfVersionPayload {
  reason: string;
}

export function listRepfs(
  chapterId: string,
  query?: ListRepfsQuery,
): Promise<Stage2PagedResult<Repf>> {
  return s2GetList<Repf>(`/chapters/${chapterId}/repfs`, query ? { ...query } : undefined);
}

export function createRepf(
  chapterId: string,
  payload: CreateRepfPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<Repf>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<Repf>>(
    'POST',
    `/chapters/${chapterId}/repfs`,
    payload,
    undefined,
    actionKey,
  );
}

export function readRepf(chapterId: string, repfId: string): Promise<Repf> {
  return s2GetItem<Repf>(`/chapters/${chapterId}/repfs/${repfId}`);
}

export function replaceRepf(
  chapterId: string,
  repfId: string,
  payload: ReplaceRepfPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<Repf>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<Repf>>(
    'PUT',
    `/chapters/${chapterId}/repfs/${repfId}`,
    payload,
    undefined,
    actionKey,
  );
}

export function submitRepf(
  chapterId: string,
  repfId: string,
  payload: RepfVersionPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<Repf>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<Repf>>(
    'POST',
    `/chapters/${chapterId}/repfs/${repfId}/submit`,
    payload,
    undefined,
    actionKey,
  );
}

export function reviewRepfBudget(
  chapterId: string,
  repfId: string,
  payload: ReviewRepfBudgetPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<Repf>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<Repf>>(
    'POST',
    `/chapters/${chapterId}/repfs/${repfId}/budget-review`,
    payload,
    undefined,
    actionKey,
  );
}

export function resumeRepfReview(
  chapterId: string,
  repfId: string,
  payload: RepfReasonedPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<Repf>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<Repf>>(
    'POST',
    `/chapters/${chapterId}/repfs/${repfId}/resume-review`,
    payload,
    undefined,
    actionKey,
  );
}

export function reviseRepf(
  chapterId: string,
  repfId: string,
  payload: RepfReasonedPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<Repf>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<Repf>>(
    'POST',
    `/chapters/${chapterId}/repfs/${repfId}/revise`,
    payload,
    undefined,
    actionKey,
  );
}

export function cancelRepf(
  chapterId: string,
  repfId: string,
  payload: RepfReasonedPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<Repf>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<Repf>>(
    'POST',
    `/chapters/${chapterId}/repfs/${repfId}/cancel`,
    payload,
    undefined,
    actionKey,
  );
}

export function listRepfHistory(
  chapterId: string,
  repfId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<RepfHistoryEntry>> {
  return s2GetList<RepfHistoryEntry>(
    `/chapters/${chapterId}/repfs/${repfId}/history`,
    query,
  );
}

export function readRepfVersion(
  chapterId: string,
  repfId: string,
  version: number,
): Promise<Repf> {
  return s2GetItem<Repf>(`/chapters/${chapterId}/repfs/${repfId}/versions/${version}`);
}

export function listRepfRelatedRecords(
  chapterId: string,
  repfId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<RepfRelatedRecord>> {
  return s2GetList<RepfRelatedRecord>(
    `/chapters/${chapterId}/repfs/${repfId}/related`,
    query,
  );
}

export function printRepf(chapterId: string, repfId: string): Promise<string> {
  return s2GetText(`/chapters/${chapterId}/repfs/${repfId}/print`);
}

/* ==================== 3. Quotations, Selection & Purchase Orders ==================== */

export interface CreateRepfQuotationPayload {
  supplier: InlineSupplierMetadata;
  quoted_at: string;
  valid_until: string | null;
  lead_time_days: number;
  availability_summary: string;
  quality_warranty_terms: string;
  payment_and_delivery_terms: string;
  reliability_notes: string | null;
  evidence: Stage2EvidenceByteBinding | null;
  lines: RepfQuotationLineInput[];
}

export interface ReplaceRepfQuotationPayload extends CreateRepfQuotationPayload {
  expected_version: number;
  expected_material_version: number;
}

export interface DeletedQuotationSummary {
  id: string;
  chapter_id: string;
  repf_id: string;
  deleted: true;
  deleted_by: ProcurementActor;
  deleted_at: string;
  previous_version: number;
  previous_material_version: number;
}

export interface RecordSupplierSelectionPayload {
  expected_repf_version: number;
  expected_repf_material_version: number;
  selected_quotation_id: string;
  comparable_quotation_ids: string[];
  selection_rationale: string;
  emergency_waiver: { reason: string } | null;
}

export interface ListPurchaseOrdersQuery {
  limit?: number;
  cursor?: string | null;
  status?: PurchaseOrderStatus;
  repf_id?: string | null;
  linked_demand_canceled?: boolean;
  q?: string;
}

export interface CreatePurchaseOrderPayload {
  repf_id: string;
  supplier_selection_id: string;
  delivery_location: string;
  expected_delivery_date: string;
  payment_and_delivery_terms: string;
  lines: PurchaseOrderLineInput[];
}

export interface ReplacePurchaseOrderPayload {
  expected_version: number;
  expected_material_version: number;
  delivery_location: string;
  expected_delivery_date: string;
  payment_and_delivery_terms: string;
  lines: PurchaseOrderLineInput[];
}

export interface PurchaseOrderVersionPayload {
  expected_version: number;
  expected_material_version: number;
}

export interface ApprovePurchaseOrderPayload extends PurchaseOrderVersionPayload {
  approval_notes: string | null;
}

export interface ReasonedPurchaseOrderPayload extends PurchaseOrderVersionPayload {
  reason: string;
}

export interface RecordPurchaseOrderAcknowledgmentPayload extends PurchaseOrderVersionPayload {
  supplier_confirmation_reference: string | null;
  acknowledged_at: string;
  revised_expected_delivery_date: string | null;
  notes: string | null;
  evidence: Stage2EvidenceByteBinding | null;
}

export interface ProposePurchaseOrderAmendmentPayload extends PurchaseOrderVersionPayload {
  delivery_location: string;
  expected_delivery_date: string;
  payment_and_delivery_terms: string;
  reason: string;
  lines: PurchaseOrderAmendmentLineInput[];
}

export interface PurchaseOrderAmendmentOutcome {
  purchase_order: PurchaseOrder;
  amendment: PurchaseOrderAmendment;
}

export function listRepfQuotations(
  chapterId: string,
  repfId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<RepfQuotation>> {
  return s2GetList<RepfQuotation>(
    `/chapters/${chapterId}/repfs/${repfId}/quotations`,
    query,
  );
}

export function createRepfQuotation(
  chapterId: string,
  repfId: string,
  payload: CreateRepfQuotationPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<RepfQuotation>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<RepfQuotation>>(
    'POST',
    `/chapters/${chapterId}/repfs/${repfId}/quotations`,
    payload,
    undefined,
    actionKey,
  );
}

export function replaceRepfQuotation(
  chapterId: string,
  repfId: string,
  quotationId: string,
  payload: ReplaceRepfQuotationPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<RepfQuotation>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<RepfQuotation>>(
    'PUT',
    `/chapters/${chapterId}/repfs/${repfId}/quotations/${quotationId}`,
    payload,
    undefined,
    actionKey,
  );
}

export function deleteRepfQuotation(
  chapterId: string,
  repfId: string,
  quotationId: string,
  expectedVersion: number,
  expectedMaterialVersion: number,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<DeletedQuotationSummary>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<DeletedQuotationSummary>>(
    'DELETE',
    `/chapters/${chapterId}/repfs/${repfId}/quotations/${quotationId}`,
    null,
    {
      expected_version: expectedVersion,
      expected_material_version: expectedMaterialVersion,
    },
    actionKey,
  );
}

export function recordSupplierSelection(
  chapterId: string,
  repfId: string,
  payload: RecordSupplierSelectionPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<SupplierSelection>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<SupplierSelection>>(
    'POST',
    `/chapters/${chapterId}/repfs/${repfId}/supplier-selection`,
    payload,
    undefined,
    actionKey,
  );
}

export function listPurchaseOrders(
  chapterId: string,
  query?: ListPurchaseOrdersQuery,
): Promise<Stage2PagedResult<PurchaseOrder>> {
  return s2GetList<PurchaseOrder>(
    `/chapters/${chapterId}/purchase-orders`,
    query ? { ...query } : undefined,
  );
}

export function createPurchaseOrder(
  chapterId: string,
  payload: CreatePurchaseOrderPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<PurchaseOrder>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<PurchaseOrder>>(
    'POST',
    `/chapters/${chapterId}/purchase-orders`,
    payload,
    undefined,
    actionKey,
  );
}

export function readPurchaseOrder(chapterId: string, poId: string): Promise<PurchaseOrder> {
  return s2GetItem<PurchaseOrder>(`/chapters/${chapterId}/purchase-orders/${poId}`);
}

export function replacePurchaseOrder(
  chapterId: string,
  poId: string,
  payload: ReplacePurchaseOrderPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<PurchaseOrder>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<PurchaseOrder>>(
    'PUT',
    `/chapters/${chapterId}/purchase-orders/${poId}`,
    payload,
    undefined,
    actionKey,
  );
}

export function submitPurchaseOrder(
  chapterId: string,
  poId: string,
  payload: PurchaseOrderVersionPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<PurchaseOrder>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<PurchaseOrder>>(
    'POST',
    `/chapters/${chapterId}/purchase-orders/${poId}/submit`,
    payload,
    undefined,
    actionKey,
  );
}

export function approvePurchaseOrder(
  chapterId: string,
  poId: string,
  payload: ApprovePurchaseOrderPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<PurchaseOrder>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<PurchaseOrder>>(
    'POST',
    `/chapters/${chapterId}/purchase-orders/${poId}/approve`,
    payload,
    undefined,
    actionKey,
  );
}

export function returnPurchaseOrder(
  chapterId: string,
  poId: string,
  payload: ReasonedPurchaseOrderPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<PurchaseOrder>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<PurchaseOrder>>(
    'POST',
    `/chapters/${chapterId}/purchase-orders/${poId}/return`,
    payload,
    undefined,
    actionKey,
  );
}

export function rejectPurchaseOrder(
  chapterId: string,
  poId: string,
  payload: ReasonedPurchaseOrderPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<PurchaseOrder>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<PurchaseOrder>>(
    'POST',
    `/chapters/${chapterId}/purchase-orders/${poId}/reject`,
    payload,
    undefined,
    actionKey,
  );
}

export function recordPurchaseOrderAcknowledgment(
  chapterId: string,
  poId: string,
  payload: RecordPurchaseOrderAcknowledgmentPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<PurchaseOrder>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<PurchaseOrder>>(
    'POST',
    `/chapters/${chapterId}/purchase-orders/${poId}/acknowledgment`,
    payload,
    undefined,
    actionKey,
  );
}

export function proposePurchaseOrderAmendment(
  chapterId: string,
  poId: string,
  payload: ProposePurchaseOrderAmendmentPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<PurchaseOrderAmendmentOutcome>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<PurchaseOrderAmendmentOutcome>>(
    'POST',
    `/chapters/${chapterId}/purchase-orders/${poId}/amendments`,
    payload,
    undefined,
    actionKey,
  );
}

export function approvePurchaseOrderAmendment(
  chapterId: string,
  poId: string,
  amendmentId: string,
  payload: ApprovePurchaseOrderPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<PurchaseOrderAmendmentOutcome>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<PurchaseOrderAmendmentOutcome>>(
    'POST',
    `/chapters/${chapterId}/purchase-orders/${poId}/amendments/${amendmentId}/approve`,
    payload,
    undefined,
    actionKey,
  );
}

export function closeShortPurchaseOrder(
  chapterId: string,
  poId: string,
  payload: ReasonedPurchaseOrderPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<PurchaseOrder>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<PurchaseOrder>>(
    'POST',
    `/chapters/${chapterId}/purchase-orders/${poId}/close-short`,
    payload,
    undefined,
    actionKey,
  );
}

export function cancelPurchaseOrder(
  chapterId: string,
  poId: string,
  payload: ReasonedPurchaseOrderPayload,
  actionKey?: string,
): Promise<{ data: ProcurementOperationReceipt<PurchaseOrder>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ProcurementOperationReceipt<PurchaseOrder>>(
    'POST',
    `/chapters/${chapterId}/purchase-orders/${poId}/cancel`,
    payload,
    undefined,
    actionKey,
  );
}

export function listPurchaseOrderHistory(
  chapterId: string,
  poId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<PurchaseOrderHistoryEntry>> {
  return s2GetList<PurchaseOrderHistoryEntry>(
    `/chapters/${chapterId}/purchase-orders/${poId}/history`,
    query,
  );
}

export function readPurchaseOrderVersion(
  chapterId: string,
  poId: string,
  version: number,
): Promise<PurchaseOrder> {
  return s2GetItem<PurchaseOrder>(
    `/chapters/${chapterId}/purchase-orders/${poId}/versions/${version}`,
  );
}

export function listPurchaseOrderRelatedRecords(
  chapterId: string,
  poId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<PurchaseOrderRelatedRecord>> {
  return s2GetList<PurchaseOrderRelatedRecord>(
    `/chapters/${chapterId}/purchase-orders/${poId}/related`,
    query,
  );
}

export function printPurchaseOrder(chapterId: string, poId: string): Promise<string> {
  return s2GetText(`/chapters/${chapterId}/purchase-orders/${poId}/print`);
}

export function findProcurementOperationByKey(
  chapterId: string,
  operationName: ProcurementOperationName,
  actionKey: string,
): Promise<ProcurementOperationReceipt | null> {
  return s2FindByKey<ProcurementOperationReceipt>(
    `/chapters/${chapterId}/procurement-operations/by-key${buildQuery({
      operation_name: operationName,
      action_key: actionKey,
    })}`,
  );
}

export function readProcurementOperation(
  chapterId: string,
  operationId: string,
): Promise<ProcurementOperationReceipt> {
  return s2GetItem<ProcurementOperationReceipt>(
    `/chapters/${chapterId}/procurement-operations/${operationId}`,
  );
}

/* ==================== 4. Donations & ADR 0004 Restriction Resolution ==================== */

export interface DonationDraftPayload {
  donor_name: string;
  lines: DonationLineInput[];
}

export interface ReplaceDonationPayload extends DonationDraftPayload {
  expected_version: number;
  expected_material_version: number;
}

export interface DonationVersionPayload {
  expected_version: number;
  expected_material_version: number;
}

export interface DonationReasonedPayload extends DonationVersionPayload {
  reason: string;
}

export interface AcknowledgeDonationPayload extends DonationVersionPayload {
  evidence: Stage2EvidenceByteBinding;
  signed_at: string;
  confirm_paper_matches: true;
}

export interface ResolveDonationRestrictionPayload extends DonationVersionPayload {
  evidence: Stage2EvidenceByteBinding;
  signed_at: string;
  confirm_paper_matches: true;
  da_line_id: string;
  reason: string;
  resolution_kind: 'apply' | 'audit_review';
  restrictions: BoundedRestriction;
}

export function listDonations(
  chapterId: string,
  query?: { limit?: number; cursor?: string | null; status?: DonationStatus },
): Promise<Stage2PagedResult<Donation>> {
  return s2GetList<Donation>(`/chapters/${chapterId}/donations`, query);
}

export function createDonation(
  chapterId: string,
  payload: DonationDraftPayload,
  actionKey?: string,
): Promise<{ data: DonationOperationReceipt; actionKey: string; replayed: boolean }> {
  return s2Mutate<DonationOperationReceipt>(
    'POST',
    `/chapters/${chapterId}/donations`,
    payload,
    undefined,
    actionKey,
  );
}

export function readDonation(chapterId: string, daId: string): Promise<Donation> {
  return s2GetItem<Donation>(`/chapters/${chapterId}/donations/${daId}`);
}

export function replaceDonation(
  chapterId: string,
  daId: string,
  payload: ReplaceDonationPayload,
  actionKey?: string,
): Promise<{ data: DonationOperationReceipt; actionKey: string; replayed: boolean }> {
  return s2Mutate<DonationOperationReceipt>(
    'PUT',
    `/chapters/${chapterId}/donations/${daId}`,
    payload,
    undefined,
    actionKey,
  );
}

export function listDonationHistory(
  chapterId: string,
  daId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<DonationHistoryEntry>> {
  return s2GetList<DonationHistoryEntry>(
    `/chapters/${chapterId}/donations/${daId}/history`,
    query,
  );
}

export function readDonationVersion(
  chapterId: string,
  daId: string,
  version: number,
): Promise<Donation> {
  return s2GetItem<Donation>(`/chapters/${chapterId}/donations/${daId}/versions/${version}`);
}

export function listDonationRelated(
  chapterId: string,
  daId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<DonationRelatedEntry>> {
  return s2GetList<DonationRelatedEntry>(
    `/chapters/${chapterId}/donations/${daId}/related`,
    query,
  );
}

export function printDonation(chapterId: string, daId: string): Promise<string> {
  return s2GetText(`/chapters/${chapterId}/donations/${daId}/print`);
}

export function submitDonation(
  chapterId: string,
  daId: string,
  payload: DonationVersionPayload,
  actionKey?: string,
): Promise<{ data: DonationOperationReceipt; actionKey: string; replayed: boolean }> {
  return s2Mutate<DonationOperationReceipt>(
    'POST',
    `/chapters/${chapterId}/donations/${daId}/submit`,
    payload,
    undefined,
    actionKey,
  );
}

export function acknowledgeDonation(
  chapterId: string,
  daId: string,
  payload: AcknowledgeDonationPayload,
  actionKey?: string,
): Promise<{ data: DonationOperationReceipt; actionKey: string; replayed: boolean }> {
  return s2Mutate<DonationOperationReceipt>(
    'POST',
    `/chapters/${chapterId}/donations/${daId}/acknowledge`,
    payload,
    undefined,
    actionKey,
  );
}

export function returnDonation(
  chapterId: string,
  daId: string,
  payload: DonationReasonedPayload,
  actionKey?: string,
): Promise<{ data: DonationOperationReceipt; actionKey: string; replayed: boolean }> {
  return s2Mutate<DonationOperationReceipt>(
    'POST',
    `/chapters/${chapterId}/donations/${daId}/return`,
    payload,
    undefined,
    actionKey,
  );
}

export function declineDonation(
  chapterId: string,
  daId: string,
  payload: DonationReasonedPayload,
  actionKey?: string,
): Promise<{ data: DonationOperationReceipt; actionKey: string; replayed: boolean }> {
  return s2Mutate<DonationOperationReceipt>(
    'POST',
    `/chapters/${chapterId}/donations/${daId}/decline`,
    payload,
    undefined,
    actionKey,
  );
}

export function reviseDonation(
  chapterId: string,
  daId: string,
  payload: DonationVersionPayload,
  actionKey?: string,
): Promise<{ data: DonationOperationReceipt; actionKey: string; replayed: boolean }> {
  return s2Mutate<DonationOperationReceipt>(
    'POST',
    `/chapters/${chapterId}/donations/${daId}/revise`,
    payload,
    undefined,
    actionKey,
  );
}

export function closeShortDonation(
  chapterId: string,
  daId: string,
  payload: DonationReasonedPayload,
  actionKey?: string,
): Promise<{ data: DonationOperationReceipt; actionKey: string; replayed: boolean }> {
  return s2Mutate<DonationOperationReceipt>(
    'POST',
    `/chapters/${chapterId}/donations/${daId}/close-short`,
    payload,
    undefined,
    actionKey,
  );
}

export function cancelDonation(
  chapterId: string,
  daId: string,
  payload: DonationReasonedPayload,
  actionKey?: string,
): Promise<{ data: DonationOperationReceipt; actionKey: string; replayed: boolean }> {
  return s2Mutate<DonationOperationReceipt>(
    'POST',
    `/chapters/${chapterId}/donations/${daId}/cancel`,
    payload,
    undefined,
    actionKey,
  );
}

export function resolveDonationRestriction(
  chapterId: string,
  daId: string,
  payload: ResolveDonationRestrictionPayload,
  actionKey?: string,
): Promise<{ data: DonationOperationReceipt; actionKey: string; replayed: boolean }> {
  return s2Mutate<DonationOperationReceipt>(
    'POST',
    `/chapters/${chapterId}/donations/${daId}/restriction-resolutions`,
    payload,
    undefined,
    actionKey,
  );
}

export function findDonationOperation(
  chapterId: string,
  operationName: DonationMutationName,
  actionKey: string,
): Promise<DonationOperationReceipt | null> {
  return s2FindByKey<DonationOperationReceipt>(
    `/chapters/${chapterId}/donation-operations/by-key${buildQuery({
      operation_name: operationName,
      action_key: actionKey,
    })}`,
  );
}

export function readDonationOperation(
  chapterId: string,
  operationId: string,
): Promise<DonationOperationReceipt> {
  return s2GetItem<DonationOperationReceipt>(
    `/chapters/${chapterId}/donation-operations/${operationId}`,
  );
}

/* ==================== 5. Unified Receiving, Discrepancies & Holds ==================== */

export interface ListReceivingReportsQuery {
  limit?: number;
  cursor?: string | null;
  source_kind?: ReceivingSourceKind;
  status?: ReceivingReportStatus;
  source_id?: string | null;
  location_id?: string | null;
}

export interface CreateReceivingReportPayload {
  source_kind: ReceivingSourceKind;
  source_id: string;
  source_material_version: number;
  originating_hold_id: string | null;
  supplier_dr_reference: string | null;
  supplier_dr_date: string | null;
  location_id: string;
  lines: ReceivingReportLineInput[];
}

export interface ReplaceReceivingReportPayload {
  expected_version: number;
  expected_material_version: number;
  source_material_version: number;
  supplier_dr_reference: string | null;
  supplier_dr_date: string | null;
  location_id: string;
  lines: ReceivingReportLineInput[];
}

export interface InspectReceivingReportPayload {
  expected_version: number;
  expected_material_version: number;
  source_material_version: number;
  technical_or_requesting_representative_id: string | null;
  inspected_at: string;
  inspection_notes: string;
  lines: ReceivingReportLineInput[];
}

export interface MatchReceivingReportEvidencePayload {
  expected_version: number;
  expected_material_version: number;
  snapshot_sha256: string;
  evidence: Stage2EvidenceByteBinding;
  acknowledged_at: string;
}

export interface PostReceivingReportPayload {
  expected_version: number;
  expected_material_version: number;
  source_material_version: number;
  acknowledgment_id: string;
}

export interface CancelReceivingReportPayload {
  expected_version: number;
  expected_material_version: number;
  reason: string;
}

export interface ListReceivingDiscrepanciesQuery {
  limit?: number;
  cursor?: string | null;
  status?: ReceivingDiscrepancyStatus;
  source_kind?: ReceivingSourceKind;
  rm_id?: string | null;
  source_id?: string | null;
}

export interface NotifySupplierDiscrepancyPayload {
  expected_version: number;
  expected_material_version: number;
  supplier_contact_reference: string;
  notification_notes: string;
  expected_resolution_date: string | null;
}

export type ResolveReceivingDiscrepancyPayload =
  | {
      action: 'start_review';
      expected_version: number;
      expected_material_version: number;
      review_notes: string;
    }
  | {
      action: 'resolve';
      expected_version: number;
      expected_material_version: number;
      resolution_kind: ReceivingDiscrepancyResolutionKind;
      reason: string;
      replacement_rm_id: string | null;
      quarantined_lot_disposition: QuarantinedLotDisposition;
      evidence: Stage2EvidenceByteBinding;
      signed_at: string;
    };

export interface CreateReceivingHoldPayload {
  arrived_at: string;
  holding_location_id: string;
  carrier_or_sender_name: string;
  sender_kind: 'supplier' | 'donor' | 'carrier' | 'unknown';
  delivery_document_reference: string | null;
  hold_reason: string;
  items: ReceivingHoldItemInput[];
  intake_evidence: Stage2EvidenceByteBinding | null;
}

export interface LinkReceivingHoldSourcePayload {
  expected_version: number;
  expected_material_version: number;
  source_kind: ReceivingSourceKind;
  source_id: string;
  supplier_dr_reference: string | null;
  supplier_dr_date: string | null;
  link_notes: string;
}

export interface RejectReturnReceivingHoldPayload {
  expected_version: number;
  expected_material_version: number;
  reason: string;
  recipient_or_carrier_name: string;
  evidence: Stage2EvidenceByteBinding;
  signed_at: string;
}

export function listReceivingReports(
  chapterId: string,
  query?: ListReceivingReportsQuery,
): Promise<Stage2PagedResult<ReceivingReport>> {
  return s2GetList<ReceivingReport>(
    `/chapters/${chapterId}/receiving-reports`,
    query ? { ...query } : undefined,
  );
}

export function createReceivingReport(
  chapterId: string,
  payload: CreateReceivingReportPayload,
  actionKey?: string,
): Promise<{ data: ReceivingOperationReceipt<ReceivingReport>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ReceivingOperationReceipt<ReceivingReport>>(
    'POST',
    `/chapters/${chapterId}/receiving-reports`,
    payload,
    undefined,
    actionKey,
  );
}

export function readReceivingReport(chapterId: string, rmId: string): Promise<ReceivingReport> {
  return s2GetItem<ReceivingReport>(`/chapters/${chapterId}/receiving-reports/${rmId}`);
}

export function replaceReceivingReport(
  chapterId: string,
  rmId: string,
  payload: ReplaceReceivingReportPayload,
  actionKey?: string,
): Promise<{ data: ReceivingOperationReceipt<ReceivingReport>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ReceivingOperationReceipt<ReceivingReport>>(
    'PUT',
    `/chapters/${chapterId}/receiving-reports/${rmId}`,
    payload,
    undefined,
    actionKey,
  );
}

export function inspectReceivingReport(
  chapterId: string,
  rmId: string,
  payload: InspectReceivingReportPayload,
  actionKey?: string,
): Promise<{ data: ReceivingOperationReceipt<ReceivingReport>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ReceivingOperationReceipt<ReceivingReport>>(
    'POST',
    `/chapters/${chapterId}/receiving-reports/${rmId}/inspection`,
    payload,
    undefined,
    actionKey,
  );
}

export function matchReceivingReportEvidence(
  chapterId: string,
  rmId: string,
  payload: MatchReceivingReportEvidencePayload,
  actionKey?: string,
): Promise<{ data: ReceivingOperationReceipt<ReceivingReport>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ReceivingOperationReceipt<ReceivingReport>>(
    'POST',
    `/chapters/${chapterId}/receiving-reports/${rmId}/evidence-match`,
    payload,
    undefined,
    actionKey,
  );
}

export function postReceivingReport(
  chapterId: string,
  rmId: string,
  payload: PostReceivingReportPayload,
  actionKey?: string,
): Promise<{ data: ReceivingOperationReceipt<ReceivingReport>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ReceivingOperationReceipt<ReceivingReport>>(
    'POST',
    `/chapters/${chapterId}/receiving-reports/${rmId}/post`,
    payload,
    undefined,
    actionKey,
  );
}

export function cancelReceivingReport(
  chapterId: string,
  rmId: string,
  payload: CancelReceivingReportPayload,
  actionKey?: string,
): Promise<{ data: ReceivingOperationReceipt<ReceivingReport>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ReceivingOperationReceipt<ReceivingReport>>(
    'POST',
    `/chapters/${chapterId}/receiving-reports/${rmId}/cancel`,
    payload,
    undefined,
    actionKey,
  );
}

export function listReceivingReportMovements(
  chapterId: string,
  rmId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<ReceivingMovement>> {
  return s2GetList<ReceivingMovement>(
    `/chapters/${chapterId}/receiving-reports/${rmId}/movements`,
    query,
  );
}

export function listReceivingReportDiscrepancies(
  chapterId: string,
  rmId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<ReceivingDiscrepancy>> {
  return s2GetList<ReceivingDiscrepancy>(
    `/chapters/${chapterId}/receiving-reports/${rmId}/discrepancies`,
    query,
  );
}

export function listReceivingReportHistory(
  chapterId: string,
  rmId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<ReceivingReportHistoryEntry>> {
  return s2GetList<ReceivingReportHistoryEntry>(
    `/chapters/${chapterId}/receiving-reports/${rmId}/history`,
    query,
  );
}

export function readReceivingReportVersion(
  chapterId: string,
  rmId: string,
  version: number,
): Promise<ReceivingReport> {
  return s2GetItem<ReceivingReport>(
    `/chapters/${chapterId}/receiving-reports/${rmId}/versions/${version}`,
  );
}

export function listReceivingReportRelated(
  chapterId: string,
  rmId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<ReceivingReportRelatedRecord>> {
  return s2GetList<ReceivingReportRelatedRecord>(
    `/chapters/${chapterId}/receiving-reports/${rmId}/related`,
    query,
  );
}

export function printReceivingReport(chapterId: string, rmId: string): Promise<string> {
  return s2GetText(`/chapters/${chapterId}/receiving-reports/${rmId}/print`);
}

export function listReceivingDiscrepancies(
  chapterId: string,
  query?: ListReceivingDiscrepanciesQuery,
): Promise<Stage2PagedResult<ReceivingDiscrepancy>> {
  return s2GetList<ReceivingDiscrepancy>(
    `/chapters/${chapterId}/receiving-discrepancies`,
    query ? { ...query } : undefined,
  );
}

export function readReceivingDiscrepancy(
  chapterId: string,
  discrepancyId: string,
): Promise<ReceivingDiscrepancy> {
  return s2GetItem<ReceivingDiscrepancy>(
    `/chapters/${chapterId}/receiving-discrepancies/${discrepancyId}`,
  );
}

export function notifySupplierOfReceivingDiscrepancy(
  chapterId: string,
  discrepancyId: string,
  payload: NotifySupplierDiscrepancyPayload,
  actionKey?: string,
): Promise<{ data: ReceivingOperationReceipt<ReceivingDiscrepancy>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ReceivingOperationReceipt<ReceivingDiscrepancy>>(
    'POST',
    `/chapters/${chapterId}/receiving-discrepancies/${discrepancyId}/notify-supplier`,
    payload,
    undefined,
    actionKey,
  );
}

export function resolveReceivingDiscrepancy(
  chapterId: string,
  discrepancyId: string,
  payload: ResolveReceivingDiscrepancyPayload,
  actionKey?: string,
): Promise<{ data: ReceivingOperationReceipt<ReceivingDiscrepancy>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ReceivingOperationReceipt<ReceivingDiscrepancy>>(
    'POST',
    `/chapters/${chapterId}/receiving-discrepancies/${discrepancyId}/resolutions`,
    payload,
    undefined,
    actionKey,
  );
}

export function listReceivingHolds(
  chapterId: string,
  query?: { limit?: number; cursor?: string | null; status?: ReceivingHoldStatus },
): Promise<Stage2PagedResult<ReceivingHold>> {
  return s2GetList<ReceivingHold>(`/chapters/${chapterId}/receiving-holds`, query);
}

export function createReceivingHold(
  chapterId: string,
  payload: CreateReceivingHoldPayload,
  actionKey?: string,
): Promise<{ data: ReceivingOperationReceipt<ReceivingHold>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ReceivingOperationReceipt<ReceivingHold>>(
    'POST',
    `/chapters/${chapterId}/receiving-holds`,
    payload,
    undefined,
    actionKey,
  );
}

export function readReceivingHold(chapterId: string, holdId: string): Promise<ReceivingHold> {
  return s2GetItem<ReceivingHold>(`/chapters/${chapterId}/receiving-holds/${holdId}`);
}

export function linkReceivingHoldSource(
  chapterId: string,
  holdId: string,
  payload: LinkReceivingHoldSourcePayload,
  actionKey?: string,
): Promise<{ data: ReceivingOperationReceipt<ReceivingHold>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ReceivingOperationReceipt<ReceivingHold>>(
    'POST',
    `/chapters/${chapterId}/receiving-holds/${holdId}/link-source`,
    payload,
    undefined,
    actionKey,
  );
}

export function rejectReturnReceivingHold(
  chapterId: string,
  holdId: string,
  payload: RejectReturnReceivingHoldPayload,
  actionKey?: string,
): Promise<{ data: ReceivingOperationReceipt<ReceivingHold>; actionKey: string; replayed: boolean }> {
  return s2Mutate<ReceivingOperationReceipt<ReceivingHold>>(
    'POST',
    `/chapters/${chapterId}/receiving-holds/${holdId}/reject-return`,
    payload,
    undefined,
    actionKey,
  );
}

export function listReceivingHoldHistory(
  chapterId: string,
  holdId: string,
  query?: { limit?: number; cursor?: string | null },
): Promise<Stage2PagedResult<ReceivingHoldHistoryEntry>> {
  return s2GetList<ReceivingHoldHistoryEntry>(
    `/chapters/${chapterId}/receiving-holds/${holdId}/history`,
    query,
  );
}

export function findReceivingOperationByKey(
  chapterId: string,
  operationName: ReceivingOperationName,
  actionKey: string,
): Promise<ReceivingOperationReceipt | null> {
  return s2FindByKey<ReceivingOperationReceipt>(
    `/chapters/${chapterId}/receiving-operations/by-key${buildQuery({
      operation_name: operationName,
      action_key: actionKey,
    })}`,
  );
}

export function readReceivingOperation(
  chapterId: string,
  operationId: string,
): Promise<ReceivingOperationReceipt> {
  return s2GetItem<ReceivingOperationReceipt>(
    `/chapters/${chapterId}/receiving-operations/${operationId}`,
  );
}

/* ==================== 6. Allocation Queue, Alerts & Stage 2 Reports ==================== */

export interface ListAllocationQueueQuery {
  limit?: number;
  cursor?: string | null;
  item_id?: string | null;
  variant_id?: string | null;
  rf_id?: string | null;
  requesting_unit_id?: string | null;
  eligible_only?: boolean;
}

export interface ListOfficerAlertsQuery {
  limit?: number;
  cursor?: string | null;
  alert_type?: OfficerAlertType;
  severity?: OfficerAlertSeverity;
  responsible_duty?: Stage2Duty;
}

export interface Stage2ReportQuery<S extends string> {
  date_from: string;
  date_to: string;
  item_id?: string | null;
  variant_id?: string | null;
  location_id?: string | null;
  status?: S;
  limit?: number;
  cursor?: string | null;
}

export function listAllocationQueue(
  chapterId: string,
  query?: ListAllocationQueueQuery,
): Promise<AllocationQueueListResponse> {
  return s2Get<AllocationQueueListResponse>(
    `/chapters/${chapterId}/allocation-queue`,
    query ? { ...query } : undefined,
  );
}

export function listOfficerAlerts(
  chapterId: string,
  query?: ListOfficerAlertsQuery,
): Promise<OfficerAlertListResponse> {
  return s2Get<OfficerAlertListResponse>(
    `/chapters/${chapterId}/alerts`,
    query ? { ...query } : undefined,
  );
}

export function readInventoryReport(
  chapterId: string,
  query: Stage2ReportQuery<InventoryReportStatus>,
): Promise<InventoryReportResponse> {
  const err = validateReportDateRange(query.date_from, query.date_to);
  if (err) {
    return Promise.reject(new Error(err));
  }
  return s2Get<InventoryReportResponse>(`/chapters/${chapterId}/reports/inventory`, {
    ...query,
  });
}

export function printInventoryReport(
  chapterId: string,
  query: Omit<Stage2ReportQuery<InventoryReportStatus>, 'limit' | 'cursor'>,
): Promise<string> {
  const err = validateReportDateRange(query.date_from, query.date_to);
  if (err) {
    return Promise.reject(new Error(err));
  }
  return s2GetText(`/chapters/${chapterId}/reports/inventory/print`, { ...query });
}

export function readProcurementReport(
  chapterId: string,
  query: Stage2ReportQuery<ProcurementReportStatus>,
): Promise<ProcurementReportResponse> {
  const err = validateReportDateRange(query.date_from, query.date_to);
  if (err) {
    return Promise.reject(new Error(err));
  }
  return s2Get<ProcurementReportResponse>(`/chapters/${chapterId}/reports/procurement`, {
    ...query,
  });
}

export function printProcurementReport(
  chapterId: string,
  query: Omit<Stage2ReportQuery<ProcurementReportStatus>, 'limit' | 'cursor'>,
): Promise<string> {
  const err = validateReportDateRange(query.date_from, query.date_to);
  if (err) {
    return Promise.reject(new Error(err));
  }
  return s2GetText(`/chapters/${chapterId}/reports/procurement/print`, { ...query });
}

export function readControlReport(
  chapterId: string,
  query: Stage2ReportQuery<ControlReportStatus>,
): Promise<ControlReportResponse> {
  const err = validateReportDateRange(query.date_from, query.date_to);
  if (err) {
    return Promise.reject(new Error(err));
  }
  return s2Get<ControlReportResponse>(`/chapters/${chapterId}/reports/control`, {
    ...query,
  });
}

export function printControlReport(
  chapterId: string,
  query: Omit<Stage2ReportQuery<ControlReportStatus>, 'limit' | 'cursor'>,
): Promise<string> {
  const err = validateReportDateRange(query.date_from, query.date_to);
  if (err) {
    return Promise.reject(new Error(err));
  }
  return s2GetText(`/chapters/${chapterId}/reports/control/print`, { ...query });
}

export async function settleStage2Tuple<const T extends readonly Promise<unknown>[]>(
  tasks: T,
): Promise<{
  values: { [K in keyof T]: Awaited<T[K]> | undefined };
  firstError: unknown;
}> {
  const results = await Promise.allSettled(tasks);
  let firstError: unknown = null;
  const values = results.map((result) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    if (firstError === null) {
      firstError = result.reason;
    }
    return undefined;
  }) as { [K in keyof T]: Awaited<T[K]> | undefined };
  return { values, firstError };
}

export type { AdditionalPurchaseReason };

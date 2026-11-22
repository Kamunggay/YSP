import { computeDeterministicHash } from './canonicalHash';

export const P24_CONTEXT_STORAGE_KEY = 'ysp_p24_context';

const INTEGER_PATTERN = /^(?:0|[1-9]\d{0,11})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type QueueBucket = 'needs_my_action' | 'waiting_on_others' | 'resolved_history';
export type ReportGroupKind =
  | 'inventory'
  | 'demand_procurement'
  | 'finance_booth'
  | 'control_audit';
export type ReportDateBasis = 'actual_occurrence' | 'entry_verification_posting';
export type ReportOutputFormat = 'pdf' | 'csv';

export interface StockSevenViewProjection {
  projection_id: string;
  chapter_id: string;
  sku_code: string;
  item_name: string;
  usable_on_hand_qty: string;
  available_to_allocate_qty: string;
  rf_reserved_qty: string;
  so_reserved_qty: string;
  booth_custody_qty: string;
  quarantined_qty: string;
  inbound_po_qty: string;
}

export interface WorkQueueAlertItem {
  queue_item_id: string;
  chapter_id: string;
  bucket: QueueBucket;
  record_reference: string;
  responsible_duty: string;
  alert_category: string;
  urgency_rank: number;
  is_uncertain_outcome: boolean;
  summary_text: string;
}

export interface FilteredWorkQueueView {
  bucket: QueueBucket;
  items: ReadonlyArray<WorkQueueAlertItem>;
  posted_mutations_count: number;
}

export interface GeneratedReportOutput {
  report_id: string;
  chapter_id: string;
  document_reference: string;
  report_group: ReportGroupKind;
  date_basis: ReportDateBasis;
  output_format: ReportOutputFormat;
  required_duty: string;
  actor_user_id: string;
  sanitized_cells: ReadonlyArray<string>;
  rendered_csv_preview: string;
  snapshot_hash: string;
  generated_at: string;
  last_retried_at: string | null;
  retry_count: number;
  reposted_effect: boolean;
}

export interface P24HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P24SummaryMetrics {
  usable_on_hand_total: string;
  available_to_allocate_total: string;
  rf_reserved_total: string;
  so_reserved_total: string;
  booth_custody_total: string;
  quarantined_total: string;
  inbound_po_total: string;
  generated_reports_count: number;
}

export interface P24OperationLedgerEntry {
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

export interface P24ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P24LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P24EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  stock_projections: ReadonlyArray<StockSevenViewProjection>;
  queue_items: ReadonlyArray<WorkQueueAlertItem>;
  report_outputs: ReadonlyArray<GeneratedReportOutput>;
  history: ReadonlyArray<P24HistoryEntry>;
  summary: P24SummaryMetrics;
  operation_ledger: ReadonlyArray<P24OperationLedgerEntry>;
  last_action: P24ActionResult | null;
}

export interface P24EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
  stock_projections?: ReadonlyArray<StockSevenViewProjection> | undefined;
  queue_items?: ReadonlyArray<WorkQueueAlertItem> | undefined;
  report_outputs?: ReadonlyArray<GeneratedReportOutput> | undefined;
  history?: ReadonlyArray<P24HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P24OperationLedgerEntry> | undefined;
}

export interface P24ReportsQueuesEngine {
  getSnapshot: () => P24EngineSnapshot;
  recordCommittedStockProjection: (input: {
    sku_code: string;
    item_name: string;
    usable_on_hand_qty: string;
    rf_reserved_qty: string;
    so_reserved_qty: string;
    booth_custody_qty: string;
    quarantined_qty: string;
    inbound_po_qty: string;
    idempotency_key?: string | undefined;
  }) => P24ActionResult<StockSevenViewProjection>;
  enqueueWorkQueueAlertItem: (input: {
    bucket: QueueBucket;
    record_reference: string;
    responsible_duty: string;
    alert_category: string;
    urgency_rank: number;
    is_uncertain_outcome: boolean;
    summary_text: string;
    idempotency_key?: string | undefined;
  }) => P24ActionResult<WorkQueueAlertItem>;
  filterScopedWorkQueue: (input: {
    bucket: QueueBucket;
    chapter_id: string;
    duty_filter?: string | undefined;
  }) => P24ActionResult<FilteredWorkQueueView>;
  generateScopedReportOutput: (input: {
    target_chapter_id: string;
    actor_user_id: string;
    actor_disabled: boolean;
    actor_authorized_duties: ReadonlyArray<string>;
    required_duty: string;
    report_group: ReportGroupKind;
    date_basis: ReportDateBasis;
    output_format: ReportOutputFormat;
    sample_cell_values: ReadonlyArray<string>;
    generated_at: string;
    idempotency_key?: string | undefined;
  }) => P24ActionResult<GeneratedReportOutput>;
  retryReportOutputJob: (input: {
    report_id: string;
    actor_user_id: string;
    actor_disabled: boolean;
    actor_authorized_duties: ReadonlyArray<string>;
    retried_at: string;
    idempotency_key?: string | undefined;
  }) => P24ActionResult<GeneratedReportOutput>;
  lookupReportsQueuesOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P24ActionResult<P24LookupResult>;
}

function readStoredP24Options(): P24EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P24_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P24EngineOptions;
  } catch {
    return undefined;
  }
}

export function sanitizeCsvCell(rawValue: string): string {
  const safe = /^[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

/**
 * Creates a chapter-scoped reporting, alerts, CSV/PDF output, and accessible queue engine.
 * Presents all seven non-additive stock views cleanly, orders uncertain work-queue items first without
 * business mutations on filter change, escapes CSV formula prefixes, and prevents reposting on retry.
 */
export function createP24ReportsQueuesEngine(options?: P24EngineOptions): P24ReportsQueuesEngine {
  const seed = options ?? readStoredP24Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 24000;

  const stockProjections: StockSevenViewProjection[] = (seed.stock_projections ?? []).map((p) =>
    structuredClone(p)
  );
  const queueItems: WorkQueueAlertItem[] = (seed.queue_items ?? []).map((q) =>
    structuredClone(q)
  );
  const reportOutputs: GeneratedReportOutput[] = (seed.report_outputs ?? []).map((r) =>
    structuredClone(r)
  );
  const history: P24HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P24OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P24ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P24${String(seq).padStart(19, '0')}`;
  }

  function computeSummary(): P24SummaryMetrics {
    let usable = 0n;
    let available = 0n;
    let rf = 0n;
    let so = 0n;
    let booth = 0n;
    let quar = 0n;
    let inbound = 0n;

    for (const p of stockProjections) {
      usable += BigInt(p.usable_on_hand_qty);
      available += BigInt(p.available_to_allocate_qty);
      rf += BigInt(p.rf_reserved_qty);
      so += BigInt(p.so_reserved_qty);
      booth += BigInt(p.booth_custody_qty);
      quar += BigInt(p.quarantined_qty);
      inbound += BigInt(p.inbound_po_qty);
    }

    return {
      usable_on_hand_total: usable.toString(),
      available_to_allocate_total: available.toString(),
      rf_reserved_total: rf.toString(),
      so_reserved_total: so.toString(),
      booth_custody_total: booth.toString(),
      quarantined_total: quar.toString(),
      inbound_po_total: inbound.toString(),
      generated_reports_count: reportOutputs.length,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P24_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          stock_projections: stockProjections,
          queue_items: queueItems,
          report_outputs: reportOutputs,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
        })
      );
    } catch {
      // Ignore quota errors cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P24ActionResult<T> {
    const res: P24ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P24ActionResult<T> | null {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) return null;
    const trimmed = idempotencyKey.trim();
    const existing = operationLedger.find(
      (o) => o.chapter_id === chapterId && o.action_code === actionCode && o.idempotency_key === trimmed
    );
    if (!existing) return null;
    const fingerprint = computeDeterministicHash({
      chapter_id: chapterId,
      action_code: actionCode,
      payload,
    });
    if (existing.payload_fingerprint !== fingerprint) {
      return fail(
        409,
        'IDEMPOTENCY_PAYLOAD_MISMATCH',
        `Idempotency key "${trimmed}" cannot be reused for a modified payload.`
      );
    }
    const replayRes: P24ActionResult<T> = {
      ok: true,
      http_status: existing.http_status,
      code: existing.code,
      message: `${existing.message} (idempotent replay)`,
      replayed: true,
      data: structuredClone(existing.snapshot) as T,
    };
    lastAction = replayRes;
    return replayRes;
  }

  function recordLedgerAndPersist<T>(
    actionCode: string,
    actorUserId: string,
    targetId: string | null,
    idempotencyKey: string | undefined,
    payload: unknown,
    httpStatus: number,
    code: string,
    message: string,
    data: T
  ): P24ActionResult<T> {
    if (idempotencyKey && idempotencyKey.trim().length > 0) {
      const fingerprint = computeDeterministicHash({
        chapter_id: chapterId,
        action_code: actionCode,
        payload,
      });
      operationLedger.push({
        operation_id: nextUlid(),
        chapter_id: chapterId,
        action_code: actionCode,
        actor_user_id: actorUserId,
        target_id: targetId,
        idempotency_key: idempotencyKey.trim(),
        payload_fingerprint: fingerprint,
        http_status: httpStatus,
        code,
        message,
        snapshot: structuredClone(data),
      });
    }
    const res: P24ActionResult<T> = {
      ok: true,
      http_status: httpStatus,
      code,
      message,
      replayed: false,
      data,
    };
    lastAction = res;
    persistSnapshot();
    return res;
  }

  return {
    getSnapshot() {
      return {
        chapter_id: chapterId,
        chapter_prefix: chapterPrefix,
        chapter_name: chapterName,
        stock_projections: stockProjections.map((p) => structuredClone(p)),
        queue_items: queueItems.map((q) => structuredClone(q)),
        report_outputs: reportOutputs.map((r) => structuredClone(r)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    recordCommittedStockProjection(input) {
      const replay = checkIdempotency<StockSevenViewProjection>(
        'p24.record_projection',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const sku = input.sku_code.trim();
      const name = input.item_name.trim();
      const nums = [
        input.usable_on_hand_qty.trim(),
        input.rf_reserved_qty.trim(),
        input.so_reserved_qty.trim(),
        input.booth_custody_qty.trim(),
        input.quarantined_qty.trim(),
        input.inbound_po_qty.trim(),
      ];
      if (!sku || !name) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'SKU code and item name are required.');
      }
      if (!nums.every((n) => INTEGER_PATTERN.test(n))) {
        return fail(422, 'INVALID_QUANTITY', 'All stock quantities must be non-negative whole numbers.');
      }

      const [usableStr, rfStr, soStr, boothStr, quarStr, inboundStr] = nums as [
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const usable = BigInt(usableStr);
      const rf = BigInt(rfStr);
      const so = BigInt(soStr);
      if (rf + so > usable) {
        return fail(
          422,
          'INVALID_RESERVATION_TOTAL',
          'RF reserved + SO reserved cannot exceed usable stockroom on-hand.'
        );
      }

      const available = usable - rf - so;
      const proj: StockSevenViewProjection = {
        projection_id: nextId(),
        chapter_id: chapterId,
        sku_code: sku,
        item_name: name,
        usable_on_hand_qty: usableStr,
        available_to_allocate_qty: available.toString(),
        rf_reserved_qty: rfStr,
        so_reserved_qty: soStr,
        booth_custody_qty: boothStr,
        quarantined_qty: quarStr,
        inbound_po_qty: inboundStr,
      };
      stockProjections.push(proj);

      history.push({
        event_id: nextId(),
        target_id: proj.projection_id,
        action: 'stock_projection_recorded',
        actor_user_id: 'system',
        reason: `${sku}: On-Hand ${usableStr} / RF ${rfStr} / SO ${soStr} / Available ${proj.available_to_allocate_qty} / Booth ${boothStr} / Quar ${quarStr} / PO ${inboundStr}`,
        timestamp: new Date().toISOString(),
      });

      return recordLedgerAndPersist(
        'p24.record_projection',
        'system',
        proj.projection_id,
        input.idempotency_key,
        input,
        201,
        'STOCK_PROJECTION_RECORDED',
        `Recorded seven-view stock summary for ${sku} (Available ${proj.available_to_allocate_qty} = ${usableStr} − ${rfStr} RF − ${soStr} SO).`,
        structuredClone(proj)
      );
    },

    enqueueWorkQueueAlertItem(input) {
      const replay = checkIdempotency<WorkQueueAlertItem>(
        'p24.enqueue_alert',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const recRef = input.record_reference.trim();
      const duty = input.responsible_duty.trim();
      const cat = input.alert_category.trim();
      const text = input.summary_text.trim();

      if (!recRef || !duty || !cat || !text) {
        return fail(
          422,
          'MISSING_REQUIRED_FIELDS',
          'Record reference, responsible duty, category, and alert summary are required.'
        );
      }
      if (!Number.isInteger(input.urgency_rank) || input.urgency_rank < 1) {
        return fail(422, 'INVALID_URGENCY_RANK', 'Urgency rank must be a positive integer (1 = highest).');
      }

      const item: WorkQueueAlertItem = {
        queue_item_id: nextId(),
        chapter_id: chapterId,
        bucket: input.bucket,
        record_reference: recRef,
        responsible_duty: duty,
        alert_category: cat,
        urgency_rank: input.urgency_rank,
        is_uncertain_outcome: input.is_uncertain_outcome,
        summary_text: text,
      };
      queueItems.push(item);

      history.push({
        event_id: nextId(),
        target_id: item.queue_item_id,
        action: 'work_queue_item_enqueued',
        actor_user_id: duty,
        reason: `${recRef} (${input.bucket}, urgency ${input.urgency_rank}, uncertain=${String(input.is_uncertain_outcome)})`,
        timestamp: new Date().toISOString(),
      });

      return recordLedgerAndPersist(
        'p24.enqueue_alert',
        duty,
        item.queue_item_id,
        input.idempotency_key,
        input,
        201,
        'WORK_QUEUE_ITEM_ENQUEUED',
        `Added alert item ${recRef} (${cat}) under ${duty}.`,
        structuredClone(item)
      );
    },

    filterScopedWorkQueue(input) {
      if (input.chapter_id !== chapterId) {
        return fail(403, 'FORBIDDEN_SCOPE', 'Work queue filter rejected for foreign chapter scope.');
      }
      const duty = input.duty_filter?.trim();
      const matched = queueItems
        .filter((q) => q.bucket === input.bucket && (!duty || q.responsible_duty === duty))
        .map((q) => structuredClone(q))
        .sort((a, b) => {
          if (a.is_uncertain_outcome !== b.is_uncertain_outcome) {
            return a.is_uncertain_outcome ? -1 : 1;
          }
          if (a.urgency_rank !== b.urgency_rank) {
            return a.urgency_rank - b.urgency_rank;
          }
          return a.queue_item_id.localeCompare(b.queue_item_id);
        });

      const res: P24ActionResult<FilteredWorkQueueView> = {
        ok: true,
        http_status: 200,
        code: 'WORK_QUEUE_FILTERED',
        message: `Loaded ${matched.length} item(s) in ${input.bucket} with zero posting side effects.`,
        data: {
          bucket: input.bucket,
          items: matched,
          posted_mutations_count: 0,
        },
      };
      lastAction = res;
      return res;
    },

    generateScopedReportOutput(input) {
      const replay = checkIdempotency<GeneratedReportOutput>(
        'p24.generate_report',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const actor = input.actor_user_id.trim();
      const reqDuty = input.required_duty.trim();
      const genAt = input.generated_at.trim();

      if (!actor || !reqDuty || !UTC_INSTANT_PATTERN.test(genAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Actor ID, required duty, and UTC time are required.');
      }
      if (input.target_chapter_id.trim() !== chapterId) {
        return fail(
          403,
          'CROSS_CHAPTER_EXPORT_FORBIDDEN',
          `Cannot export report for foreign chapter (${input.target_chapter_id}) from scoped session.`
        );
      }
      if (input.actor_disabled || !input.actor_authorized_duties.includes(reqDuty)) {
        return fail(
          403,
          'DISABLED_OR_UNAUTHORIZED_EXPORT_BLOCKED',
          `Export blocked: account disabled or missing authorized duty "${reqDuty}".`
        );
      }

      const sanitized = input.sample_cell_values.map((c) => sanitizeCsvCell(c));
      const csvPreview = `report_group,date_basis,${sanitized.join(',')}\n${input.report_group},${input.date_basis},${sanitized.join(',')}`;
      const docRef = `${chapterPrefix}-RPT-2026-${String(reportOutputs.length + 1).padStart(6, '0')}`;
      const snapshotHash = computeDeterministicHash({
        chapter_id: chapterId,
        document_reference: docRef,
        report_group: input.report_group,
        date_basis: input.date_basis,
        output_format: input.output_format,
        sanitized,
      });

      const report: GeneratedReportOutput = {
        report_id: nextId(),
        chapter_id: chapterId,
        document_reference: docRef,
        report_group: input.report_group,
        date_basis: input.date_basis,
        output_format: input.output_format,
        required_duty: reqDuty,
        actor_user_id: actor,
        sanitized_cells: sanitized,
        rendered_csv_preview: csvPreview,
        snapshot_hash: snapshotHash,
        generated_at: genAt,
        last_retried_at: null,
        retry_count: 0,
        reposted_effect: false,
      };
      reportOutputs.push(report);

      history.push({
        event_id: nextId(),
        target_id: report.report_id,
        action: 'report_output_generated',
        actor_user_id: actor,
        reason: `${docRef} (${input.report_group}, ${input.date_basis}, ${input.output_format})`,
        timestamp: genAt,
      });

      return recordLedgerAndPersist(
        'p24.generate_report',
        actor,
        report.report_id,
        input.idempotency_key,
        input,
        201,
        'REPORT_OUTPUT_GENERATED',
        `Generated immutable ${input.output_format.toUpperCase()} output ${docRef} (${input.date_basis}).`,
        structuredClone(report)
      );
    },

    retryReportOutputJob(input) {
      const replay = checkIdempotency<GeneratedReportOutput>(
        'p24.retry_report',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const actor = input.actor_user_id.trim();
      const retriedAt = input.retried_at.trim();
      if (!actor || !UTC_INSTANT_PATTERN.test(retriedAt)) {
        return fail(422, 'INVALID_INPUT', 'Actor ID and UTC timestamp are required.');
      }

      const report = reportOutputs.find((r) => r.report_id === input.report_id);
      if (!report) return fail(404, 'RESOURCE_NOT_FOUND', 'Issued report job not found.');

      if (input.actor_disabled || !input.actor_authorized_duties.includes(report.required_duty)) {
        return fail(
          403,
          'DISABLED_OR_UNAUTHORIZED_EXPORT_BLOCKED',
          `Queued output retry rejected: disabled user or missing duty "${report.required_duty}".`
        );
      }

      report.retry_count += 1;
      report.last_retried_at = retriedAt;
      report.reposted_effect = false;

      history.push({
        event_id: nextId(),
        target_id: report.report_id,
        action: 'report_output_retried_no_repost',
        actor_user_id: actor,
        reason: `Re-issued ${report.document_reference} (attempt #${report.retry_count}, immutable hash retained)`,
        timestamp: retriedAt,
      });

      return recordLedgerAndPersist(
        'p24.retry_report',
        actor,
        report.report_id,
        input.idempotency_key,
        input,
        200,
        'REPORT_OUTPUT_RETRIED_NO_REPOST',
        `Regenerated immutable snapshot ${report.document_reference} with zero stock or payment reposting.`,
        structuredClone(report)
      );
    },

    lookupReportsQueuesOperation(input) {
      if (input.chapter_id !== chapterId) {
        return {
          ok: false,
          http_status: 403,
          code: 'FORBIDDEN_SCOPE',
          message: 'Operation lookup rejected for foreign chapter scope.',
          data: {
            action_result: 'forbidden',
            input_policy: 'preserve',
            lookup_state: null,
            operation_id: null,
            idempotency_key: null,
            recovered_snapshot: null,
          },
        };
      }

      const match =
        input.query_type === 'by_key'
          ? operationLedger.find(
              (o) =>
                o.idempotency_key === (input.idempotency_key ?? '').trim() &&
                (!input.action_code || o.action_code === input.action_code)
            )
          : operationLedger.find((o) => o.operation_id === (input.operation_id ?? '').trim());

      if (!match) {
        return {
          ok: false,
          http_status: 404,
          code: 'OPERATION_NOT_VISIBLE',
          message: 'No committed operation found for the supplied identifier; preserve inputs.',
          data: {
            action_result: 'uncertain',
            input_policy: 'preserve',
            lookup_state: 'pending_or_not_visible',
            operation_id: input.operation_id ?? null,
            idempotency_key: input.idempotency_key ?? null,
            recovered_snapshot: null,
          },
        };
      }

      return {
        ok: true,
        http_status: 200,
        code: 'OPERATION_RECOVERED',
        message: `Recovered durable result ${match.operation_id} (${match.code}).`,
        data: {
          action_result: 'recovered',
          input_policy: 'may_clear',
          lookup_state: null,
          operation_id: match.operation_id,
          idempotency_key: match.idempotency_key,
          recovered_snapshot: structuredClone(match.snapshot),
        },
      };
    },
  };
}

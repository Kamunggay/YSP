import { computeDeterministicHash } from './canonicalHash';

export const P25_CONTEXT_STORAGE_KEY = 'ysp_p25_context';

const INTEGER_PATTERN = /^(?:0|[1-9]\d{0,11})$/;
const UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

export type MapViewId =
  | 'view_1_swimlanes'
  | 'view_2_money_or'
  | 'view_3_stocks_custody'
  | 'view_4_governance_matrix'
  | 'view_5_scenario_tracer';

export type ScenarioTraceId =
  | 'track1_so_backorder'
  | 'track2_booth_100_30_70'
  | 'purchasing_po_100_rm_40';

export interface OperationsMapViewMeta {
  view_id: MapViewId;
  title: string;
  description: string;
  illustrative_label: 'ILLUSTRATIVE SCENARIO — NOT LIVE OPERATIONAL DATA';
}

export interface OperationsScenarioTrace {
  scenario_id: ScenarioTraceId;
  title: string;
  illustrative_label: 'ILLUSTRATIVE SCENARIO — NOT LIVE OPERATIONAL DATA';
  steps: ReadonlyArray<string>;
}

export interface OperationsMapNode {
  node_id: string;
  screen_name: string;
  owning_duty: string;
  required_duty: string;
  invariant_rule: string;
  input_docs: string;
  output_docs: string;
  next_route: string;
  restricted_details: string;
}

export interface LiveCorePostingCheck {
  posting_id: string;
  actor_user_id: string;
  action_label: string;
  quantity_posted: string;
  posted_during_map_outage: boolean;
  core_posting_unaffected: boolean;
  posted_at: string;
}

export interface P25HistoryEntry {
  event_id: string;
  target_id: string;
  action: string;
  actor_user_id: string;
  reason: string | null;
  timestamp: string;
}

export interface P25SummaryMetrics {
  active_view_id: MapViewId;
  active_scenario_id: ScenarioTraceId;
  map_unavailable: boolean;
  text_alternative_enabled: boolean;
  live_records_count: number;
}

export interface P25OperationLedgerEntry {
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

export interface P25ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface P25LookupResult {
  action_result: 'uncertain' | 'forbidden' | 'recovered';
  input_policy: 'preserve' | 'may_clear';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface P25EngineSnapshot {
  chapter_id: string;
  chapter_prefix: string;
  chapter_name: string;
  illustrative_label: 'ILLUSTRATIVE SCENARIO — NOT LIVE OPERATIONAL DATA';
  map_views: ReadonlyArray<OperationsMapViewMeta>;
  scenario_traces: ReadonlyArray<OperationsScenarioTrace>;
  map_nodes: ReadonlyArray<OperationsMapNode>;
  active_view_id: MapViewId;
  active_scenario_id: ScenarioTraceId;
  map_unavailable: boolean;
  map_failure_reason: string | null;
  text_alternative_enabled: boolean;
  live_operational_records: ReadonlyArray<LiveCorePostingCheck>;
  history: ReadonlyArray<P25HistoryEntry>;
  summary: P25SummaryMetrics;
  operation_ledger: ReadonlyArray<P25OperationLedgerEntry>;
  last_action: P25ActionResult | null;
}

export interface P25EngineOptions {
  chapter_id?: string | undefined;
  chapter_prefix?: string | undefined;
  chapter_name?: string | undefined;
  next_seq?: number | undefined;
  active_view_id?: MapViewId | undefined;
  active_scenario_id?: ScenarioTraceId | undefined;
  map_unavailable?: boolean | undefined;
  map_failure_reason?: string | null | undefined;
  text_alternative_enabled?: boolean | undefined;
  live_operational_records?: ReadonlyArray<LiveCorePostingCheck> | undefined;
  history?: ReadonlyArray<P25HistoryEntry> | undefined;
  operation_ledger?: ReadonlyArray<P25OperationLedgerEntry> | undefined;
}

export interface P25OperationsMapEngine {
  getSnapshot: () => P25EngineSnapshot;
  selectMapViewAndScenario: (input: {
    view_id: MapViewId;
    scenario_id: ScenarioTraceId;
  }) => P25ActionResult<P25SummaryMetrics>;
  toggleReadableTextAlternative: (input: {
    enabled: boolean;
  }) => P25ActionResult<P25SummaryMetrics>;
  inspectMapNodeOrFollowLink: (input: {
    node_id: string;
    actor_user_id: string;
    actor_chapter_id: string;
    is_provider_admin_only: boolean;
    has_chapter_membership: boolean;
    actor_authorized_duties: ReadonlyArray<string>;
    idempotency_key?: string | undefined;
  }) => P25ActionResult<Omit<OperationsMapNode, 'restricted_details'>>;
  setMapRendererFailureMode: (input: {
    map_unavailable: boolean;
    failure_reason?: string | undefined;
  }) => P25ActionResult<P25SummaryMetrics>;
  verifyCorePostingDuringMapFailure: (input: {
    actor_user_id: string;
    action_label: string;
    quantity_posted: string;
    posted_at: string;
    idempotency_key?: string | undefined;
  }) => P25ActionResult<LiveCorePostingCheck>;
  lookupOperationsMapOperation: (input: {
    query_type: 'by_key' | 'by_ulid';
    chapter_id: string;
    action_code?: string | undefined;
    idempotency_key?: string | undefined;
    operation_id?: string | undefined;
  }) => P25ActionResult<P25LookupResult>;
}

const ILLUSTRATIVE_TAG = 'ILLUSTRATIVE SCENARIO — NOT LIVE OPERATIONAL DATA' as const;

const DOCUMENTED_VIEWS: ReadonlyArray<OperationsMapViewMeta> = [
  {
    view_id: 'view_1_swimlanes',
    title: 'Full 5-Swimlane System Map',
    description:
      'End-to-end flow across Demand Intake, Financial Clearance, Stock Allocation, Event Booth Trading, and Purchasing.',
    illustrative_label: ILLUSTRATIVE_TAG,
  },
  {
    view_id: 'view_2_money_or',
    title: 'Money, Collections & Official Receipts Flow',
    description:
      'Separates Billing-only Invoices, Finance-Verified Official Receipts, Designated Procurement Funding, and Booth Float Custody.',
    illustrative_label: ILLUSTRATIVE_TAG,
  },
  {
    view_id: 'view_3_stocks_custody',
    title: 'Physical Stocks, Lots & Custody Flow',
    description:
      'Displays all seven non-additive stock balance views and isolates event booth custody from stockroom usable stock.',
    illustrative_label: ILLUSTRATIVE_TAG,
  },
  {
    view_id: 'view_4_governance_matrix',
    title: 'Dual Governance & Segregation Matrix',
    description:
      'Maps independent review, dual Chapter Head and Finance count-variance co-approval, and separate provider access rules.',
    illustrative_label: ILLUSTRATIVE_TAG,
  },
  {
    view_id: 'view_5_scenario_tracer',
    title: 'Interactive Scenario Flow Tracer',
    description:
      'Step-by-step walkthrough of Track 1 backorders, Track 2 booth events, and partial PO receiving scenarios.',
    illustrative_label: ILLUSTRATIVE_TAG,
  },
];

const DOCUMENTED_SCENARIOS: ReadonlyArray<OperationsScenarioTrace> = [
  {
    scenario_id: 'track1_so_backorder',
    title: 'Track 1 Order with Backorder Deposit (PHP 400 + PHP 600)',
    illustrative_label: ILLUSTRATIVE_TAG,
    steps: [
      'Record Staff Sales Order and issue full-order billing invoice.',
      'Start separate 48h available-stock clock and 48h buyer backorder acceptance deposit clock.',
      'Verify PHP 400.00 GCash credit (GC-771201) to designate funded procurement without creating duplicate credit.',
      'Verify remaining PHP 600.00 settlement (total PHP 1000.00), then sign customer delivery release batches.',
    ],
  },
  {
    scenario_id: 'track2_booth_100_30_70',
    title: 'Track 2 Booth Custody (100 Checkout / 30 Sold / 70 Return) & Float Reconciliation',
    illustrative_label: ILLUSTRATIVE_TAG,
    steps: [
      'Approve event setup and separate PHP 2,000.00 cash float (zero revenue recorded).',
      'Sign custodian checkout of 100 units (stockroom -100, booth custody +100).',
      'Commit 30 immediate cash/GCash sales (booth -30, stockroom untouched at -100 until return).',
      'Verify independent return of 70 units (+70 stockroom -> net -30, booth 0) and reconcile PHP 4,500 sales - 500 refund - 1,000 deposit = 3,000 sales cash due.',
    ],
  },
  {
    scenario_id: 'purchasing_po_100_rm_40',
    title: 'Purchasing Replenishment (PO 100 / Partial Accepted RM 40)',
    illustrative_label: ILLUSTRATIVE_TAG,
    steps: [
      'Compute net uncovered need excluding existing covered POs and budget-approve requisition.',
      'Compare comparable quotations and issue approved inbound PO for 100 units.',
      'Inspect delivery: accept 40 units via RM (allocate immediately) while retaining 60 PO balance and supplier discrepancy.',
    ],
  },
];

const DOCUMENTED_NODES: ReadonlyArray<OperationsMapNode> = [
  {
    node_id: 'sales_payment_gate',
    screen_name: 'Verified Payment & Official Receipt Desk',
    owning_duty: 'Finance Verifier',
    required_duty: 'finance_verifier',
    invariant_rule: 'Invoices bill only; releases require verified Official Receipt merchandise coverage.',
    input_docs: 'Sales Invoice (SI), Official GCash / Cash Proof',
    output_docs: 'Verified Official Receipt (OR), Line Credit Allocation',
    next_route: '/?view=p13',
    restricted_details: 'Sensitive payer evidence & chapter bank settlement details.',
  },
  {
    node_id: 'booth_closeout_node',
    screen_name: 'Booth Closing Count & Remittance Reconciliation',
    owning_duty: 'Independent Booth Reviewer',
    required_duty: 'booth_reconciler',
    invariant_rule: 'Usable returns post once while count variances require independent dual Head & Finance approval.',
    input_docs: 'Checked-Out IS/AR, Immediate/Manual OR Series, Physical Count Sheet',
    output_docs: 'Reconciled Usable Return, Variance ADJ, Final Remittance Sign-Off',
    next_route: '/?view=p23',
    restricted_details: 'Custodian variance exposure & chapter cash vault remittance summary.',
  },
  {
    node_id: 'stock_eligibility_node',
    screen_name: 'Catalog, Seven Stock Views & Donor Restrictions',
    owning_duty: 'Inventory Controller',
    required_duty: 'inventory_controller',
    invariant_rule: 'Seven overlapping stock views remain separate and never combine into additive buckets.',
    input_docs: 'Accepted Receiving Reports, Active RF/SO Commitments',
    output_docs: 'Eligible Available-to-Allocate Projection',
    next_route: '/?view=p05',
    restricted_details: 'Internal warehouse bin allocation & donor covenant details.',
  },
];

function readStoredP25Options(): P25EngineOptions | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(P25_CONTEXT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed as P25EngineOptions;
  } catch {
    return undefined;
  }
}

/**
 * Creates a chapter-scoped supporting operations map and scenario tracer engine.
 * Keeps illustrative reference traces clearly separated from unseeded live operational records,
 * enforces chapter/membership/duty scope with neutral explanations, and stays non-blocking on outage.
 */
export function createP25OperationsMapEngine(options?: P25EngineOptions): P25OperationsMapEngine {
  const seed = options ?? readStoredP25Options() ?? {};
  const chapterId = seed.chapter_id ?? '1';
  const chapterPrefix = seed.chapter_prefix ?? 'CEBU';
  const chapterName = seed.chapter_name ?? 'Active Chapter';

  let seq = seed.next_seq ?? 25000;
  let activeViewId: MapViewId = seed.active_view_id ?? 'view_1_swimlanes';
  let activeScenarioId: ScenarioTraceId = seed.active_scenario_id ?? 'track1_so_backorder';
  let mapUnavailable = seed.map_unavailable ?? false;
  let mapFailureReason: string | null = seed.map_failure_reason ?? null;
  let textAlternativeEnabled = seed.text_alternative_enabled ?? false;

  const liveRecords: LiveCorePostingCheck[] = (seed.live_operational_records ?? []).map((r) =>
    structuredClone(r)
  );
  const history: P25HistoryEntry[] = (seed.history ?? []).map((h) => structuredClone(h));
  const operationLedger: P25OperationLedgerEntry[] = (seed.operation_ledger ?? []).map((o) =>
    structuredClone(o)
  );
  let lastAction: P25ActionResult | null = null;

  function nextId(): string {
    seq += 1;
    return String(seq);
  }

  function nextUlid(): string {
    seq += 1;
    return `01K9P25${String(seq).padStart(19, '0')}`;
  }

  function computeSummary(): P25SummaryMetrics {
    return {
      active_view_id: activeViewId,
      active_scenario_id: activeScenarioId,
      map_unavailable: mapUnavailable,
      text_alternative_enabled: textAlternativeEnabled,
      live_records_count: liveRecords.length,
    };
  }

  function persistSnapshot(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        P25_CONTEXT_STORAGE_KEY,
        JSON.stringify({
          chapter_id: chapterId,
          chapter_prefix: chapterPrefix,
          chapter_name: chapterName,
          active_view_id: activeViewId,
          active_scenario_id: activeScenarioId,
          map_unavailable: mapUnavailable,
          map_failure_reason: mapFailureReason,
          text_alternative_enabled: textAlternativeEnabled,
          live_operational_records: liveRecords,
          history,
          operation_ledger: operationLedger,
          next_seq: seq,
        })
      );
    } catch {
      // Ignore quota errors cleanly.
    }
  }

  function fail<T>(httpStatus: number, code: string, message: string): P25ActionResult<T> {
    const res: P25ActionResult<T> = { ok: false, http_status: httpStatus, code, message };
    lastAction = res;
    return res;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payload: unknown
  ): P25ActionResult<T> | null {
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
    const replayRes: P25ActionResult<T> = {
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
  ): P25ActionResult<T> {
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
    const res: P25ActionResult<T> = {
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
        illustrative_label: ILLUSTRATIVE_TAG,
        map_views: DOCUMENTED_VIEWS.map((v) => structuredClone(v)),
        scenario_traces: DOCUMENTED_SCENARIOS.map((s) => structuredClone(s)),
        map_nodes: DOCUMENTED_NODES.map((n) => structuredClone(n)),
        active_view_id: activeViewId,
        active_scenario_id: activeScenarioId,
        map_unavailable: mapUnavailable,
        map_failure_reason: mapFailureReason,
        text_alternative_enabled: textAlternativeEnabled,
        live_operational_records: liveRecords.map((r) => structuredClone(r)),
        history: history.map((h) => structuredClone(h)),
        summary: computeSummary(),
        operation_ledger: operationLedger.map((o) => structuredClone(o)),
        last_action: lastAction ? structuredClone(lastAction) : null,
      };
    },

    selectMapViewAndScenario(input) {
      activeViewId = input.view_id;
      activeScenarioId = input.scenario_id;
      persistSnapshot();

      const summary = computeSummary();
      const res: P25ActionResult<P25SummaryMetrics> = {
        ok: true,
        http_status: 200,
        code: 'MAP_VIEW_UPDATED',
        message: `Loaded illustrative reference view "${input.view_id}" and scenario "${input.scenario_id}".`,
        data: summary,
      };
      lastAction = res;
      return res;
    },

    toggleReadableTextAlternative(input) {
      textAlternativeEnabled = input.enabled;
      persistSnapshot();

      const summary = computeSummary();
      const res: P25ActionResult<P25SummaryMetrics> = {
        ok: true,
        http_status: 200,
        code: 'TEXT_ALTERNATIVE_TOGGLED',
        message: input.enabled
          ? 'Enabled accessible keyboard/screen-reader table alternative.'
          : 'Switched back to interactive visual operations diagram.',
        data: summary,
      };
      lastAction = res;
      return res;
    },

    inspectMapNodeOrFollowLink(input) {
      const replay = checkIdempotency<Omit<OperationsMapNode, 'restricted_details'>>(
        'p25.inspect_node',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const node = DOCUMENTED_NODES.find((n) => n.node_id === input.node_id);
      if (!node) return fail(404, 'RESOURCE_NOT_FOUND', 'Operations map node not found.');

      const sameChapter = input.actor_chapter_id.trim() === chapterId;
      const missingMembershipAsProvider = input.is_provider_admin_only && !input.has_chapter_membership;
      const hasDuty = input.actor_authorized_duties.includes(node.required_duty);

      if (!sameChapter || missingMembershipAsProvider || !hasDuty) {
        return fail(
          403,
          'NEUTRAL_SCOPE_RESTRICTED_EXPLANATION',
          'Action unavailable for your current chapter membership or authorized duties.'
        );
      }

      const publicMeta: Omit<OperationsMapNode, 'restricted_details'> = {
        node_id: node.node_id,
        screen_name: node.screen_name,
        owning_duty: node.owning_duty,
        required_duty: node.required_duty,
        invariant_rule: node.invariant_rule,
        input_docs: node.input_docs,
        output_docs: node.output_docs,
        next_route: node.next_route,
      };

      history.push({
        event_id: nextId(),
        target_id: node.node_id,
        action: 'node_inspected_authorized',
        actor_user_id: input.actor_user_id.trim() || 'officer',
        reason: `Authorized inspection of ${node.screen_name}`,
        timestamp: new Date().toISOString(),
      });

      return recordLedgerAndPersist(
        'p25.inspect_node',
        input.actor_user_id.trim() || 'officer',
        node.node_id,
        input.idempotency_key,
        input,
        200,
        'NODE_INSPECTED_AUTHORIZED',
        `Opened authorized workflow details for ${node.screen_name} (route: ${node.next_route}).`,
        publicMeta
      );
    },

    setMapRendererFailureMode(input) {
      mapUnavailable = input.map_unavailable;
      mapFailureReason = input.map_unavailable
        ? input.failure_reason?.trim() || 'Supporting diagram renderer temporarily unavailable.'
        : null;
      persistSnapshot();

      const summary = computeSummary();
      const res: P25ActionResult<P25SummaryMetrics> = {
        ok: true,
        http_status: 200,
        code: 'MAP_FAILURE_MODE_UPDATED',
        message: mapUnavailable
          ? 'Supporting operations map is temporarily unavailable; core operational postings remain enabled.'
          : 'Restored supporting operations map renderer.',
        data: summary,
      };
      lastAction = res;
      return res;
    },

    verifyCorePostingDuringMapFailure(input) {
      const replay = checkIdempotency<LiveCorePostingCheck>(
        'p25.core_posting_check',
        input.idempotency_key,
        input
      );
      if (replay) return replay;

      const actor = input.actor_user_id.trim();
      const label = input.action_label.trim();
      const qtyStr = input.quantity_posted.trim();
      const postedAt = input.posted_at.trim();

      if (!actor || !label || !UTC_INSTANT_PATTERN.test(postedAt)) {
        return fail(422, 'MISSING_REQUIRED_FIELDS', 'Actor ID, action label, and UTC time are required.');
      }
      if (!INTEGER_PATTERN.test(qtyStr) || BigInt(qtyStr) <= 0n) {
        return fail(422, 'INVALID_QUANTITY', 'Posted quantity must be a positive whole number.');
      }

      const check: LiveCorePostingCheck = {
        posting_id: nextId(),
        actor_user_id: actor,
        action_label: label,
        quantity_posted: qtyStr,
        posted_during_map_outage: mapUnavailable,
        core_posting_unaffected: true,
        posted_at: postedAt,
      };
      liveRecords.push(check);

      history.push({
        event_id: nextId(),
        target_id: check.posting_id,
        action: 'core_workflow_unaffected_by_map_outage',
        actor_user_id: actor,
        reason: `${label} (${qtyStr} units) posted cleanly while map_unavailable=${String(mapUnavailable)}`,
        timestamp: postedAt,
      });

      return recordLedgerAndPersist(
        'p25.core_posting_check',
        actor,
        check.posting_id,
        input.idempotency_key,
        input,
        201,
        'CORE_WORKFLOW_UNAFFECTED_BY_MAP_OUTAGE',
        `Committed authorized action "${label}" (${qtyStr} units) cleanly — supporting map outage never blocks core workflows.`,
        structuredClone(check)
      );
    },

    lookupOperationsMapOperation(input) {
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

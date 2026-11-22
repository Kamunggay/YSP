import { computeDeterministicHash } from './canonicalHash';

export const S02_CONTEXT_STORAGE_KEY = 'ysp_s02_dashboard_context';

const INTEGER_PATTERN = /^(?:0|[1-9]\d{0,11})$/;
const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const STRICT_UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export type DashboardRouteTarget =
  | 'p02-admin'
  | 'p03-records'
  | 'p04-evidence'
  | 'p05-inventory'
  | 'p06-opening'
  | 'p07-requisitions'
  | 'p08-purchasing'
  | 'p09-quotations'
  | 'p10-receiving'
  | 'p11-issues'
  | 'p12-sales'
  | 'p13-payments'
  | 'p14-clocks'
  | 'p15-releases'
  | 'p16-donations'
  | 'p17-variance-adj'
  | 'p18-claims'
  | 'p19-refunds'
  | 'p20-booth-checkout'
  | 'p21-booth-sale'
  | 'p22-manual-outage'
  | 'p23-booth-closeout'
  | 'p24-reports'
  | 'p25-operations-map'
  | 'p26-cutover'
  | 'p27-host-release'
  | 'p28-recovery'
  | 'p29-acceptance';

export type WorkstationGroupId =
  | 'governance'
  | 'inventory'
  | 'procurement'
  | 'sales'
  | 'booths'
  | 'reports'
  | 'operations';

export interface WorkstationEntry {
  readonly id: string;
  readonly route: DashboardRouteTarget;
  readonly groupId: WorkstationGroupId;
  readonly title: string;
  readonly description: string;
  readonly duties: ReadonlyArray<string>;
  readonly stageLabel: string;
  readonly keywords: ReadonlyArray<string>;
}

export interface WorkstationGroup {
  readonly id: WorkstationGroupId;
  readonly title: string;
  readonly subtitle: string;
  readonly items: ReadonlyArray<WorkstationEntry>;
}

export const DASHBOARD_WORKSTATION_GROUPS: ReadonlyArray<WorkstationGroup> = [
  {
    id: 'governance',
    title: 'Governance & Setup',
    subtitle: 'Chapter identity, approved policy gates, immutable audit records, and signed evidence.',
    items: [
      {
        id: 'open-p02-workspace-btn',
        route: 'p02-admin',
        groupId: 'governance',
        title: 'Chapter Administration & Setup',
        description: 'Manage chapter context, officer duties, policy approvals, and provider boundaries.',
        duties: ['Chapter Head', 'Chapter Administrator'],
        stageLabel: 'Stage 1',
        keywords: ['admin', 'chapter', 'duties', 'policies', 'provider', 'membership'],
      },
      {
        id: 'open-p03-workspace-btn',
        route: 'p03-records',
        groupId: 'governance',
        title: 'Record & Operation Workspace',
        description: 'Inspect document revisions, durable idempotent operations, and audit trails.',
        duties: ['Chapter Head', 'Finance Officer', 'Inventory Custodian'],
        stageLabel: 'Stage 1',
        keywords: ['records', 'versions', 'audit', 'idempotency', 'lookup'],
      },
      {
        id: 'open-p04-workspace-btn',
        route: 'p04-evidence',
        groupId: 'governance',
        title: 'Ready Evidence & Signed Handover',
        description: 'Capture dual-mode batch signatures, paper scans, and canonical evidence hashes.',
        duties: ['Inventory Custodian', 'Releasing Officer', 'Receiving Officer'],
        stageLabel: 'Stage 1',
        keywords: ['signature', 'evidence', 'handover', 'hash', 'paper'],
      },
    ],
  },
  {
    id: 'inventory',
    title: 'Stockroom & Inventory',
    subtitle: 'Catalog eligibility across seven views, opening counts, and independent variance controls.',
    items: [
      {
        id: 'open-p05-workspace-btn',
        route: 'p05-inventory',
        groupId: 'inventory',
        title: 'Inventory Catalog & Stock Eligibility',
        description: 'Review seven non-overlapping stock views, ROP policies, and disjoint hold clearance.',
        duties: ['Inventory Custodian', 'Procurement Officer'],
        stageLabel: 'Stage 1',
        keywords: ['catalog', 'sku', 'stock', 'rop', 'eligibility', 'hold'],
      },
      {
        id: 'open-p06-workspace-btn',
        route: 'p06-opening',
        groupId: 'inventory',
        title: 'Opening Physical Count & Baseline Acceptance',
        description: 'Perform opening physical counts, receiving inspection splits, and atomic baseline lock.',
        duties: ['Inventory Custodian', 'Chapter Head', 'Finance Officer'],
        stageLabel: 'Stage 1',
        keywords: ['ipc', 'opening', 'count', 'baseline', 'lock'],
      },
      {
        id: 'open-p17-workspace-btn',
        route: 'p17-variance-adj',
        groupId: 'inventory',
        title: 'Independent Counts & Stock-Variance Adjustments',
        description: 'Execute blind recounts and dual-approved stock variance adjustment postings.',
        duties: ['Inventory Custodian', 'Finance Officer', 'Chapter Head'],
        stageLabel: 'Stage 3',
        keywords: ['recount', 'variance', 'adj', 'adjustment', 'audit'],
      },
    ],
  },
  {
    id: 'procurement',
    title: 'Procurement & Supplies',
    subtitle: 'Internal requisitions, budget reviews, quotations, purchase orders, and inbound receiving.',
    items: [
      {
        id: 'open-p07-workspace-btn',
        route: 'p07-requisitions',
        groupId: 'procurement',
        title: 'Internal Requisitions & Stock Reservations',
        description: 'Submit requisitions, handle return-revise reviews, and lock eligible stock holds.',
        duties: ['Requesting Officer', 'Inventory Custodian', 'Chapter Head'],
        stageLabel: 'Stage 2',
        keywords: ['rf', 'requisition', 'reservation', 'internal'],
      },
      {
        id: 'open-p08-workspace-btn',
        route: 'p08-purchasing',
        groupId: 'procurement',
        title: 'Purchase Requests & Budget Review',
        description: 'Calculate uncovered RF and ROP net needs and secure chapter budget approval.',
        duties: ['Procurement Officer', 'Finance Officer', 'Chapter Head'],
        stageLabel: 'Stage 2',
        keywords: ['repf', 'pr', 'budget', 'net need', 'rop'],
      },
      {
        id: 'open-p09-workspace-btn',
        route: 'p09-quotations',
        groupId: 'procurement',
        title: 'Quotations, Supplier Selection & Purchase Orders',
        description: 'Compare supplier quotations against minimum thresholds and issue approved POs.',
        duties: ['Procurement Officer', 'Finance Officer'],
        stageLabel: 'Stage 2',
        keywords: ['qt', 'po', 'quotation', 'supplier', 'purchase order'],
      },
      {
        id: 'open-p10-workspace-btn',
        route: 'p10-receiving',
        groupId: 'procurement',
        title: 'Supplier Delivery, Partial Receiving & Discrepancies',
        description: 'Inspect inbound deliveries, split accepted/damaged RM lots, and track PO balances.',
        duties: ['Receiving Officer', 'Inventory Custodian'],
        stageLabel: 'Stage 2',
        keywords: ['rm', 'receiving', 'delivery', 'discrepancy', 'supplier'],
      },
      {
        id: 'open-p11-workspace-btn',
        route: 'p11-issues',
        groupId: 'procurement',
        title: 'Signed Material Issues & Partial Fulfillment',
        description: 'Issue partial or full stock against approved requisitions with signed recipient proof.',
        duties: ['Inventory Custodian', 'Releasing Officer'],
        stageLabel: 'Stage 2',
        keywords: ['iss', 'mi', 'issue', 'partial', 'fulfillment'],
      },
    ],
  },
  {
    id: 'sales',
    title: 'Sales, Billing & Cashiering',
    subtitle: 'Customer orders, payment verification, 48h clocks, releases, donations, claims, and refunds.',
    items: [
      {
        id: 'open-p12-workspace-btn',
        route: 'p12-sales',
        groupId: 'sales',
        title: 'Sales Orders, Buyer Acceptance & Invoicing',
        description: 'Review customer orders, split stock coverage, and issue billing-only sales invoices.',
        duties: ['Sales Officer', 'Finance Officer'],
        stageLabel: 'Stage 3',
        keywords: ['so', 'si', 'sales', 'invoice', 'buyer'],
      },
      {
        id: 'open-p13-workspace-btn',
        route: 'p13-payments',
        groupId: 'sales',
        title: 'Payment Verification, Official Receipts & Line Credit',
        description: 'Verify payment slips, prevent duplicate references, issue ORs, and allocate credit.',
        duties: ['Finance Officer', 'Cashier'],
        stageLabel: 'Stage 3',
        keywords: ['or', 'pay', 'payment', 'receipt', 'gcash', 'cash'],
      },
      {
        id: 'open-p14-workspace-btn',
        route: 'p14-clocks',
        groupId: 'sales',
        title: 'Two 48h Clocks, Funded Procurement & Late Money',
        description: 'Monitor dual 48-hour payment/reservation timers and resolve late-payment exceptions.',
        duties: ['Finance Officer', 'Inventory Custodian', 'Procurement Officer'],
        stageLabel: 'Stage 3',
        keywords: ['clk', 'rsv', 'clock', '48h', 'backorder', 'late payment'],
      },
      {
        id: 'open-p15-workspace-btn',
        route: 'p15-releases',
        groupId: 'sales',
        title: 'Covered Customer Releases & Repeated Partials',
        description: 'Release paid customer orders with signed delivery receipts across partial batches.',
        duties: ['Releasing Officer', 'Inventory Custodian'],
        stageLabel: 'Stage 3',
        keywords: ['dr', 'cdr', 'release', 'delivery receipt', 'customer'],
      },
      {
        id: 'open-p16-workspace-btn',
        route: 'p16-donations',
        groupId: 'sales',
        title: 'In-Kind Donations & Bounded Donor Restrictions',
        description: 'Receive non-cash donations while isolating donor-restricted inventory pools.',
        duties: ['Receiving Officer', 'Inventory Custodian', 'Chapter Head'],
        stageLabel: 'Stage 3',
        keywords: ['da', 'donation', 'donor', 'restricted'],
      },
      {
        id: 'open-p18-workspace-btn',
        route: 'p18-claims',
        groupId: 'sales',
        title: 'Customer Claims, Inspected Returns & Replacements',
        description: 'Validate linked OR/DR customer claims, inspect defective items, and sign replacements.',
        duties: ['Sales Officer', 'Inventory Custodian', 'Finance Officer'],
        stageLabel: 'Stage 3',
        keywords: ['clm', 'ret', 'claim', 'return', 'replacement', 'defect'],
      },
      {
        id: 'open-p19-workspace-btn',
        route: 'p19-refunds',
        groupId: 'sales',
        title: 'Refunds, Unequal Exchanges & Funded Exceptions',
        description: 'Execute verified refund payouts, settle unequal exchanges, and close exceptions.',
        duties: ['Finance Officer', 'Cashier', 'Chapter Head'],
        stageLabel: 'Stage 3',
        keywords: ['rfd', 'exg', 'refund', 'exchange', 'payout'],
      },
    ],
  },
  {
    id: 'booths',
    title: 'Campus Booths & Events',
    subtitle: 'Signed booth custody checkouts, rapid POS carts, outage paper receipts, and closeout.',
    items: [
      {
        id: 'open-p20-workspace-btn',
        route: 'p20-booth-checkout',
        groupId: 'booths',
        title: 'Approved Booth Setup & Signed Custody Checkout',
        description: 'Approve campus booth events and transfer stock into isolated booth custody.',
        duties: ['Chapter Head', 'Inventory Custodian', 'Booth Lead'],
        stageLabel: 'Stage 4',
        keywords: ['bth', 'booth', 'checkout', 'custody', 'event'],
      },
      {
        id: 'open-p21-workspace-btn',
        route: 'p21-booth-sale',
        groupId: 'booths',
        title: 'Immediate Booth Cart, Verified Sale & Receipts',
        description: 'Process live booth sales carts with instant OR issuance from booth custody.',
        duties: ['Booth Lead', 'Cashier'],
        stageLabel: 'Stage 4',
        keywords: ['bsl', 'cart', 'pos', 'booth sale'],
      },
      {
        id: 'open-p22-workspace-btn',
        route: 'p22-manual-outage',
        groupId: 'booths',
        title: 'Manual Outage Receipt Controls & Later Entry',
        description: 'Enforce pre-assigned paper receipt ranges and once-only delayed outage posting.',
        duties: ['Booth Lead', 'Cashier', 'Finance Officer'],
        stageLabel: 'Stage 4',
        keywords: ['man', 'outage', 'manual', 'offline', 'paper receipt'],
      },
      {
        id: 'open-p23-workspace-btn',
        route: 'p23-booth-closeout',
        groupId: 'booths',
        title: 'Independent Booth Returns, Variance & Remittance Close-Out',
        description: 'Reconcile booth returns, cash float, dual-approved variance, and final remittance.',
        duties: ['Finance Officer', 'Inventory Custodian', 'Booth Lead'],
        stageLabel: 'Stage 4',
        keywords: ['bco', 'closeout', 'remittance', 'float', 'returns'],
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & Architecture',
    subtitle: 'Seven stock views, accessible queues, scoped exports, operations map, and scenario tracer.',
    items: [
      {
        id: 'open-p24-workspace-btn',
        route: 'p24-reports',
        groupId: 'reports',
        title: 'Reports, Alerts, Immutable Outputs & Accessible Queues',
        description: 'View seven-view reports, manage uncertain-first queues, and retry scoped CSV/PDFs.',
        duties: ['Chapter Head', 'Finance Officer', 'Inventory Custodian'],
        stageLabel: 'Stage 4',
        keywords: ['rpt', 'reports', 'csv', 'pdf', 'export', 'queues'],
      },
      {
        id: 'open-p25-workspace-btn',
        route: 'p25-operations-map',
        groupId: 'reports',
        title: 'Operations Architecture Map & Scenario Tracer',
        description: 'Inspect five operational perspectives, text alternatives, and live scenario tracing.',
        duties: ['Chapter Head', 'Technical Lead', 'Auditor'],
        stageLabel: 'Stage 4',
        keywords: ['map', 'architecture', 'tracer', 'swimlane'],
      },
    ],
  },
  {
    id: 'operations',
    title: 'Release, Cutover & Assurance',
    subtitle: 'Carried obligations, trial/grace lifecycle, host maintenance, recovery drills, and dossier.',
    items: [
      {
        id: 'open-p26-workspace-btn',
        route: 'p26-cutover',
        groupId: 'operations',
        title: 'Cutover Obligations, Staged Activation & Chapter Subscription',
        description: 'Isolate opening carried obligations and govern 30-day trial and 14-day grace limits.',
        duties: ['Chapter Head', 'Finance Officer'],
        stageLabel: 'Stage 5',
        keywords: ['sub', 'mig', 'cutover', 'trial', 'grace', 'subscription'],
      },
      {
        id: 'open-p27-workspace-btn',
        route: 'p27-host-release',
        groupId: 'operations',
        title: 'Reproducible Host Releases & Operating Controls',
        description: 'Validate host security, coordinate maintenance fencing, scheduler lease, and telemetry.',
        duties: ['Technical Lead', 'Operations Operator'],
        stageLabel: 'Stage 5',
        keywords: ['rel', 'host', 'release', 'maintenance', 'scheduler', 'telemetry'],
      },
      {
        id: 'open-p28-workspace-btn',
        route: 'p28-recovery',
        groupId: 'operations',
        title: 'Independent Off-Host Recovery & Operating Handoff',
        description: 'Verify multi-region backups, timed restore drills, and independent reopen handoffs.',
        duties: ['Technical Lead', 'Finance Officer', 'Chapter Head'],
        stageLabel: 'Stage 5',
        keywords: ['drl', 'bkp', 'backup', 'recovery', 'restore', 'handoff'],
      },
      {
        id: 'open-p29-workspace-btn',
        route: 'p29-acceptance',
        groupId: 'operations',
        title: 'Full Regression, Connected Walkthrough & Acceptance Dossier',
        description: 'Run connected professor walkthroughs, verify coverage targets, and issue release verdicts.',
        duties: ['Chapter Head', 'Finance Officer', 'Independent Reviewer'],
        stageLabel: 'Stage 5',
        keywords: ['acc', 'acceptance', 'dossier', 'walkthrough', 'regression'],
      },
    ],
  },
];

export type QueueBucket = 'needs_my_action' | 'waiting_on_others' | 'resolved_history';
export type SubscriptionPhase =
  | 'not_activated'
  | 'trial_active'
  | 'grace_read_export'
  | 'post_grace_suspended'
  | 'paid_active';

export interface DashboardQueueItem {
  queue_item_id: string;
  bucket: QueueBucket;
  record_reference: string;
  title: string;
  summary: string;
  category: string;
  responsible_duty: string;
  target_route: DashboardRouteTarget;
  due_at_utc: string;
  is_uncertain_outcome: boolean;
  is_overdue: boolean;
  urgency_rank: number;
  preparer_actor_id: string;
  requires_independent_approval: boolean;
  inspection_count: number;
  last_inspected_at_utc: string;
}

export interface OperationalPulseSnapshot {
  usable_on_hand: string;
  available_to_allocate: string;
  active_clocks_48h: string;
  unverified_payments_count: string;
  unverified_cash_total: string;
  booth_custody_units: string;
  critical_rop_alerts: string;
}

export interface ChapterLifecycleSnapshot {
  subscription_phase: SubscriptionPhase;
  days_remaining: string;
  maintenance_fenced: boolean;
  maintenance_notice: string;
}

export interface S02InspectionEntry {
  inspection_id: string;
  queue_item_id: string;
  record_reference: string;
  inspected_at_utc: string;
}

export interface S02OperationRecord {
  operation_id: string;
  action_code: string;
  idempotency_key: string;
  payload_fingerprint: string;
  http_status: number;
  code: string;
  message: string;
  snapshot: unknown;
}

export interface S02ActionResult<T = unknown> {
  ok: boolean;
  http_status: number;
  code: string;
  message: string;
  replayed?: boolean | undefined;
  data?: T | undefined;
}

export interface S02LookupResult {
  action_result: 'uncertain' | 'recovered';
  lookup_state: 'pending_or_not_visible' | null;
  operation_id: string | null;
  idempotency_key: string | null;
  recovered_snapshot: unknown;
}

export interface S02AuthorityEvaluation {
  can_act: boolean;
  independence_blocked: boolean;
  duty_blocked: boolean;
  reason: string;
  alternate_admin_route: DashboardRouteTarget | null;
}

export interface S02PrefixJumpTarget {
  prefix: string;
  route: DashboardRouteTarget;
  workstation_title: string;
  record_query: string;
}

export interface S02EngineSnapshot {
  queue_items: ReadonlyArray<DashboardQueueItem>;
  operational_pulse: OperationalPulseSnapshot;
  chapter_lifecycle: ChapterLifecycleSnapshot;
  inspection_log: ReadonlyArray<S02InspectionEntry>;
  operation_ledger: ReadonlyArray<S02OperationRecord>;
  last_action: S02ActionResult | null;
}

export interface S02EngineOptions {
  queue_items?: ReadonlyArray<DashboardQueueItem> | undefined;
  operational_pulse?: OperationalPulseSnapshot | undefined;
  chapter_lifecycle?: ChapterLifecycleSnapshot | undefined;
  inspection_log?: ReadonlyArray<S02InspectionEntry> | undefined;
  operation_ledger?: ReadonlyArray<S02OperationRecord> | undefined;
  next_seq?: number | undefined;
}

export interface S02DashboardEngine {
  getSnapshot: () => S02EngineSnapshot;
  resolveRecordPrefixJump: (rawQuery: string) => S02ActionResult<S02PrefixJumpTarget>;
  enqueueWorkItem: (input: {
    bucket: QueueBucket;
    record_reference: string;
    title: string;
    summary: string;
    category: string;
    responsible_duty: string;
    target_route: DashboardRouteTarget;
    due_at_utc: string;
    is_uncertain_outcome: boolean;
    is_overdue: boolean;
    urgency_rank: number;
    preparer_actor_id: string;
    requires_independent_approval: boolean;
    idempotency_key?: string | undefined;
  }) => S02ActionResult<DashboardQueueItem>;
  inspectWorkItem: (input: {
    queue_item_id: string;
    inspected_at_utc: string;
  }) => S02ActionResult<DashboardQueueItem>;
  updateOperationalPulse: (input: {
    usable_on_hand: string;
    available_to_allocate: string;
    active_clocks_48h: string;
    unverified_payments_count: string;
    unverified_cash_total: string;
    booth_custody_units: string;
    critical_rop_alerts: string;
    idempotency_key?: string | undefined;
  }) => S02ActionResult<OperationalPulseSnapshot>;
  updateChapterLifecycle: (input: {
    subscription_phase: SubscriptionPhase;
    days_remaining: string;
    maintenance_fenced: boolean;
    maintenance_notice: string;
    idempotency_key?: string | undefined;
  }) => S02ActionResult<ChapterLifecycleSnapshot>;
  lookupOperation: (idempotency_key: string) => S02ActionResult<S02LookupResult>;
}

const ALL_WORKSTATION_ENTRIES: ReadonlyArray<WorkstationEntry> = DASHBOARD_WORKSTATION_GROUPS.flatMap(
  (group) => group.items
);

const PREFIX_ROUTE_MAP: Readonly<Record<string, DashboardRouteTarget>> = {
  RF: 'p07-requisitions',
  REPF: 'p08-purchasing',
  PR: 'p08-purchasing',
  QT: 'p09-quotations',
  PO: 'p09-quotations',
  RM: 'p10-receiving',
  ISS: 'p11-issues',
  MI: 'p11-issues',
  SO: 'p12-sales',
  SI: 'p12-sales',
  OR: 'p13-payments',
  PAY: 'p13-payments',
  CLK: 'p14-clocks',
  RSV: 'p14-clocks',
  DR: 'p15-releases',
  CDR: 'p15-releases',
  DA: 'p16-donations',
  ADJ: 'p17-variance-adj',
  CNT: 'p17-variance-adj',
  CLM: 'p18-claims',
  RET: 'p18-claims',
  RFD: 'p19-refunds',
  EXG: 'p19-refunds',
  BTH: 'p20-booth-checkout',
  BSL: 'p21-booth-sale',
  MAN: 'p22-manual-outage',
  BCO: 'p23-booth-closeout',
  IPC: 'p06-opening',
  RPT: 'p24-reports',
  MAP: 'p25-operations-map',
  SUB: 'p26-cutover',
  MIG: 'p26-cutover',
  REL: 'p27-host-release',
  DRL: 'p28-recovery',
  BKP: 'p28-recovery',
  ACC: 'p29-acceptance',
};

function isValidStrictUtcIso(value: string): boolean {
  const trimmed = value.trim();
  if (!STRICT_UTC_ISO_PATTERN.test(trimmed)) return false;
  return !Number.isNaN(Date.parse(trimmed));
}

function parseExactMoneyToCentavos(raw: string): bigint | null {
  const trimmed = raw.trim();
  if (!MONEY_PATTERN.test(trimmed)) return null;
  const [wholePart = '0', decPart = ''] = trimmed.split('.');
  const paddedDec = (decPart + '00').slice(0, 2);
  return BigInt(wholePart) * 100n + BigInt(paddedDec);
}

function formatCentavosToMoney(centavos: bigint): string {
  const whole = centavos / 100n;
  const remainder = centavos % 100n;
  return `${whole.toString()}.${remainder.toString().padStart(2, '0')}`;
}

export function formatPhpCurrency(rawMoney: string): string {
  const parsed = parseExactMoneyToCentavos(rawMoney);
  if (parsed === null) return '₱0.00';
  const whole = (parsed / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = (parsed % 100n).toString().padStart(2, '0');
  return `₱${whole}.${dec}`;
}

export function sortDashboardQueue(
  items: ReadonlyArray<DashboardQueueItem>
): ReadonlyArray<DashboardQueueItem> {
  return [...items].sort((a, b) => {
    if (a.is_uncertain_outcome !== b.is_uncertain_outcome) {
      return a.is_uncertain_outcome ? -1 : 1;
    }
    if (a.is_overdue !== b.is_overdue) {
      return a.is_overdue ? -1 : 1;
    }
    const aDue = a.due_at_utc.trim();
    const bDue = b.due_at_utc.trim();
    if (aDue !== bDue) {
      if (aDue === '') return 1;
      if (bDue === '') return -1;
      const dueCmp = aDue.localeCompare(bDue);
      if (dueCmp !== 0) return dueCmp;
    }
    if (a.urgency_rank !== b.urgency_rank) {
      return a.urgency_rank - b.urgency_rank;
    }
    return a.queue_item_id.localeCompare(b.queue_item_id);
  });
}

export function evaluateQueueAuthority(
  item: DashboardQueueItem,
  currentActorId: string,
  currentDuties: ReadonlyArray<string>
): S02AuthorityEvaluation {
  const normalizedActor = currentActorId.trim().toLowerCase();
  const normalizedPreparer = item.preparer_actor_id.trim().toLowerCase();

  if (
    item.requires_independent_approval &&
    normalizedPreparer !== '' &&
    normalizedActor !== '' &&
    normalizedPreparer === normalizedActor
  ) {
    return {
      can_act: false,
      independence_blocked: true,
      duty_blocked: false,
      reason:
        'You prepared this record. Independent officer review is required before approval or settlement can proceed.',
      alternate_admin_route: 'p02-admin',
    };
  }

  const cleanDuties = currentDuties
    .map((duty) => duty.trim().toLowerCase())
    .filter((duty) => duty.length > 0);
  const itemDuty = item.responsible_duty.trim().toLowerCase();

  if (cleanDuties.length > 0 && itemDuty !== '') {
    const matchesDuty = cleanDuties.some(
      (held) => held === itemDuty || held.includes(itemDuty) || itemDuty.includes(held)
    );
    if (!matchesDuty) {
      return {
        can_act: false,
        independence_blocked: false,
        duty_blocked: true,
        reason: `This task is assigned to ${item.responsible_duty}, which is outside your currently active chapter duty grants.`,
        alternate_admin_route: 'p02-admin',
      };
    }
  }

  return {
    can_act: true,
    independence_blocked: false,
    duty_blocked: false,
    reason: 'Authorized for direct inspection and action under your active chapter session.',
    alternate_admin_route: null,
  };
}

export function workstationMatchesOfficerDuties(
  entry: WorkstationEntry,
  grantedDuties: ReadonlyArray<string>
): boolean {
  const normalized = grantedDuties
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
  if (normalized.length === 0) return true;
  if (normalized.includes('chapter head') || normalized.includes('chapter operations')) {
    return true;
  }
  return entry.duties.some((reqDuty) => {
    const reqLower = reqDuty.toLowerCase();
    return normalized.some(
      (held) => held === reqLower || held.includes(reqLower) || reqLower.includes(held)
    );
  });
}

export function createS02DashboardEngine(options: S02EngineOptions = {}): S02DashboardEngine {
  let queueItems: DashboardQueueItem[] = (options.queue_items ?? []).map((item) => ({ ...item }));
  let operationalPulse: OperationalPulseSnapshot = options.operational_pulse
    ? { ...options.operational_pulse }
    : {
        usable_on_hand: '0',
        available_to_allocate: '0',
        active_clocks_48h: '0',
        unverified_payments_count: '0',
        unverified_cash_total: '0.00',
        booth_custody_units: '0',
        critical_rop_alerts: '0',
      };
  let chapterLifecycle: ChapterLifecycleSnapshot = options.chapter_lifecycle
    ? { ...options.chapter_lifecycle }
    : {
        subscription_phase: 'not_activated',
        days_remaining: '0',
        maintenance_fenced: false,
        maintenance_notice: '',
      };
  const inspectionLog: S02InspectionEntry[] = (options.inspection_log ?? []).map((entry) => ({
    ...entry,
  }));
  const operationLedger: S02OperationRecord[] = (options.operation_ledger ?? []).map((entry) => ({
    ...entry,
  }));
  let seq = options.next_seq ?? 1;
  let lastAction: S02ActionResult | null = null;

  function nextId(prefix: string): string {
    const id = `${prefix}-${String(seq).padStart(4, '0')}`;
    seq += 1;
    return id;
  }

  function recordOutcome<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payloadFingerprint: string,
    result: S02ActionResult<T>,
    snapshotPayload: unknown
  ): S02ActionResult<T> {
    if (idempotencyKey && idempotencyKey.trim() !== '') {
      operationLedger.push({
        operation_id: nextId('S02-OP'),
        action_code: actionCode,
        idempotency_key: idempotencyKey.trim(),
        payload_fingerprint: payloadFingerprint,
        http_status: result.http_status,
        code: result.code,
        message: result.message,
        snapshot: snapshotPayload,
      });
    }
    lastAction = result;
    return result;
  }

  function checkIdempotency<T>(
    actionCode: string,
    idempotencyKey: string | undefined,
    payloadFingerprint: string
  ): S02ActionResult<T> | null {
    const trimmed = idempotencyKey?.trim() ?? '';
    if (trimmed === '') return null;
    const existing = operationLedger.find(
      (entry) => entry.action_code === actionCode && entry.idempotency_key === trimmed
    );
    if (!existing) return null;
    if (existing.payload_fingerprint !== payloadFingerprint) {
      const mismatch: S02ActionResult<T> = {
        ok: false,
        http_status: 409,
        code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        message: 'A different request payload was submitted with an already used operation key.',
      };
      lastAction = mismatch;
      return mismatch;
    }
    const replayed: S02ActionResult<T> = {
      ok: existing.http_status >= 200 && existing.http_status < 300,
      http_status: existing.http_status,
      code: 'OPERATION_RECOVERED',
      message: `${existing.message} (Recovered from prior operation record.)`,
      replayed: true,
      data: existing.snapshot as T,
    };
    lastAction = replayed;
    return replayed;
  }

  function getSnapshot(): S02EngineSnapshot {
    return {
      queue_items: sortDashboardQueue(queueItems).map((item) => ({ ...item })),
      operational_pulse: { ...operationalPulse },
      chapter_lifecycle: { ...chapterLifecycle },
      inspection_log: inspectionLog.map((entry) => ({ ...entry })),
      operation_ledger: operationLedger.map((entry) => ({ ...entry })),
      last_action: lastAction ? { ...lastAction } : null,
    };
  }

  function resolveRecordPrefixJump(rawQuery: string): S02ActionResult<S02PrefixJumpTarget> {
    const trimmed = rawQuery.trim();
    if (trimmed === '') {
      const fail: S02ActionResult<S02PrefixJumpTarget> = {
        ok: false,
        http_status: 422,
        code: 'EMPTY_RECORD_QUERY',
        message: 'Enter a document reference prefix such as RF-2026-001 or SO-2026-002 to jump.',
      };
      lastAction = fail;
      return fail;
    }

    const upper = trimmed.toUpperCase();
    const dashIndex = upper.indexOf('-');
    const prefix = dashIndex > 0 ? upper.slice(0, dashIndex) : upper;
    const targetRoute = PREFIX_ROUTE_MAP[prefix];

    if (!targetRoute) {
      const unknown: S02ActionResult<S02PrefixJumpTarget> = {
        ok: false,
        http_status: 422,
        code: 'UNKNOWN_RECORD_PREFIX',
        message: `Unrecognized record prefix "${prefix}". Use canonical prefixes like RF, SO, PO, OR, DR, or BTH.`,
      };
      lastAction = unknown;
      return unknown;
    }

    const entry = ALL_WORKSTATION_ENTRIES.find((item) => item.route === targetRoute);
    const jumpData: S02PrefixJumpTarget = {
      prefix,
      route: targetRoute,
      workstation_title: entry?.title ?? targetRoute,
      record_query: trimmed,
    };
    const okResult: S02ActionResult<S02PrefixJumpTarget> = {
      ok: true,
      http_status: 200,
      code: 'RECORD_JUMP_RESOLVED',
      message: `Navigated to ${jumpData.workstation_title} for reference ${trimmed}.`,
      data: jumpData,
    };
    lastAction = okResult;
    return okResult;
  }

  function enqueueWorkItem(input: {
    bucket: QueueBucket;
    record_reference: string;
    title: string;
    summary: string;
    category: string;
    responsible_duty: string;
    target_route: DashboardRouteTarget;
    due_at_utc: string;
    is_uncertain_outcome: boolean;
    is_overdue: boolean;
    urgency_rank: number;
    preparer_actor_id: string;
    requires_independent_approval: boolean;
    idempotency_key?: string | undefined;
  }): S02ActionResult<DashboardQueueItem> {
    const fingerprint = computeDeterministicHash({
      action: 'enqueue_work_item',
      bucket: input.bucket,
      record_reference: input.record_reference.trim(),
      title: input.title.trim(),
      summary: input.summary.trim(),
      category: input.category.trim(),
      responsible_duty: input.responsible_duty.trim(),
      target_route: input.target_route,
      due_at_utc: input.due_at_utc.trim(),
      is_uncertain_outcome: input.is_uncertain_outcome,
      is_overdue: input.is_overdue,
      urgency_rank: input.urgency_rank,
      preparer_actor_id: input.preparer_actor_id.trim(),
      requires_independent_approval: input.requires_independent_approval,
    });

    const replay = checkIdempotency<DashboardQueueItem>(
      'enqueue_work_item',
      input.idempotency_key,
      fingerprint
    );
    if (replay) return replay;

    const ref = input.record_reference.trim();
    const title = input.title.trim();
    const duty = input.responsible_duty.trim();
    const summary = input.summary.trim();
    const dueUtc = input.due_at_utc.trim();

    if (ref === '' || title === '' || duty === '' || summary === '') {
      const fail: S02ActionResult<DashboardQueueItem> = {
        ok: false,
        http_status: 422,
        code: 'MISSING_QUEUE_FIELDS',
        message: 'Record reference, title, responsible duty, and summary are all required.',
      };
      lastAction = fail;
      return fail;
    }

    if (dueUtc !== '' && !isValidStrictUtcIso(dueUtc)) {
      const badDate: S02ActionResult<DashboardQueueItem> = {
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_TIMESTAMP',
        message: 'Due timestamp must follow strict UTC ISO format (YYYY-MM-DDTHH:mm:ssZ).',
      };
      lastAction = badDate;
      return badDate;
    }

    if (!Number.isInteger(input.urgency_rank) || input.urgency_rank < 1) {
      const badRank: S02ActionResult<DashboardQueueItem> = {
        ok: false,
        http_status: 422,
        code: 'INVALID_URGENCY_RANK',
        message: 'Urgency rank must be a positive whole number starting at 1.',
      };
      lastAction = badRank;
      return badRank;
    }

    const created: DashboardQueueItem = {
      queue_item_id: nextId('S02-Q'),
      bucket: input.bucket,
      record_reference: ref,
      title,
      summary,
      category: input.category.trim() || 'Operational Alert',
      responsible_duty: duty,
      target_route: input.target_route,
      due_at_utc: dueUtc,
      is_uncertain_outcome: input.is_uncertain_outcome,
      is_overdue: input.is_overdue,
      urgency_rank: input.urgency_rank,
      preparer_actor_id: input.preparer_actor_id.trim(),
      requires_independent_approval: input.requires_independent_approval,
      inspection_count: 0,
      last_inspected_at_utc: '',
    };

    queueItems = [...queueItems, created];

    const res: S02ActionResult<DashboardQueueItem> = {
      ok: true,
      http_status: 201,
      code: 'QUEUE_ITEM_ENQUEUED',
      message: `Queued ${created.record_reference} under ${created.responsible_duty}.`,
      data: { ...created },
    };
    return recordOutcome('enqueue_work_item', input.idempotency_key, fingerprint, res, created);
  }

  function inspectWorkItem(input: {
    queue_item_id: string;
    inspected_at_utc: string;
  }): S02ActionResult<DashboardQueueItem> {
    const targetId = input.queue_item_id.trim();
    const inspectedAt = input.inspected_at_utc.trim();

    if (!isValidStrictUtcIso(inspectedAt)) {
      const badTime: S02ActionResult<DashboardQueueItem> = {
        ok: false,
        http_status: 422,
        code: 'INVALID_UTC_TIMESTAMP',
        message: 'Inspection timestamp must use strict UTC ISO format.',
      };
      lastAction = badTime;
      return badTime;
    }

    const existing = queueItems.find((item) => item.queue_item_id === targetId);
    if (!existing) {
      const notFound: S02ActionResult<DashboardQueueItem> = {
        ok: false,
        http_status: 404,
        code: 'QUEUE_ITEM_NOT_FOUND',
        message: `Queue item ${targetId} was not found.`,
      };
      lastAction = notFound;
      return notFound;
    }

    const updated: DashboardQueueItem = {
      ...existing,
      inspection_count: existing.inspection_count + 1,
      last_inspected_at_utc: inspectedAt,
    };

    queueItems = queueItems.map((item) => (item.queue_item_id === targetId ? updated : item));
    inspectionLog.push({
      inspection_id: nextId('S02-INSP'),
      queue_item_id: updated.queue_item_id,
      record_reference: updated.record_reference,
      inspected_at_utc: inspectedAt,
    });

    const okResult: S02ActionResult<DashboardQueueItem> = {
      ok: true,
      http_status: 200,
      code: 'ALERT_INSPECTED_TASK_REMAINS_OPEN',
      message: `Alert ${updated.record_reference} inspected; the underlying business task remains open until completed.`,
      data: { ...updated },
    };
    lastAction = okResult;
    return okResult;
  }

  function updateOperationalPulse(input: {
    usable_on_hand: string;
    available_to_allocate: string;
    active_clocks_48h: string;
    unverified_payments_count: string;
    unverified_cash_total: string;
    booth_custody_units: string;
    critical_rop_alerts: string;
    idempotency_key?: string | undefined;
  }): S02ActionResult<OperationalPulseSnapshot> {
    const fingerprint = computeDeterministicHash({
      action: 'update_operational_pulse',
      usable_on_hand: input.usable_on_hand.trim(),
      available_to_allocate: input.available_to_allocate.trim(),
      active_clocks_48h: input.active_clocks_48h.trim(),
      unverified_payments_count: input.unverified_payments_count.trim(),
      unverified_cash_total: input.unverified_cash_total.trim(),
      booth_custody_units: input.booth_custody_units.trim(),
      critical_rop_alerts: input.critical_rop_alerts.trim(),
    });

    const replay = checkIdempotency<OperationalPulseSnapshot>(
      'update_operational_pulse',
      input.idempotency_key,
      fingerprint
    );
    if (replay) return replay;

    const integerFields = [
      input.usable_on_hand.trim(),
      input.available_to_allocate.trim(),
      input.active_clocks_48h.trim(),
      input.unverified_payments_count.trim(),
      input.booth_custody_units.trim(),
      input.critical_rop_alerts.trim(),
    ];

    if (integerFields.some((v) => !INTEGER_PATTERN.test(v))) {
      const badInt: S02ActionResult<OperationalPulseSnapshot> = {
        ok: false,
        http_status: 422,
        code: 'INVALID_PULSE_INTEGER',
        message: 'All stock, clock, payment slip, and alert counts must be whole non-negative integers.',
      };
      lastAction = badInt;
      return badInt;
    }

    const usable = BigInt(input.usable_on_hand.trim());
    const available = BigInt(input.available_to_allocate.trim());
    if (available > usable) {
      const exceed: S02ActionResult<OperationalPulseSnapshot> = {
        ok: false,
        http_status: 422,
        code: 'AVAILABLE_EXCEEDS_USABLE_ON_HAND',
        message: 'Available stock to allocate cannot exceed total usable stockroom on-hand.',
      };
      lastAction = exceed;
      return exceed;
    }

    const cashCentavos = parseExactMoneyToCentavos(input.unverified_cash_total);
    if (cashCentavos === null) {
      const badMoney: S02ActionResult<OperationalPulseSnapshot> = {
        ok: false,
        http_status: 422,
        code: 'INVALID_CURRENCY_AMOUNT',
        message: 'Unverified cash total must be a valid non-negative amount with up to two decimal places.',
      };
      lastAction = badMoney;
      return badMoney;
    }

    operationalPulse = {
      usable_on_hand: usable.toString(),
      available_to_allocate: available.toString(),
      active_clocks_48h: BigInt(input.active_clocks_48h.trim()).toString(),
      unverified_payments_count: BigInt(input.unverified_payments_count.trim()).toString(),
      unverified_cash_total: formatCentavosToMoney(cashCentavos),
      booth_custody_units: BigInt(input.booth_custody_units.trim()).toString(),
      critical_rop_alerts: BigInt(input.critical_rop_alerts.trim()).toString(),
    };

    const okResult: S02ActionResult<OperationalPulseSnapshot> = {
      ok: true,
      http_status: 200,
      code: 'OPERATIONAL_PULSE_UPDATED',
      message: 'Updated operational stock, clock, and cashiering telemetry snapshot.',
      data: { ...operationalPulse },
    };
    return recordOutcome(
      'update_operational_pulse',
      input.idempotency_key,
      fingerprint,
      okResult,
      operationalPulse
    );
  }

  function updateChapterLifecycle(input: {
    subscription_phase: SubscriptionPhase;
    days_remaining: string;
    maintenance_fenced: boolean;
    maintenance_notice: string;
    idempotency_key?: string | undefined;
  }): S02ActionResult<ChapterLifecycleSnapshot> {
    const daysTrimmed = input.days_remaining.trim();
    const noticeTrimmed = input.maintenance_notice.trim();

    const fingerprint = computeDeterministicHash({
      action: 'update_chapter_lifecycle',
      subscription_phase: input.subscription_phase,
      days_remaining: daysTrimmed,
      maintenance_fenced: input.maintenance_fenced,
      maintenance_notice: noticeTrimmed,
    });

    const replay = checkIdempotency<ChapterLifecycleSnapshot>(
      'update_chapter_lifecycle',
      input.idempotency_key,
      fingerprint
    );
    if (replay) return replay;

    if (!INTEGER_PATTERN.test(daysTrimmed)) {
      const badDays: S02ActionResult<ChapterLifecycleSnapshot> = {
        ok: false,
        http_status: 422,
        code: 'INVALID_LIFECYCLE_DAYS',
        message: 'Remaining lifecycle days must be a non-negative whole integer.',
      };
      lastAction = badDays;
      return badDays;
    }

    if (input.maintenance_fenced && noticeTrimmed === '') {
      const missingNotice: S02ActionResult<ChapterLifecycleSnapshot> = {
        ok: false,
        http_status: 422,
        code: 'MAINTENANCE_NOTICE_REQUIRED',
        message: 'Planned maintenance write fencing requires a clear officer notice and update window.',
      };
      lastAction = missingNotice;
      return missingNotice;
    }

    chapterLifecycle = {
      subscription_phase: input.subscription_phase,
      days_remaining: BigInt(daysTrimmed).toString(),
      maintenance_fenced: input.maintenance_fenced,
      maintenance_notice: noticeTrimmed,
    };

    const okResult: S02ActionResult<ChapterLifecycleSnapshot> = {
      ok: true,
      http_status: 200,
      code: 'CHAPTER_LIFECYCLE_UPDATED',
      message: 'Updated chapter subscription status and host maintenance boundary.',
      data: { ...chapterLifecycle },
    };
    return recordOutcome(
      'update_chapter_lifecycle',
      input.idempotency_key,
      fingerprint,
      okResult,
      chapterLifecycle
    );
  }

  function lookupOperation(idempotency_key: string): S02ActionResult<S02LookupResult> {
    const trimmed = idempotency_key.trim();
    const match = operationLedger.find((entry) => entry.idempotency_key === trimmed);
    if (!match) {
      const missing: S02ActionResult<S02LookupResult> = {
        ok: false,
        http_status: 404,
        code: 'OPERATION_NOT_VISIBLE',
        message: 'No committed dashboard telemetry operation matches that key yet.',
        data: {
          action_result: 'uncertain',
          lookup_state: 'pending_or_not_visible',
          operation_id: null,
          idempotency_key: trimmed || null,
          recovered_snapshot: null,
        },
      };
      lastAction = missing;
      return missing;
    }

    const recovered: S02ActionResult<S02LookupResult> = {
      ok: true,
      http_status: 200,
      code: 'OPERATION_RECOVERED',
      message: `Recovered committed operation ${match.operation_id} (${match.code}).`,
      replayed: true,
      data: {
        action_result: 'recovered',
        lookup_state: null,
        operation_id: match.operation_id,
        idempotency_key: match.idempotency_key,
        recovered_snapshot: match.snapshot,
      },
    };
    lastAction = recovered;
    return recovered;
  }

  return {
    getSnapshot,
    resolveRecordPrefixJump,
    enqueueWorkItem,
    inspectWorkItem,
    updateOperationalPulse,
    updateChapterLifecycle,
    lookupOperation,
  };
}

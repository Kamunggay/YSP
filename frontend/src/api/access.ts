import type { ChapterAccessSnapshot, ChapterActionAccess } from './types.ts';

export function getActionAccess(access: ChapterAccessSnapshot | null, action: string): ChapterActionAccess | null {
  if (!access) {
    return null;
  }
  return access.actions.find((a) => a.action === action) ?? null;
}

const ACTION_LABELS: Record<string, string> = {
  'catalogue.read': 'Viewing catalogue records',
  'catalogue.maintain': 'Adding or updating catalogue items',
  'history.read': 'Viewing change history',
  'evidence.prepare': 'Uploading signed documents',
  'evidence.read': 'Viewing signed documents',
  'opening.read': 'Viewing opening inventory counts',
  'ipc.read': 'Viewing opening inventory counts',
  'ipc.draft': 'Preparing an opening inventory count',
  'ipc.count': 'Recording opening physical count quantities',
  'ipc.authorize': 'Authorizing an opening inventory count',
  'opening_rm.read': 'Viewing opening receipt memos',
  'opening_rm.prepare': 'Preparing an opening receipt & inspection',
  'opening_rm.post': 'Posting opening stock balances',
  'opening_result.read': 'Viewing opening inventory status',
  'opening.result.read': 'Viewing opening inventory status',
  'opening_action.read': 'Viewing opening inventory status',
  'opening.prepare': 'Preparing an opening inventory count',
  'opening.submit': 'Submitting an opening inventory count',
  'opening.authorize': 'Authorizing an opening inventory count',
  'opening.inspect': 'Inspecting an opening inventory receipt',
  'opening.post': 'Posting opening stock balances',
  'stock.read': 'Viewing stock levels',
  'rf.read': 'Viewing requisitions',
  'rf.draft': 'Saving draft requisitions',
  'rf.submit': 'Submitting requisitions',
  'rf.approve': 'Approving requisitions',
  'rf.reserve': 'Reserving stock for requisitions',
  'rf.reallocate': 'Moving reserved stock',
  'reservation_result.read': 'Viewing reservation change status',
  'hold.place': 'Placing stock holds',
  'hold.clear': 'Clearing stock holds',
  'issue.prepare': 'Preparing stock issue handovers',
  'issue.post': 'Posting completed issue handovers',
  'issue_result.read': 'Viewing issue handover status',
  // Stage 2 action keys (39 canonical keys from contracts/stage2/handoff.yaml)
  'replenishment.read': 'Viewing net shortage & replenishment needs',
  'repf.read': 'Viewing replenishment forms',
  'repf.draft': 'Drafting & revising replenishment forms',
  'repf.submit': 'Submitting replenishment forms for budget review',
  'repf.budget_review': 'Reviewing replenishment budgets',
  'repf.cancel': 'Canceling replenishment forms',
  'quotation.read': 'Viewing supplier quotations',
  'quotation.manage': 'Recording & updating supplier quotations',
  'quotation.select': 'Selecting a supplier quotation',
  'po.read': 'Viewing purchase orders',
  'po.draft': 'Drafting & editing purchase orders',
  'po.submit': 'Submitting purchase orders for approval',
  'po.approve': 'Approving or returning purchase orders',
  'po.acknowledge': 'Recording supplier acknowledgment',
  'po.amend_propose': 'Proposing purchase order amendments',
  'po.amend_approve': 'Approving purchase order amendments',
  'po.close_short': 'Closing short purchase orders',
  'po.cancel': 'Canceling purchase orders',
  'da.read': 'Viewing donation acknowledgments',
  'da.history_read': 'Viewing donation revision history',
  'da.draft': 'Drafting & revising donations',
  'da.submit': 'Submitting donations for acknowledgment',
  'da.acknowledge': 'Acknowledging donations & donor conditions',
  'da.cancel': 'Canceling donations',
  'da.restriction_resolve': 'Resolving donor restrictions',
  'receiving.read': 'Viewing receiving reports, discrepancies & holds',
  'receiving.draft': 'Preparing PO & donation receiving reports',
  'receiving.inspect': 'Recording receiving inspections',
  'receiving.match_evidence': 'Binding signed receiving paper',
  'receiving.post': 'Posting inspected receiving reports',
  'receiving.cancel': 'Canceling unposted receiving reports',
  'discrepancy.manage': 'Notifying suppliers of discrepancies',
  'discrepancy.resolve': 'Reviewing & resolving receiving discrepancies',
  'receiving.hold_manage': 'Recording & linking missing-source holds',
  'allocation_queue.read': 'Viewing allocation priority queue',
  'alerts.read': 'Viewing operational alerts',
  'reports.inventory.read': 'Viewing inventory reports',
  'reports.procurement.read': 'Viewing procurement reports',
  'reports.control.read': 'Viewing control & donation reports',
};

const DUTY_LABELS: Record<string, string> = {
  INVENTORY: 'Inventory Officer',
  APPROVAL: 'Requisition Approver',
  RF_APPROVER: 'Requisition Approver',
  RF_CREATOR: 'Requisition Preparer',
  COMMITTEE_REQUESTER: 'Committee Requester',
  CUSTODY: 'Stock Custodian',
  DISPATCH: 'Dispatch Officer',
  OPENING: 'Opening Inventory Officer',
  EVIDENCE: 'Document Verification Officer',
  CHAPTER_HEAD: 'Chapter Head',
  FINANCE: 'Finance Officer',
  PURCHASING: 'Purchasing Officer',
  BUDGET_APPROVER: 'Budget Approver',
  RECEIVING: 'Receiving Officer',
  SALES_OFFICER: 'Sales Officer',
  SALES_REVIEWER: 'Sales Reviewer',
  BOOTH_CUSTODIAN: 'Booth Custodian',
  BOOTH_CASHIER: 'Booth Cashier',
  INDEPENDENT_REVIEWER: 'Independent Reviewer',
};

export function formatActionName(action: string): string {
  if (ACTION_LABELS[action]) {
    return ACTION_LABELS[action];
  }
  const readable = action
    .replace(/[._]/g, ' ')
    .replace(/\bopening rm\b/gi, 'opening receipt')
    .replace(/\bopening result\b/gi, 'opening status')
    .replace(/\bopening action\b/gi, 'opening activity')
    .replace(/\bipc\b/gi, 'opening count')
    .replace(/\brf\b/gi, 'requisition');
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

export function formatDutyName(duty: string): string {
  const mapped = DUTY_LABELS[duty];
  if (mapped) {
    return mapped;
  }
  return duty
    .replace(/^CHAPTER_/, '')
    .replace(/_/g, ' ')
    .replace(/\bRF\b/gi, 'Requisition')
    .replace(/\bIPC\b/gi, 'Opening Count')
    .replace(/\bRM\b/gi, 'Opening Receipt')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function formatSettingKey(key: string): string {
  return key
    .replace(/\bpurchasing_quotation_policy\b/g, 'quotation tier policy')
    .replace(/\bda_authorization\b/g, 'donation authorization policy')
    .replace(/_/g, ' ')
    .replace(/\brepf\b/gi, 'replenishment form')
    .replace(/\bpo\b/gi, 'purchase order')
    .replace(/\bda\b/gi, 'donation acknowledgment')
    .replace(/\brf\b/gi, 'requisition')
    .replace(/\bipc\b/gi, 'opening count')
    .replace(/\brm\b/gi, 'receiving report');
}

export function actionBlockReason(access: ChapterAccessSnapshot | null, ...actions: string[]): string | null {
  if (!access) {
    return null;
  }
  const messages: string[] = [];
  for (const action of actions) {
    const entry = getActionAccess(access, action);
    if (!entry || entry.state === 'allowed' || entry.state === 'context_required') {
      continue;
    }
    const label = formatActionName(action);
    if (entry.state === 'setup_blocked') {
      const detail = entry.blockers
        .map((b) =>
          b.message
            ? formatSettingKey(b.message)
            : b.setting_key
              ? formatSettingKey(b.setting_key)
              : b.code
                ? formatSettingKey(b.code)
                : 'chapter setup incomplete',
        )
        .filter(Boolean)
        .join('; ');
      messages.push(`${label} is unavailable until chapter setup is complete${detail ? ` (${detail})` : ''}`);
    } else {
      const duties =
        entry.required_duties.length > 0
          ? ` — requires the ${entry.required_duties.map(formatDutyName).join(' or ')} role`
          : '';
      messages.push(`${label} is restricted${duties}`);
    }
  }
  return messages.length > 0 ? messages.join(' | ') : null;
}

export function isActionPermitted(access: ChapterAccessSnapshot | null, ...actions: string[]): boolean {
  return actionBlockReason(access, ...actions) === null;
}

export function unwrapMutationData<T extends Record<string, unknown>>(
  data: unknown,
): { record: T; operationId?: string } {
  if (!data || typeof data !== 'object') {
    return { record: {} as T };
  }
  const obj = data as Record<string, unknown>;
  const nestedOp = obj.operation && typeof obj.operation === 'object' ? (obj.operation as Record<string, unknown>) : null;
  const operationId =
    typeof obj.operation_id === 'string'
      ? obj.operation_id
      : nestedOp && typeof nestedOp.id === 'string'
        ? nestedOp.id
        : undefined;

  if (obj.record && typeof obj.record === 'object') {
    return { record: obj.record as T, operationId };
  }
  if (obj.result && typeof obj.result === 'object') {
    return { record: obj.result as T, operationId };
  }
  if (obj.resource && typeof obj.resource === 'object') {
    return { record: obj.resource as T, operationId };
  }
  return { record: obj as T, operationId };
}

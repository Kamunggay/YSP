import type { Stage1EventNotice } from '../api/types.ts';

export type Stage2EventName =
  | 'stage2.repf.changed.v1'
  | 'stage2.purchase-order.changed.v1'
  | 'stage2.donation.changed.v1'
  | 'stage2.receiving-report.changed.v1'
  | 'stage2.receiving-discrepancy.changed.v1'
  | 'stage2.receiving-hold.changed.v1';

export type Stage2RefreshDomain =
  | 'authority'
  | 'chapter_setup'
  | 'replenishment'
  | 'repf'
  | 'quotations'
  | 'purchase_order'
  | 'donation'
  | 'receiving_report'
  | 'receiving_discrepancy'
  | 'receiving_hold'
  | 'stock'
  | 'allocation_queue'
  | 'alerts'
  | 'reports';

export const STAGE2_EVENT_NAMES: readonly Stage2EventName[] = [
  'stage2.repf.changed.v1',
  'stage2.purchase-order.changed.v1',
  'stage2.donation.changed.v1',
  'stage2.receiving-report.changed.v1',
  'stage2.receiving-discrepancy.changed.v1',
  'stage2.receiving-hold.changed.v1',
] as const;

const STAGE2_EVENT_SET = new Set<string>(STAGE2_EVENT_NAMES);

const CLOSED_ENVELOPE_KEYS = new Set([
  'event_name',
  'event_id',
  'committed_at',
  'chapter_id',
  'resource_kind',
  'resource_id',
  'resource_version',
  'material_version',
]);

const STAGE2_EVENT_DOMAINS: Record<Stage2EventName, Stage2RefreshDomain[]> = {
  'stage2.repf.changed.v1': [
    'repf',
    'quotations',
    'replenishment',
    'alerts',
    'reports',
  ],
  'stage2.purchase-order.changed.v1': [
    'purchase_order',
    'repf',
    'replenishment',
    'receiving_report',
    'alerts',
    'reports',
  ],
  'stage2.donation.changed.v1': [
    'donation',
    'receiving_report',
    'alerts',
    'reports',
  ],
  'stage2.receiving-report.changed.v1': [
    'receiving_report',
    'purchase_order',
    'donation',
    'receiving_discrepancy',
    'stock',
    'replenishment',
    'allocation_queue',
    'alerts',
    'reports',
  ],
  'stage2.receiving-discrepancy.changed.v1': [
    'receiving_discrepancy',
    'receiving_report',
    'purchase_order',
    'donation',
    'stock',
    'alerts',
    'reports',
  ],
  'stage2.receiving-hold.changed.v1': [
    'receiving_hold',
    'receiving_report',
    'stock',
    'alerts',
    'reports',
  ],
};

const STAGE1_CO_EMITTED_DOMAINS: Record<string, Stage2RefreshDomain[]> = {
  'stage1.stock-lot.changed.v1': [
    'stock',
    'replenishment',
    'allocation_queue',
    'alerts',
    'reports',
    'donation',
  ],
  'stage1.internal-rf.changed.v1': [
    'replenishment',
    'allocation_queue',
    'repf',
    'purchase_order',
    'alerts',
    'reports',
  ],
  'stage1.reservation.changed.v1': [
    'stock',
    'replenishment',
    'allocation_queue',
    'alerts',
    'reports',
  ],
  'stage1.actual-issue.changed.v1': [
    'stock',
    'replenishment',
    'allocation_queue',
    'alerts',
    'reports',
  ],
  'stage1.stock-hold.changed.v1': [
    'stock',
    'replenishment',
    'allocation_queue',
    'alerts',
    'reports',
  ],
  'stage1.chapter-setup.changed.v1': [
    'chapter_setup',
    'replenishment',
    'repf',
    'quotations',
    'purchase_order',
    'donation',
    'allocation_queue',
    'alerts',
    'reports',
  ],
  'stage1.authority.changed.v1': ['authority'],
  'stage1.catalogue.changed.v1': ['chapter_setup', 'replenishment', 'reports'],
  'stage1.opening-baseline.changed.v1': [
    'stock',
    'replenishment',
    'allocation_queue',
    'reports',
  ],
};

export function isSupportedStageEventName(eventName: string): boolean {
  if (STAGE2_EVENT_SET.has(eventName)) {
    return true;
  }
  return eventName.startsWith('stage1.') && eventName.endsWith('.changed.v1');
}

/**
 * Validates the closed 8-field event envelope defined in `contracts/stage2/events.schema.yaml`.
 */
export function parseRealtimeNoticeEnvelope(raw: unknown): Stage1EventNotice | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== CLOSED_ENVELOPE_KEYS.size) {
    return null;
  }
  for (const k of keys) {
    if (!CLOSED_ENVELOPE_KEYS.has(k)) {
      return null;
    }
  }
  if (
    typeof obj.event_name !== 'string' ||
    !isSupportedStageEventName(obj.event_name) ||
    typeof obj.event_id !== 'string' ||
    obj.event_id.trim().length === 0 ||
    typeof obj.committed_at !== 'string' ||
    obj.committed_at.trim().length === 0 ||
    typeof obj.resource_kind !== 'string' ||
    obj.resource_kind.trim().length === 0
  ) {
    return null;
  }
  if (obj.chapter_id !== null && typeof obj.chapter_id !== 'string') {
    return null;
  }
  if (obj.resource_id !== null && typeof obj.resource_id !== 'string') {
    return null;
  }
  if (
    obj.resource_version !== null &&
    (typeof obj.resource_version !== 'number' || !Number.isInteger(obj.resource_version))
  ) {
    return null;
  }
  if (
    obj.material_version !== null &&
    (typeof obj.material_version !== 'number' || !Number.isInteger(obj.material_version))
  ) {
    return null;
  }
  return obj as unknown as Stage1EventNotice;
}

export function getRefreshDomainsForNotice(notice: Stage1EventNotice): Stage2RefreshDomain[] {
  if (STAGE2_EVENT_SET.has(notice.event_name)) {
    return STAGE2_EVENT_DOMAINS[notice.event_name as Stage2EventName];
  }
  return STAGE1_CO_EMITTED_DOMAINS[notice.event_name] ?? [];
}

export type NoticeAcceptResult =
  | { accepted: true; notice: Stage1EventNotice; domains: Stage2RefreshDomain[] }
  | {
      accepted: false;
      reason: 'invalid_envelope' | 'duplicate_event' | 'foreign_chapter' | 'stale_version';
    };

/**
 * Tracks deduplicated event IDs and reconciled resource versions per chapter.
 * Implements `contracts/stage2/events.yaml` frontend rules:
 * - Deduplicates by `event_id`
 * - Ignores foreign-chapter payloads
 * - Suppresses out-of-order stale `resource_version`, EXCEPT unseen `event_id` on
 *   `stage2.repf.changed.v1` at equal version (nested quotation / supplier-selection refresh).
 */
export class Stage2NoticeTracker {
  private readonly seenEventIds = new Set<string>();
  private readonly reconciledVersions = new Map<string, number>();

  clear(): void {
    this.seenEventIds.clear();
    this.reconciledVersions.clear();
  }

  seedVersion(
    chapterId: string | null,
    resourceKind: string,
    resourceId: string,
    version: number,
  ): void {
    const key = `${chapterId ?? 'global'}::${resourceKind}::${resourceId}`;
    const existing = this.reconciledVersions.get(key);
    if (existing === undefined || version > existing) {
      this.reconciledVersions.set(key, version);
    }
  }

  evaluate(raw: unknown, activeChapterId: string | null): NoticeAcceptResult {
    const notice = parseRealtimeNoticeEnvelope(raw);
    if (!notice) {
      return { accepted: false, reason: 'invalid_envelope' };
    }
    if (this.seenEventIds.has(notice.event_id)) {
      return { accepted: false, reason: 'duplicate_event' };
    }
    if (
      activeChapterId &&
      notice.chapter_id !== null &&
      notice.chapter_id !== activeChapterId
    ) {
      return { accepted: false, reason: 'foreign_chapter' };
    }

    this.seenEventIds.add(notice.event_id);
    if (this.seenEventIds.size > 500) {
      const oldest = this.seenEventIds.values().next().value;
      if (oldest) {
        this.seenEventIds.delete(oldest);
      }
    }

    if (notice.resource_id && typeof notice.resource_version === 'number') {
      const key = `${notice.chapter_id ?? 'global'}::${notice.resource_kind}::${notice.resource_id}`;
      const previous = this.reconciledVersions.get(key);
      if (previous !== undefined) {
        if (notice.resource_version < previous) {
          return { accepted: false, reason: 'stale_version' };
        }
        if (notice.resource_version === previous) {
          const allowEqualRepfRefresh = notice.event_name === 'stage2.repf.changed.v1';
          if (notice.event_name.startsWith('stage2.') && !allowEqualRepfRefresh) {
            return { accepted: false, reason: 'stale_version' };
          }
        }
      }
      if (previous === undefined || notice.resource_version > previous) {
        this.reconciledVersions.set(key, notice.resource_version);
      }
    }

    return {
      accepted: true,
      notice,
      domains: getRefreshDomainsForNotice(notice),
    };
  }
}

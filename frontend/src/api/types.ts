import type { AllEvidencePurpose } from './stage2Types.ts';

export * from './stage2Types.ts';

export type ConnectionState = 'checking' | 'connected' | 'unavailable';

export type WorkspaceTab =
  | 'my_work'
  | 'catalogue'
  | 'stock'
  | 'evidence'
  | 'opening'
  | 'requisitions'
  | 'reservations_holds'
  | 'actual_issues'
  | 'replenishment_repf'
  | 'quotations_po'
  | 'receiving_discrepancies'
  | 'donations_restrictions'
  | 'stage2_alerts_reports';

export interface FieldError {
  pointer: string;
  code: string;
  message: string;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: FieldError[];
  };
  request_id?: string;
  failed_intent_committed?: boolean;
  current?: unknown;
}

export type SessionState = 'continuation' | 'authenticated';
export type SessionNextStep = 'enroll_authenticator' | 'challenge_authenticator';

export interface SessionProjection {
  state: SessionState;
  user: {
    id: string;
    display_name: string;
  };
  expires_at: string;
  next_step?: SessionNextStep;
  authentication_method?: 'password' | 'authenticator' | 'recovery_code';
  mfa_required?: boolean;
  authenticated_at?: string;
}

export interface MfaEnrollmentBegin {
  enrollment_id: string;
  secret: string;
  provisioning_uri: string;
  expires_at: string;
}

export interface RecoverySetInfo {
  id: string;
  remaining: number;
  created_at: string;
  expires_at: string;
  codes?: string[];
}

export interface RecoveryDeliveryResult {
  recovery_set: RecoverySetInfo;
  codes: string[];
}

export interface ChapterSummary {
  id: string;
  reference: string;
  display_name: string;
  created_at: string;
}

export interface DutyGrantProjection {
  id: string;
  duty: string;
  scope: {
    unit_id: string | null;
    limit_php: string | null;
  };
  effective_from: string;
  effective_until: string | null;
}

export interface ChapterMembership {
  id: string;
  chapter: ChapterSummary;
  duties: string[];
  authority_version: number;
  duty_grants: DutyGrantProjection[];
}

export interface ChapterContext {
  user_id: string;
  membership: ChapterMembership;
  checked_at: string;
}

export type ActionState = 'allowed' | 'context_required' | 'setup_blocked' | 'duty_denied';

export interface SettingBlocker {
  setting_key?: string;
  owner_duty?: string;
  code?: string;
  message?: string;
  schema_reference?: string;
}

export interface ChapterActionAccess {
  action: string;
  state: ActionState;
  required_duties: string[];
  blockers: SettingBlocker[];
}

export interface ChapterAccessSnapshot {
  chapter_id: string;
  user_id: string;
  authority_version: number;
  setup_version: number;
  checked_at: string;
  actions: ChapterActionAccess[];
}

export interface CursorPage {
  next_cursor: string | null;
  snapshot_version?: number | string;
}

export interface ApiEnvelope<T> {
  data: T;
  page?: CursorPage;
  replayed: boolean;
}

export interface StockQuantity {
  value: string;
  quantity_scale: number;
  unit_id?: string;
  unit_code?: string;
}

export interface StockViewBucket {
  label: string;
  quantity: StockQuantity;
}

export interface SevenStockViews {
  usable_stockroom_on_hand: StockViewBucket;
  available_to_allocate: StockViewBucket;
  rf_reserved: StockViewBucket;
  so_reserved: StockViewBucket;
  booth_custody: StockViewBucket;
  quarantined_rejected: StockViewBucket;
  inbound_open_po: StockViewBucket;
}

export interface Stage1EventNotice {
  event_name: string;
  event_id: string;
  committed_at: string;
  chapter_id: string | null;
  resource_kind: string;
  resource_id: string;
  resource_version: number | null;
  material_version: number | null;
}

export interface BoundedRestriction {
  state: 'unrestricted' | 'bounded' | 'uninterpreted';
  allowed_uses: Array<'internal_use' | 'sale' | 'booth_custody'>;
  event_ids: string[];
  requesting_unit_ids: string[];
  effective_from: string | null;
  effective_until: string | null;
  interpretation_id: string | null;
  source_condition_reference: string | null;
}

export type EvidencePurpose = AllEvidencePurpose;
export type IntendedUse = 'internal_use' | 'sale' | 'booth_transfer';

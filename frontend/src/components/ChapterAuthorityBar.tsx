import { useState } from 'react';
import { formatActionName, formatDutyName, formatSettingKey } from '../api/access.ts';
import { formatManilaTime } from '../api/client.ts';
import type { ChapterAccessSnapshot, ChapterContext, ChapterMembership } from '../api/types.ts';
import type { MemoryDraftEntry } from '../state/memoryDraftStore.ts';

interface ChapterAuthorityBarProps {
  memberships: ChapterMembership[];
  selectedChapterId: string | null;
  context: ChapterContext | null;
  access: ChapterAccessSnapshot | null;
  nextCursor: string | null;
  drafts: MemoryDraftEntry[];
  onSelectChapter: (chapterId: string) => void;
  onLoadMoreMemberships: () => void;
  onRefreshAccess: () => void;
}

function humanizeActionState(state: string): string {
  switch (state) {
    case 'allowed':
      return 'Ready';
    case 'setup_blocked':
      return 'Chapter Setup Incomplete';
    case 'duty_denied':
      return 'Role Restricted';
    case 'context_required':
      return 'Select a Chapter';
    default:
      return state;
  }
}

export function ChapterAuthorityBar({
  memberships,
  selectedChapterId,
  context,
  access,
  nextCursor,
  drafts,
  onSelectChapter,
  onLoadMoreMemberships,
  onRefreshAccess,
}: ChapterAuthorityBarProps) {
  const [showPermissions, setShowPermissions] = useState(true);
  const currentMembership = context?.membership ?? memberships.find((m) => m.chapter.id === selectedChapterId) ?? null;
  const blockedActions = (access?.actions ?? []).filter((a) => a.state !== 'allowed');

  return (
    <section className="p04-line-card form-stack" aria-label="Chapter roles and permissions">
      <div className="p04-line-top">
        <div>
          <h3 className="s02-drawer-subhead">Chapter Context &amp; Permissions</h3>
          <p className="form-card-subtitle">
            {currentMembership
              ? `${currentMembership.chapter.reference} · ${currentMembership.chapter.display_name}`
              : 'Select an active chapter to verify permissions.'}
          </p>
        </div>
        <div className="p02-compact-btn-group">
          <button
            type="button"
            className="p02-compact-btn"
            onClick={onRefreshAccess}
            disabled={!selectedChapterId}
          >
            Refresh Access
          </button>
          <button
            type="button"
            className="p02-compact-btn"
            onClick={() => setShowPermissions((prev) => !prev)}
          >
            {showPermissions ? 'Hide Permissions' : `Show Permissions (${access?.actions.length ?? 0})`}
          </button>
        </div>
      </div>

      <div className="p03-two-col">
        <div className="form-group">
          <label className="form-label" htmlFor="auth-bar-chapter-select">
            Active Chapter
          </label>
          <div className="p03-input-action-row">
            <select
              id="auth-bar-chapter-select"
              className="form-control"
              value={selectedChapterId ?? ''}
              onChange={(e) => onSelectChapter(e.target.value)}
            >
              {memberships.length === 0 && <option value="">No chapters assigned</option>}
              {memberships.map((m) => (
                <option key={m.chapter.id} value={m.chapter.id}>
                  {m.chapter.reference} — {m.chapter.display_name}
                </option>
              ))}
            </select>
            {nextCursor && (
              <button
                type="button"
                className="btn-batcave-secondary p03-shrink-btn"
                onClick={onLoadMoreMemberships}
              >
                Load More
              </button>
            )}
          </div>
        </div>

        <div className="form-group">
          <span className="form-label">Assigned Roles &amp; Session Status</span>
          <div className="p03-chip-wrap">
            {currentMembership?.duties.length ? (
              currentMembership.duties.map((duty) => (
                <span key={duty} className="s02-duty-chip">
                  {formatDutyName(duty)}
                </span>
              ))
            ) : (
              <span className="s02-duty-chip">No active roles</span>
            )}
            <span className="p03-version-pill">
              Unsaved Drafts: {drafts.length}
            </span>
            {context?.checked_at && (
              <span className="p03-version-pill">
                Verified {formatManilaTime(context.checked_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {blockedActions.length > 0 && (
        <div className="callout-banner is-warning">
          <span className="callout-dot dot-warning" aria-hidden="true" />
          <div>
            <strong>{blockedActions.length} action{blockedActions.length === 1 ? '' : 's'} currently restricted:</strong>{' '}
            {blockedActions
              .slice(0, 4)
              .map((a) => formatActionName(a.action))
              .join(', ')}
            {blockedActions.length > 4 ? ` and ${blockedActions.length - 4} more.` : '.'}
          </div>
        </div>
      )}

      {showPermissions && access && (
        <div className="p05-table-wrap">
          <table className="p05-cells-table">
            <thead>
              <tr>
                <th>Operation</th>
                <th>Availability</th>
                <th>Allowed Roles</th>
                <th>Chapter Setup Notes</th>
              </tr>
            </thead>
            <tbody>
              {access.actions.map((item) => (
                <tr key={item.action}>
                  <td>{formatActionName(item.action)}</td>
                  <td>
                    <span
                      className={`s02-status-tag ${
                        item.state === 'allowed'
                          ? 'is-ready'
                          : item.state === 'setup_blocked'
                            ? 'is-overdue'
                            : 'is-uncertain'
                      }`}
                    >
                      {humanizeActionState(item.state)}
                    </span>
                  </td>
                  <td>
                    {item.required_duties.length > 0
                      ? item.required_duties.map(formatDutyName).join(', ')
                      : 'Any chapter member'}
                  </td>
                  <td>
                    {item.blockers.length > 0
                      ? item.blockers
                          .map((b) =>
                            b.message
                              ? formatSettingKey(b.message)
                              : b.setting_key
                                ? `Needs setup: ${formatSettingKey(b.setting_key)}`
                                : b.code
                                  ? formatSettingKey(b.code)
                                  : 'Setup incomplete',
                          )
                          .join('; ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

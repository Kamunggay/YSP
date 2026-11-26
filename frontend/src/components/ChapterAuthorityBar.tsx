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
  const [showAccessDetails, setShowAccessDetails] = useState(false);

  const blockedActions = access ? access.actions.filter((a) => a.state === 'setup_blocked') : [];
  const activeMembership = context?.membership ?? memberships.find((m) => m.chapter.id === selectedChapterId) ?? null;

  function requestChapterChange(targetId: string) {
    if (!targetId || targetId === selectedChapterId) {
      return;
    }
    if (drafts.length > 0) {
      const ok = window.confirm(
        `You have ${drafts.length} unsaved draft(s) for this chapter. Switching chapters keeps those drafts aside for this session and clears the screen. Continue?`,
      );
      if (!ok) {
        return;
      }
    }
    onSelectChapter(targetId);
  }

  return (
    <div className="authority-banner">
      <div>
        {activeMembership ? (
          <>
            <div>
              <strong>{activeMembership.chapter.display_name}</strong>{' '}
              <span className="muted">({activeMembership.chapter.reference})</span>
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              {activeMembership.duties.length > 0 ? (
                activeMembership.duties.map((d) => (
                  <span key={d} className="duty-badge">
                    {formatDutyName(d)}
                  </span>
                ))
              ) : (
                <span className="muted">Member view only (no assigned officer roles)</span>
              )}
              {access && (
                <span className="muted" style={{ marginLeft: '0.4rem' }}>
                  Permissions checked {formatManilaTime(access.checked_at)}
                </span>
              )}
            </div>
          </>
        ) : (
          <span className="muted">Select an authorized chapter to begin operations.</span>
        )}
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select
          aria-label="Active chapter selector"
          value={selectedChapterId ?? ''}
          onChange={(e) => requestChapterChange(e.target.value)}
        >
          <option value="" disabled>
            Select chapter…
          </option>
          {memberships.map((m) => (
            <option key={m.chapter.id} value={m.chapter.id}>
              {m.chapter.reference} — {m.chapter.display_name}
            </option>
          ))}
        </select>
        {nextCursor && (
          <button className="btn secondary" onClick={onLoadMoreMemberships}>
            More chapters
          </button>
        )}
        <button className="btn secondary" onClick={onRefreshAccess} disabled={!selectedChapterId}>
          Refresh Permissions
        </button>
        {access && (
          <button className="btn secondary" onClick={() => setShowAccessDetails((v) => !v)}>
            {showAccessDetails ? 'Hide Permissions' : `View Permissions (${blockedActions.length} restricted)`}
          </button>
        )}
      </div>

      {showAccessDetails && access && (
        <div className="table-wrap" style={{ width: '100%', marginTop: '0.5rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Permission</th>
                <th>Availability</th>
                <th>Required Roles</th>
                <th>Setup Requirements</th>
              </tr>
            </thead>
            <tbody>
              {access.actions.map((act) => (
                <tr key={act.action}>
                  <td>{formatActionName(act.action)}</td>
                  <td>
                    <span
                      className={`status-pill ${
                        act.state === 'allowed'
                          ? 'ok'
                          : act.state === 'context_required'
                            ? 'info'
                            : act.state === 'setup_blocked'
                              ? 'warn'
                              : 'bad'
                      }`}
                    >
                      {act.state === 'allowed'
                        ? 'Allowed'
                        : act.state === 'context_required'
                          ? 'Needs Details'
                          : act.state === 'setup_blocked'
                            ? 'Setup Needed'
                            : 'Restricted'}
                    </span>
                  </td>
                  <td>{act.required_duties.map(formatDutyName).join(', ')}</td>
                  <td>
                    {act.blockers.length > 0
                      ? act.blockers
                          .map((b) => {
                            const key = formatSettingKey(b.setting_key ?? b.code ?? 'setup_required');
                            return b.message ? `${key}: ${formatSettingKey(b.message)}` : key;
                          })
                          .join(' | ') || String(act.blockers.length)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

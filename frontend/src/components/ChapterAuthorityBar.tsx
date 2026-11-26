import { useState } from 'react';
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
        `You have ${drafts.length} unsaved in-memory draft(s) bound to this chapter. Switching chapter preserves them in quarantined memory and clears rendered chapter data. Continue?`,
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
              <span className="mono muted">({activeMembership.chapter.reference} · {activeMembership.chapter.id})</span>
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              {activeMembership.duties.length > 0 ? (
                activeMembership.duties.map((d) => (
                  <span key={d} className="duty-badge">
                    {d}
                  </span>
                ))
              ) : (
                <span className="muted">Membership only (no operational duties)</span>
              )}
              {access && (
                <span className="muted" style={{ marginLeft: '0.4rem' }}>
                  Authority v{access.authority_version} · Setup v{access.setup_version} · Checked {formatManilaTime(access.checked_at)}
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
          Refresh Access
        </button>
        {access && (
          <button className="btn secondary" onClick={() => setShowAccessDetails((v) => !v)}>
            {showAccessDetails ? 'Hide Action Matrix' : `Action Matrix (${blockedActions.length} blocked)`}
          </button>
        )}
      </div>

      {showAccessDetails && access && (
        <div className="table-wrap" style={{ width: '100%', marginTop: '0.5rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>State</th>
                <th>Required Duties</th>
                <th>Setup Blockers</th>
              </tr>
            </thead>
            <tbody>
              {access.actions.map((act) => (
                <tr key={act.action}>
                  <td className="mono">{act.action}</td>
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
                      {act.state}
                    </span>
                  </td>
                  <td className="mono">{act.required_duties.join(', ')}</td>
                  <td>
                    {act.blockers.length > 0
                      ? act.blockers.map((b) => `${b.setting_key ?? b.code ?? 'blocker'}${b.message ? `: ${b.message}` : ''}`).join(' | ') ||
                        String(act.blockers.length)
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

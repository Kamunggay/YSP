// Validation seam only; current action availability is never execution authority.
import type { components } from '../generated/api.d.ts';

type Snapshot = components['schemas']['ChapterSnapshot'];

export function chapterNextAction(snapshot: Snapshot): string {
  switch (snapshot.chapter_state) {
    case 'no_authorized_memberships': return 'no_chapter_work';
    case 'selection_required': return 'select_chapter';
    case 'selected': return 'review_current_actions';
    default: { const unreachable: never = snapshot; return unreachable; }
  }
}

export function chapterScopeMatches(snapshot: Snapshot, requestedChapterId?: string): boolean {
  if (snapshot.chapter_state !== 'selected') return requestedChapterId === undefined;
  const { membership, context, session } = snapshot;
  return (requestedChapterId === undefined || context.chapter_id === requestedChapterId)
    && context.chapter_id === membership.chapter_id
    && context.chapter_name === membership.chapter_name
    && context.membership_id === membership.membership_id
    && context.user_id === session.user.id;
}

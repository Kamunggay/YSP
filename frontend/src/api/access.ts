import type { ChapterAccessSnapshot, ChapterActionAccess } from './types.ts';

export function getActionAccess(access: ChapterAccessSnapshot | null, action: string): ChapterActionAccess | null {
  if (!access) {
    return null;
  }
  return access.actions.find((a) => a.action === action) ?? null;
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
    if (entry.state === 'setup_blocked') {
      const detail = entry.blockers
        .map((b) => b.message ?? b.setting_key ?? b.code ?? 'setup required')
        .filter(Boolean)
        .join('; ');
      messages.push(`${action} setup blocked${detail ? ` (${detail})` : ''}`);
    } else {
      const duties = entry.required_duties.length > 0 ? ` — requires ${entry.required_duties.join(' or ')}` : '';
      messages.push(`${action} denied${duties}`);
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

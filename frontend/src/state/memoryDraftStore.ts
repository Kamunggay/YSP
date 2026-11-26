/**
 * Stage 1 Notifications/Authority Compliance (`contracts/stage1/notifications.md`):
 * Dirty unsaved edits NEVER touch localStorage or sessionStorage.
 * They stay strictly in RAM keyed by immutable `(userId, chapterId, formKey)`.
 * Signing out, losing authentication, or switching users purges buffered drafts.
 */
export interface MemoryDraftEntry {
  userId: string;
  chapterId: string;
  formKey: string;
  label: string;
  baseVersion: number | null;
  payloadJson: string;
  pendingActionKey: string | null;
  updatedAtIso: string;
}

class MemoryDraftStore {
  private readonly drafts = new Map<string, MemoryDraftEntry>();
  private readonly listeners = new Set<() => void>();

  private makeKey(userId: string, chapterId: string, formKey: string): string {
    return `${userId}::${chapterId}::${formKey}`;
  }

  saveDraft(entry: Omit<MemoryDraftEntry, 'updatedAtIso'>): void {
    const key = this.makeKey(entry.userId, entry.chapterId, entry.formKey);
    this.drafts.set(key, { ...entry, updatedAtIso: new Date().toISOString() });
    this.notify();
  }

  getDraft(userId: string, chapterId: string, formKey: string): MemoryDraftEntry | null {
    return this.drafts.get(this.makeKey(userId, chapterId, formKey)) ?? null;
  }

  clearDraft(userId: string, chapterId: string, formKey: string): void {
    if (this.drafts.delete(this.makeKey(userId, chapterId, formKey))) {
      this.notify();
    }
  }

  listForUserChapter(userId: string, chapterId: string): MemoryDraftEntry[] {
    const prefix = `${userId}::${chapterId}::`;
    const out: MemoryDraftEntry[] = [];
    for (const [k, v] of this.drafts.entries()) {
      if (k.startsWith(prefix)) {
        out.push(v);
      }
    }
    return out;
  }

  listAllForUser(userId: string): MemoryDraftEntry[] {
    const prefix = `${userId}::`;
    const out: MemoryDraftEntry[] = [];
    for (const [k, v] of this.drafts.entries()) {
      if (k.startsWith(prefix)) {
        out.push(v);
      }
    }
    return out;
  }

  purgeUser(userId: string): void {
    const prefix = `${userId}::`;
    let changed = false;
    for (const k of this.drafts.keys()) {
      if (k.startsWith(prefix)) {
        this.drafts.delete(k);
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
  }

  purgeAll(): void {
    if (this.drafts.size > 0) {
      this.drafts.clear();
      this.notify();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) {
      l();
    }
  }
}

export const memoryDraftStore = new MemoryDraftStore();

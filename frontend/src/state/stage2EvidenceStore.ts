import type { AllEvidencePurpose, Stage2EvidenceByteBinding } from '../api/stage2Types.ts';

export interface SessionEvidenceRecord {
  chapterId: string;
  purpose: AllEvidencePurpose;
  recordId: string;
  label: string;
  version: number;
  uploadedAt: string;
  binding: Stage2EvidenceByteBinding;
}

class Stage2EvidenceStore {
  private readonly records = new Map<string, SessionEvidenceRecord[]>();
  private readonly listeners = new Set<() => void>();

  list(chapterId: string, purpose?: AllEvidencePurpose): SessionEvidenceRecord[] {
    const items = this.records.get(chapterId) ?? [];
    if (!purpose) {
      return [...items];
    }
    return items.filter((item) => item.purpose === purpose);
  }

  record(entry: SessionEvidenceRecord): void {
    const current = this.records.get(entry.chapterId) ?? [];
    const next = [
      entry,
      ...current.filter((item) => item.binding.evidence_id !== entry.binding.evidence_id),
    ].slice(0, 100);
    this.records.set(entry.chapterId, next);
    this.notify();
  }

  clearChapter(chapterId: string): void {
    if (this.records.delete(chapterId)) {
      this.notify();
    }
  }

  clearAll(): void {
    if (this.records.size > 0) {
      this.records.clear();
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
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const stage2EvidenceStore = new Stage2EvidenceStore();

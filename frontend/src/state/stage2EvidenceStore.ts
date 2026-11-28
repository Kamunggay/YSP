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

export async function computeSha256Hex(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic 64-hex hash if subtle crypto is unavailable in an environment.
  const view = new Uint8Array(bytes);
  let acc = 2166136261;
  for (let i = 0; i < view.length; i += 1) {
    acc ^= view[i] ?? 0;
    acc = Math.imul(acc, 16777619);
  }
  return Math.abs(acc).toString(16).padStart(64, 'a').slice(0, 64);
}

import { useCallback, useEffect, useState } from 'react';
import { actionBlockReason, unwrapMutationData } from '../api/access.ts';
import { apiGet, apiGetText, apiMutate, buildQuery, newActionKey } from '../api/client.ts';
import type { ChapterAccessSnapshot } from '../api/types.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
import {
  emptyEvidenceBinding,
  toWireEvidenceBinding,
} from '../components/structuredInputHelpers.ts';
import { EvidenceBindingFields } from '../components/StructuredInputRows.tsx';
import { memoryDraftStore } from '../state/memoryDraftStore.ts';

interface OpeningRecord {
  id: string;
  reference?: string | null;
  state?: string;
  status?: string;
  revision?: number;
  material_version?: number;
  ipc_id?: string;
}

interface CatOption {
  id: string;
  code: string;
  material_version: number;
  description?: string;
  label?: string;
  name?: string;
  item_id?: string;
  unit_id?: string;
  quantity_scale?: number;
}

interface IpcTeamMemberInput {
  user_id: string;
  regular_custodian: boolean;
}

interface IpcPolicyBindingInput {
  setting_key: string;
  policy_id: string;
  version: string;
}

interface IpcLineInput {
  line_id: string;
  item_id: string;
  variant_id: string;
  variant_material_version: string;
  unit_id: string;
  unit_material_version: string;
  quantity_scale: string;
  historical_variant_label: string;
  location_id: string;
  location_material_version: string;
  regular_custodian_ids_csv: string;
  condition: 'usable' | 'damaged' | 'rejected';
  counted_quantity: string;
  unit_value: string;
  valuation_basis: string;
  provenance_reference: string;
  restriction_state: 'unrestricted' | 'bounded' | 'uninterpreted';
}

interface IpcCountEntryInput {
  ipc_line_id: string;
  quantity: string;
  condition: 'usable' | 'damaged' | 'rejected';
  notes: string;
}

interface RmLineInput {
  ipc_line_id: string;
  accepted_quantity: string;
  damaged_quantity: string;
  rejected_quantity: string;
  accepted_value: string;
  finding_reason: string;
}

type OpeningEndpoint =
  | 'createIpc'
  | 'replaceIpc'
  | 'saveCount'
  | 'submitIpc'
  | 'authorizeIpc'
  | 'createRm'
  | 'replaceRm'
  | 'inspectRm'
  | 'matchRm'
  | 'postRm';

interface OpeningBaselineWorkspaceProps {
  userId: string;
  chapterId: string;
  refreshSignal: number;
  chapterAccess: ChapterAccessSnapshot | null;
}

const OPENING_REQUIRED_ACTIONS: Record<OpeningEndpoint, string[]> = {
  createIpc: ['ipc.draft'],
  replaceIpc: ['ipc.draft'],
  saveCount: ['ipc.count'],
  submitIpc: ['ipc.draft'],
  authorizeIpc: ['ipc.authorize'],
  createRm: ['opening_rm.prepare'],
  replaceRm: ['opening_rm.prepare'],
  inspectRm: ['opening_rm.prepare'],
  matchRm: ['opening_rm.prepare', 'evidence.read'],
  postRm: ['opening_rm.post'],
};

function nowUtcMicro(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, '.000000Z');
}

function emptyIpcLine(): IpcLineInput {
  return {
    line_id: newActionKey(),
    item_id: '',
    variant_id: '',
    variant_material_version: '1',
    unit_id: '',
    unit_material_version: '1',
    quantity_scale: '0',
    historical_variant_label: '',
    location_id: '',
    location_material_version: '1',
    regular_custodian_ids_csv: '',
    condition: 'usable',
    counted_quantity: '',
    unit_value: '',
    valuation_basis: '',
    provenance_reference: '',
    restriction_state: 'unrestricted',
  };
}

export function OpeningBaselineWorkspace({ userId, chapterId, refreshSignal, chapterAccess }: OpeningBaselineWorkspaceProps) {
  const formKey = 'opening_baseline_editor';

  function readSavedDraft(): {
    selectedIpcId?: string;
    selectedRmId?: string;
    actionEndpoint?: OpeningEndpoint;
    cutoffAt?: string;
    notes?: string;
    reason?: string;
    inspectionNotes?: string;
    snapshotSha256?: string;
    acknowledgmentId?: string;
  } {
    const saved = memoryDraftStore.getDraft(userId, chapterId, formKey);
    if (!saved) {
      return {};
    }
    try {
      return JSON.parse(saved.payloadJson) as {
        selectedIpcId?: string;
        selectedRmId?: string;
        actionEndpoint?: OpeningEndpoint;
        cutoffAt?: string;
        notes?: string;
        reason?: string;
        inspectionNotes?: string;
        snapshotSha256?: string;
        acknowledgmentId?: string;
      };
    } catch {
      return {};
    }
  }

  const initialDraft = readSavedDraft();
  const [baseline, setBaseline] = useState<unknown>(null);
  const [ipcs, setIpcs] = useState<OpeningRecord[]>([]);
  const [rms, setRms] = useState<OpeningRecord[]>([]);
  const [selectedIpcId, setSelectedIpcId] = useState(initialDraft.selectedIpcId ?? '');
  const [selectedRmId, setSelectedRmId] = useState(initialDraft.selectedRmId ?? '');

  const [catItems, setCatItems] = useState<CatOption[]>([]);
  const [catVariants, setCatVariants] = useState<CatOption[]>([]);
  const [catUnits, setCatUnits] = useState<CatOption[]>([]);
  const [catLocations, setCatLocations] = useState<CatOption[]>([]);

  const [actionEndpoint, setActionEndpoint] = useState<OpeningEndpoint>(initialDraft.actionEndpoint ?? 'createIpc');
  const [expectedRevision, setExpectedRevision] = useState('1');
  const [materialVersion, setMaterialVersion] = useState('1');
  const [ipcMaterialVersion, setIpcMaterialVersion] = useState('1');
  const [reason, setReason] = useState(initialDraft.reason ?? '');

  // IPC material fields
  const [cutoffAt, setCutoffAt] = useState(initialDraft.cutoffAt ?? '');
  const [suspended, setSuspended] = useState(true);
  const [team, setTeam] = useState<IpcTeamMemberInput[]>([{ user_id: '', regular_custodian: false }]);
  const [policies, setPolicies] = useState<IpcPolicyBindingInput[]>([]);
  const [ipcLines, setIpcLines] = useState<IpcLineInput[]>([emptyIpcLine()]);
  const [notes, setNotes] = useState(initialDraft.notes ?? '');

  // Count / Submit / Authorize
  const [countedAt, setCountedAt] = useState(nowUtcMicro);
  const [countCompleted, setCountCompleted] = useState(true);
  const [signedAt, setSignedAt] = useState(nowUtcMicro);
  const [countEntries, setCountEntries] = useState<IpcCountEntryInput[]>([
    { ipc_line_id: '', quantity: '1', condition: 'usable', notes: '' },
  ]);
  const [authDuty, setAuthDuty] = useState<'CHAPTER_HEAD' | 'FINANCE'>('CHAPTER_HEAD');

  // RM fields
  const [rmLines, setRmLines] = useState<RmLineInput[]>([
    { ipc_line_id: '', accepted_quantity: '0', damaged_quantity: '0', rejected_quantity: '0', accepted_value: '0.00', finding_reason: '' },
  ]);
  const [inspectedAt, setInspectedAt] = useState(nowUtcMicro);
  const [techRepId, setTechRepId] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState(initialDraft.inspectionNotes ?? '');
  const [snapshotSha256, setSnapshotSha256] = useState(initialDraft.snapshotSha256 ?? '');
  const [acknowledgedAt, setAcknowledgedAt] = useState(nowUtcMicro);
  const [acknowledgmentId, setAcknowledgmentId] = useState(initialDraft.acknowledgmentId ?? '');
  const [evidenceBinding, setEvidenceBinding] = useState(emptyEvidenceBinding);

  const [exactRev, setExactRev] = useState('1');
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [detailJson, setDetailJson] = useState<unknown>(null);
  const [opName, setOpName] = useState('postOpeningRm');
  const [lookupKey, setLookupKey] = useState('');
  const [lookupOpId, setLookupOpId] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

  const opBlockReason = actionBlockReason(chapterAccess, ...OPENING_REQUIRED_ACTIONS[actionEndpoint]);

  function parkDraftInMemory() {
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey,
      label: `Opening (${actionEndpoint})`,
      baseVersion: Number.parseInt(expectedRevision, 10) || null,
      pendingActionKey: null,
      payloadJson: JSON.stringify({
        selectedIpcId,
        selectedRmId,
        actionEndpoint,
        cutoffAt,
        notes,
        reason,
        inspectionNotes,
        snapshotSha256,
        acknowledgmentId,
      }),
    });
    setStatusMessage('Opening draft inputs held in chapter-scoped RAM only.');
  }

  const loadAll = useCallback(async () => {
    const [baseRes, ipcRes, rmRes] = await Promise.all([
      apiGet<unknown>(`/api/v1/chapters/${chapterId}/opening-baseline`),
      apiGet<OpeningRecord[]>(`/api/v1/chapters/${chapterId}/ipcs?limit=25`),
      apiGet<OpeningRecord[]>(`/api/v1/chapters/${chapterId}/opening-rms?limit=25`),
    ]);
    setBaseline(baseRes.data);
    setIpcs(ipcRes.data);
    setRms(rmRes.data);
    if (!selectedIpcId && ipcRes.data[0]?.id) {
      setSelectedIpcId(ipcRes.data[0].id);
    }
    if (!selectedRmId && rmRes.data[0]?.id) {
      setSelectedRmId(rmRes.data[0].id);
    }
  }, [chapterId, selectedIpcId, selectedRmId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadAll();
        if (active) {
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [loadAll, refreshSignal]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [iRes, vRes, uRes, lRes] = await Promise.all([
          apiGet<CatOption[]>(`/api/v1/chapters/${chapterId}/catalogue/items?state=all&limit=100`),
          apiGet<CatOption[]>(`/api/v1/chapters/${chapterId}/catalogue/variants?state=all&limit=100`),
          apiGet<CatOption[]>(`/api/v1/chapters/${chapterId}/catalogue/units?state=all&limit=100`),
          apiGet<CatOption[]>(`/api/v1/chapters/${chapterId}/catalogue/locations?state=all&limit=100`),
        ]);
        if (active) {
          setCatItems(iRes.data);
          setCatVariants(vRes.data);
          setCatUnits(uRes.data);
          setCatLocations(lRes.data);
        }
      } catch {
        // user may lack catalogue.read; manual UUID fields still work
      }
    })();
    return () => {
      active = false;
    };
  }, [chapterId, refreshSignal]);

  function updateIpcLine(idx: number, patch: Partial<IpcLineInput>) {
    setIpcLines((prev) =>
      prev.map((row, i) => {
        if (i !== idx) {
          return row;
        }
        const next = { ...row, ...patch };
        if (patch.variant_id) {
          const v = catVariants.find((x) => x.id === patch.variant_id);
          if (v) {
            next.variant_material_version = String(v.material_version);
            if (v.item_id) {
              next.item_id = v.item_id;
            }
            if (v.unit_id) {
              next.unit_id = v.unit_id;
              const u = catUnits.find((ux) => ux.id === v.unit_id);
              if (u) {
                next.unit_material_version = String(u.material_version);
                next.quantity_scale = String(u.quantity_scale ?? v.quantity_scale ?? 0);
              }
            }
            if (!next.historical_variant_label && v.label) {
              next.historical_variant_label = v.label;
            }
          }
        }
        if (patch.location_id) {
          const loc = catLocations.find((l) => l.id === patch.location_id);
          if (loc) {
            next.location_material_version = String(loc.material_version);
          }
        }
        return next;
      }),
    );
  }

  function buildIpcMaterialPayload() {
    return {
      cutoff_at: cutoffAt.trim() || null,
      informal_movements_suspended: suspended,
      count_team: team
        .filter((t) => t.user_id.trim() !== '')
        .map((t) => ({ user_id: t.user_id.trim(), regular_custodian: t.regular_custodian })),
      policies: policies
        .filter((p) => p.policy_id.trim() !== '')
        .map((p) => ({ setting_key: p.setting_key, policy_id: p.policy_id.trim(), version: Number.parseInt(p.version, 10) || 1 })),
      lines: ipcLines.map((l) => ({
        line_id: l.line_id.trim(),
        item_id: l.item_id.trim(),
        variant_id: l.variant_id.trim(),
        variant_material_version: Number.parseInt(l.variant_material_version, 10) || 1,
        unit_id: l.unit_id.trim(),
        unit_material_version: Number.parseInt(l.unit_material_version, 10) || 1,
        quantity_scale: Number.parseInt(l.quantity_scale, 10) || 0,
        historical_variant_label: l.historical_variant_label.trim(),
        location_id: l.location_id.trim(),
        location_material_version: Number.parseInt(l.location_material_version, 10) || 1,
        regular_custodian_ids: l.regular_custodian_ids_csv
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        condition: l.condition,
        counted_quantity: l.counted_quantity.trim() || null,
        unit_value: l.unit_value.trim() || null,
        valuation_basis: l.valuation_basis.trim() || null,
        provenance_reference: l.provenance_reference.trim() || null,
        restrictions: {
          state: l.restriction_state,
          allowed_uses: [],
          event_ids: [],
          requesting_unit_ids: [],
          effective_from: null,
          effective_until: null,
          interpretation_id: null,
          source_condition_reference: null,
        },
      })),
      notes: notes.trim() || null,
    };
  }

  function buildRmMaterialPayload() {
    return {
      ipc_material_version: Number.parseInt(ipcMaterialVersion, 10) || 1,
      lines: rmLines.map((l) => ({
        ipc_line_id: l.ipc_line_id.trim(),
        accepted_quantity: l.accepted_quantity.trim() || null,
        damaged_quantity: l.damaged_quantity.trim() || null,
        rejected_quantity: l.rejected_quantity.trim() || null,
        accepted_value: l.accepted_value.trim() || null,
        finding_reason: l.finding_reason.trim() || null,
      })),
      notes: notes.trim() || null,
    };
  }

  function buildOpeningBody(): Record<string, unknown> {
    const rev = Number.parseInt(expectedRevision, 10) || 1;
    const matVer = Number.parseInt(materialVersion, 10) || 1;
    const ipcMatVer = Number.parseInt(ipcMaterialVersion, 10) || 1;

    switch (actionEndpoint) {
      case 'createIpc':
        return { material: buildIpcMaterialPayload() };
      case 'replaceIpc':
        return { expected_revision: rev, reason: reason.trim() || null, material: buildIpcMaterialPayload() };
      case 'saveCount':
        return {
          expected_revision: rev,
          material_version: matVer,
          counted_at: countedAt.trim() || null,
          completed: countCompleted,
          signed_at: countCompleted ? signedAt.trim() || null : null,
          entries: countEntries.map((e) => ({
            ipc_line_id: e.ipc_line_id.trim(),
            quantity: e.quantity.trim() || null,
            condition: e.condition,
            notes: e.notes.trim() || null,
          })),
        };
      case 'submitIpc':
        return { expected_revision: rev, material_version: matVer, signed_ipc: toWireEvidenceBinding(evidenceBinding) };
      case 'authorizeIpc':
        return { expected_revision: rev, material_version: matVer, duty: authDuty, signed_at: signedAt.trim() };
      case 'createRm':
        return { ipc_id: selectedIpcId.trim(), material: buildRmMaterialPayload() };
      case 'replaceRm':
        return { expected_revision: rev, reason: reason.trim() || null, material: buildRmMaterialPayload() };
      case 'inspectRm':
        return {
          expected_revision: rev,
          ipc_material_version: ipcMatVer,
          inspected_at: inspectedAt.trim(),
          technical_representative_id: techRepId.trim() || null,
          inspection_notes: inspectionNotes.trim(),
        };
      case 'matchRm':
        return {
          expected_revision: rev,
          material_version: matVer,
          snapshot_sha256: snapshotSha256.trim(),
          bytes: toWireEvidenceBinding(evidenceBinding),
          acknowledged_at: acknowledgedAt.trim(),
        };
      case 'postRm':
        return {
          expected_revision: rev,
          material_version: matVer,
          ipc_material_version: ipcMatVer,
          acknowledgment_id: acknowledgmentId.trim(),
        };
    }
  }

  async function runOpeningAction(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReplayed(false);
    setStatusMessage(null);

    const base = `/api/v1/chapters/${chapterId}`;
    const targetMap: Record<OpeningEndpoint, { method: 'POST' | 'PUT'; path: string }> = {
      createIpc: { method: 'POST', path: `${base}/ipcs` },
      replaceIpc: { method: 'PUT', path: `${base}/ipcs/${selectedIpcId}` },
      saveCount: { method: 'PUT', path: `${base}/ipcs/${selectedIpcId}/my-count` },
      submitIpc: { method: 'POST', path: `${base}/ipcs/${selectedIpcId}/submit` },
      authorizeIpc: { method: 'POST', path: `${base}/ipcs/${selectedIpcId}/authorizations` },
      createRm: { method: 'POST', path: `${base}/opening-rms` },
      replaceRm: { method: 'PUT', path: `${base}/opening-rms/${selectedRmId}` },
      inspectRm: { method: 'POST', path: `${base}/opening-rms/${selectedRmId}/inspection` },
      matchRm: { method: 'POST', path: `${base}/opening-rms/${selectedRmId}/evidence-match` },
      postRm: { method: 'POST', path: `${base}/opening-rms/${selectedRmId}/post` },
    };

    const target = targetMap[actionEndpoint];
    const key = newActionKey();
    try {
      const { result } = await apiMutate<Record<string, unknown>>(target.method, target.path, buildOpeningBody(), key);
      const { record, operationId } = unwrapMutationData<Record<string, unknown>>(result.data);
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      setReplayed(result.replayed);
      setDetailJson(result.data);
      setLookupKey(key);
      if (operationId) {
        setLookupOpId(operationId);
      }
      if (typeof record.id === 'string' && actionEndpoint === 'createIpc') {
        setSelectedIpcId(record.id);
      }
      if (typeof record.id === 'string' && actionEndpoint === 'createRm') {
        setSelectedRmId(record.id);
      }
      if (typeof record.revision === 'number') {
        setExpectedRevision(String(record.revision));
      }
      if (typeof record.material_version === 'number') {
        setMaterialVersion(String(record.material_version));
      }
      if (typeof record.snapshot_sha256 === 'string') {
        setSnapshotSha256(record.snapshot_sha256);
      }
      const ack =
        record.acknowledgment && typeof record.acknowledgment === 'object'
          ? (record.acknowledgment as Record<string, unknown>)
          : null;
      const ackId =
        ack && typeof ack.acknowledgment_id === 'string'
          ? ack.acknowledgment_id
          : ack && typeof ack.id === 'string'
            ? ack.id
            : undefined;
      if (ackId) {
        setAcknowledgmentId(ackId);
      }
      setStatusMessage(`${actionEndpoint} succeeded. Action key: ${key}`);
      await loadAll();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function loadOpeningRead(kind: 'ipc' | 'rm', mode: 'detail' | 'history' | 'related' | 'movements' | 'findings' | 'version' | 'print') {
    const id = kind === 'ipc' ? selectedIpcId : selectedRmId;
    if (!id) {
      return;
    }
    setError(null);
    const prefix = `/api/v1/chapters/${chapterId}/${kind === 'ipc' ? 'ipcs' : 'opening-rms'}/${id}`;
    try {
      if (mode === 'print') {
        const html = await apiGetText(`${prefix}/print`);
        setPrintHtml(html);
      } else {
        const suffix =
          mode === 'detail'
            ? ''
            : mode === 'version'
              ? `/versions/${Number.parseInt(exactRev, 10) || 1}`
              : mode === 'related'
                ? '/related'
                : `/${mode}?limit=25`;
        const res = await apiGet<unknown>(`${prefix}${suffix}`);
        setDetailJson(res.data);
      }
    } catch (err) {
      setError(err);
    }
  }

  async function lookupByKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiGet<unknown>(
        `/api/v1/chapters/${chapterId}/opening-actions/by-key${buildQuery({ operation_name: opName })}`,
        { 'X-Action-Key': lookupKey.trim() },
      );
      setDetailJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function lookupByOpId(e: React.FormEvent) {
    e.preventDefault();
    if (!lookupOpId.trim()) {
      return;
    }
    setError(null);
    try {
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/opening-actions/${lookupOpId.trim()}`);
      setDetailJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Opening Inventory (`Ticket 05` · IPC → Inspected RM Baseline)</h2>
          <button type="button" className="btn secondary" onClick={() => void loadAll()}>
            Refresh Opening State
          </button>
        </div>
        <OperationBanner error={error} statusMessage={statusMessage} replayed={replayed} onDismiss={() => setStatusMessage(null)} />

        <h4>Chapter Opening Baseline (`GET /opening-baseline`)</h4>
        <pre className="json-box">{JSON.stringify(baseline, null, 2)}</pre>

        <div className="grid-2">
          <div>
            <h4>IPCs ({ipcs.length})</h4>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="ipc-sel">Selected IPC</label>
              <select id="ipc-sel" value={selectedIpcId} onChange={(e) => setSelectedIpcId(e.target.value)}>
                <option value="">-- select IPC --</option>
                {ipcs.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.reference ?? i.id} ({i.state ?? i.status ?? '?'} r{i.revision ?? '?'} m{i.material_version ?? '?'})
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('ipc', 'detail')} disabled={!selectedIpcId}>
                Read
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('ipc', 'history')} disabled={!selectedIpcId}>
                History
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('ipc', 'related')} disabled={!selectedIpcId}>
                Related
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('ipc', 'version')} disabled={!selectedIpcId}>
                Revision #{exactRev}
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('ipc', 'print')} disabled={!selectedIpcId}>
                Print HTML
              </button>
            </div>
          </div>

          <div>
            <h4>Opening RMs ({rms.length})</h4>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="rm-sel">Selected Opening RM</label>
              <select id="rm-sel" value={selectedRmId} onChange={(e) => setSelectedRmId(e.target.value)}>
                <option value="">-- select RM --</option>
                {rms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reference ?? r.id} ({r.state ?? r.status ?? '?'} r{r.revision ?? '?'} m{r.material_version ?? '?'})
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('rm', 'detail')} disabled={!selectedRmId}>
                Read
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('rm', 'history')} disabled={!selectedRmId}>
                History
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('rm', 'related')} disabled={!selectedRmId}>
                Related
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('rm', 'movements')} disabled={!selectedRmId}>
                Movements
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('rm', 'findings')} disabled={!selectedRmId}>
                Findings
              </button>
              <button type="button" className="btn secondary" onClick={() => void loadOpeningRead('rm', 'print')} disabled={!selectedRmId}>
                Print HTML
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Execute Opening Transition (`X-Action-Key`)</h3>
          <form onSubmit={runOpeningAction}>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <div className="field">
                <label htmlFor="op-act">Operation</label>
                <select id="op-act" value={actionEndpoint} onChange={(e) => setActionEndpoint(e.target.value as OpeningEndpoint)}>
                  <option value="createIpc">POST /ipcs (createIpc)</option>
                  <option value="replaceIpc">PUT /ipcs/:id (replaceIpc)</option>
                  <option value="saveCount">PUT /ipcs/:id/my-count (saveMyIpcCount)</option>
                  <option value="submitIpc">POST /ipcs/:id/submit (submitIpc)</option>
                  <option value="authorizeIpc">POST /ipcs/:id/authorizations (authorizeIpc)</option>
                  <option value="createRm">POST /opening-rms (createOpeningRm)</option>
                  <option value="replaceRm">PUT /opening-rms/:id (replaceOpeningRm)</option>
                  <option value="inspectRm">POST /opening-rms/:id/inspection (inspectOpeningRm)</option>
                  <option value="matchRm">POST /opening-rms/:id/evidence-match (matchOpeningRmEvidence)</option>
                  <option value="postRm">POST /opening-rms/:id/post (postOpeningRm)</option>
                </select>
              </div>
              {actionEndpoint !== 'createIpc' && actionEndpoint !== 'createRm' && (
                <div className="field" style={{ maxWidth: '8rem' }}>
                  <label>expected_revision</label>
                  <input type="number" min={1} required value={expectedRevision} onChange={(e) => setExpectedRevision(e.target.value)} />
                </div>
              )}
              {(actionEndpoint === 'saveCount' ||
                actionEndpoint === 'submitIpc' ||
                actionEndpoint === 'authorizeIpc' ||
                actionEndpoint === 'matchRm' ||
                actionEndpoint === 'postRm') && (
                <div className="field" style={{ maxWidth: '8rem' }}>
                  <label>material_version</label>
                  <input type="number" min={1} required value={materialVersion} onChange={(e) => setMaterialVersion(e.target.value)} />
                </div>
              )}
              {(actionEndpoint === 'createRm' ||
                actionEndpoint === 'replaceRm' ||
                actionEndpoint === 'inspectRm' ||
                actionEndpoint === 'postRm') && (
                <div className="field" style={{ maxWidth: '8.5rem' }}>
                  <label>ipc_material_version</label>
                  <input type="number" min={1} required value={ipcMaterialVersion} onChange={(e) => setIpcMaterialVersion(e.target.value)} />
                </div>
              )}
            </div>

            {(actionEndpoint === 'replaceIpc' || actionEndpoint === 'replaceRm') && (
              <div className="field" style={{ marginBottom: '0.5rem' }}>
                <label>Replacement Reason</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}

            {(actionEndpoint === 'createIpc' || actionEndpoint === 'replaceIpc') && (
              <div>
                <div className="row" style={{ marginBottom: '0.5rem' }}>
                  <div className="field">
                    <label>cutoff_at (UTC microsecond or blank for null)</label>
                    <input value={cutoffAt} placeholder="2026-11-26T00:00:00.000000Z" onChange={(e) => setCutoffAt(e.target.value)} />
                  </div>
                  <label className="row" style={{ alignItems: 'center' }}>
                    <input type="checkbox" checked={suspended} onChange={(e) => setSuspended(e.target.checked)} />
                    <span>Informal movements suspended</span>
                  </label>
                </div>

                <div style={{ marginBottom: '0.5rem' }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <strong>Count Team</strong>
                    <button type="button" className="btn secondary" onClick={() => setTeam((p) => [...p, { user_id: '', regular_custodian: false }])}>
                      + Counter
                    </button>
                  </div>
                  {team.map((t, idx) => (
                    <div key={idx} className="row" style={{ marginBottom: '0.3rem' }}>
                      <div className="field">
                        <input
                          placeholder="counter user_id UUID"
                          value={t.user_id}
                          onChange={(e) => setTeam((p) => p.map((x, i) => (i === idx ? { ...x, user_id: e.target.value } : x)))}
                        />
                      </div>
                      <label className="row" style={{ alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={t.regular_custodian}
                          onChange={(e) => setTeam((p) => p.map((x, i) => (i === idx ? { ...x, regular_custodian: e.target.checked } : x)))}
                        />
                        <span>regular_custodian</span>
                      </label>
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: '0.5rem' }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <strong>Pinned Policies (optional in draft)</strong>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setPolicies((p) => [...p, { setting_key: 'ipc_authorization', policy_id: '', version: '1' }])}
                    >
                      + Policy Binding
                    </button>
                  </div>
                  {policies.map((p, idx) => (
                    <div key={idx} className="row" style={{ marginBottom: '0.3rem' }}>
                      <select
                        value={p.setting_key}
                        onChange={(e) => setPolicies((prev) => prev.map((x, i) => (i === idx ? { ...x, setting_key: e.target.value } : x)))}
                      >
                        <option value="ipc_authorization">ipc_authorization</option>
                        <option value="reference_series">reference_series</option>
                        <option value="valuation_rounding">valuation_rounding</option>
                        <option value="quantity_scale">quantity_scale</option>
                      </select>
                      <input
                        placeholder="policy_id UUID"
                        value={p.policy_id}
                        onChange={(e) => setPolicies((prev) => prev.map((x, i) => (i === idx ? { ...x, policy_id: e.target.value } : x)))}
                      />
                      <input
                        style={{ maxWidth: '5rem' }}
                        type="number"
                        min={1}
                        value={p.version}
                        onChange={(e) => setPolicies((prev) => prev.map((x, i) => (i === idx ? { ...x, version: e.target.value } : x)))}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom: '0.5rem' }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <strong>IPC Lines</strong>
                    <button type="button" className="btn secondary" onClick={() => setIpcLines((p) => [...p, emptyIpcLine()])}>
                      + IPC Line
                    </button>
                  </div>
                  {ipcLines.map((ln, idx) => (
                    <div key={idx} style={{ padding: '0.45rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.35rem', marginBottom: '0.4rem' }}>
                      <div className="row" style={{ marginBottom: '0.35rem' }}>
                        <div className="field">
                          <label>Variant</label>
                          {catVariants.length > 0 ? (
                            <select value={ln.variant_id} onChange={(e) => updateIpcLine(idx, { variant_id: e.target.value })}>
                              <option value="">-- pick variant --</option>
                              {catVariants.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.code} — {v.label} (v{v.material_version})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input value={ln.variant_id} onChange={(e) => updateIpcLine(idx, { variant_id: e.target.value })} />
                          )}
                        </div>
                        <div className="field">
                          <label>Item</label>
                          {catItems.length > 0 ? (
                            <select value={ln.item_id} onChange={(e) => updateIpcLine(idx, { item_id: e.target.value })}>
                              <option value="">-- pick item --</option>
                              {catItems.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.code} — {it.description}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input value={ln.item_id} onChange={(e) => updateIpcLine(idx, { item_id: e.target.value })} />
                          )}
                        </div>
                        <div className="field">
                          <label>Location</label>
                          {catLocations.length > 0 ? (
                            <select value={ln.location_id} onChange={(e) => updateIpcLine(idx, { location_id: e.target.value })}>
                              <option value="">-- pick location --</option>
                              {catLocations.map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.code} — {loc.name} (v{loc.material_version})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input value={ln.location_id} onChange={(e) => updateIpcLine(idx, { location_id: e.target.value })} />
                          )}
                        </div>
                      </div>
                      <div className="row" style={{ marginBottom: '0.35rem' }}>
                        <div className="field">
                          <label>line_id UUID</label>
                          <input required value={ln.line_id} onChange={(e) => updateIpcLine(idx, { line_id: e.target.value })} />
                        </div>
                        <div className="field">
                          <label>historical_variant_label</label>
                          <input required value={ln.historical_variant_label} onChange={(e) => updateIpcLine(idx, { historical_variant_label: e.target.value })} />
                        </div>
                        <div className="field">
                          <label>regular_custodian_ids (CSV UUIDs)</label>
                          <input required value={ln.regular_custodian_ids_csv} onChange={(e) => updateIpcLine(idx, { regular_custodian_ids_csv: e.target.value })} />
                        </div>
                      </div>
                      <div className="row">
                        <div className="field" style={{ maxWidth: '8rem' }}>
                          <label>condition</label>
                          <select
                            value={ln.condition}
                            onChange={(e) => updateIpcLine(idx, { condition: e.target.value as 'usable' | 'damaged' | 'rejected' })}
                          >
                            <option value="usable">usable</option>
                            <option value="damaged">damaged</option>
                            <option value="rejected">rejected</option>
                          </select>
                        </div>
                        <div className="field" style={{ maxWidth: '8rem' }}>
                          <label>counted_quantity</label>
                          <input value={ln.counted_quantity} placeholder="e.g. 15" onChange={(e) => updateIpcLine(idx, { counted_quantity: e.target.value })} />
                        </div>
                        <div className="field" style={{ maxWidth: '7rem' }}>
                          <label>unit_value (PHP)</label>
                          <input value={ln.unit_value} placeholder="25.00" onChange={(e) => updateIpcLine(idx, { unit_value: e.target.value })} />
                        </div>
                        <div className="field">
                          <label>valuation_basis</label>
                          <input value={ln.valuation_basis} onChange={(e) => updateIpcLine(idx, { valuation_basis: e.target.value })} />
                        </div>
                        <div className="field" style={{ maxWidth: '8rem' }}>
                          <label>restrictions.state</label>
                          <select
                            value={ln.restriction_state}
                            onChange={(e) => updateIpcLine(idx, { restriction_state: e.target.value as 'unrestricted' | 'bounded' | 'uninterpreted' })}
                          >
                            <option value="unrestricted">unrestricted</option>
                            <option value="bounded">bounded</option>
                            <option value="uninterpreted">uninterpreted</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="field" style={{ marginBottom: '0.5rem' }}>
                  <label>Notes (optional)</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            )}

            {actionEndpoint === 'saveCount' && (
              <div>
                <div className="row" style={{ marginBottom: '0.5rem' }}>
                  <div className="field">
                    <label>counted_at</label>
                    <input value={countedAt} onChange={(e) => setCountedAt(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>signed_at</label>
                    <input value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
                  </div>
                  <label className="row" style={{ alignItems: 'center' }}>
                    <input type="checkbox" checked={countCompleted} onChange={(e) => setCountCompleted(e.target.checked)} />
                    <span>completed</span>
                  </label>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <strong>Count Entries</strong>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setCountEntries((p) => [...p, { ipc_line_id: '', quantity: '1', condition: 'usable', notes: '' }])}
                  >
                    + Entry
                  </button>
                </div>
                {countEntries.map((ce, idx) => (
                  <div key={idx} className="row" style={{ marginBottom: '0.4rem' }}>
                    <div className="field">
                      <label>ipc_line_id</label>
                      <input
                        required
                        value={ce.ipc_line_id}
                        onChange={(e) => setCountEntries((p) => p.map((x, i) => (i === idx ? { ...x, ipc_line_id: e.target.value } : x)))}
                      />
                    </div>
                    <div className="field" style={{ maxWidth: '7rem' }}>
                      <label>quantity</label>
                      <input
                        value={ce.quantity}
                        onChange={(e) => setCountEntries((p) => p.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
                      />
                    </div>
                    <select
                      value={ce.condition}
                      onChange={(e) =>
                        setCountEntries((p) =>
                          p.map((x, i) => (i === idx ? { ...x, condition: e.target.value as 'usable' | 'damaged' | 'rejected' } : x)),
                        )
                      }
                    >
                      <option value="usable">usable</option>
                      <option value="damaged">damaged</option>
                      <option value="rejected">rejected</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            {(actionEndpoint === 'submitIpc' || actionEndpoint === 'matchRm') && (
              <>
                {actionEndpoint === 'matchRm' && (
                  <div className="row" style={{ marginBottom: '0.5rem' }}>
                    <div className="field">
                      <label>snapshot_sha256</label>
                      <input required value={snapshotSha256} onChange={(e) => setSnapshotSha256(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>acknowledged_at</label>
                      <input required value={acknowledgedAt} onChange={(e) => setAcknowledgedAt(e.target.value)} />
                    </div>
                  </div>
                )}
                <EvidenceBindingFields
                  label={actionEndpoint === 'submitIpc' ? 'signed_ipc Evidence Binding' : 'bytes Evidence Binding'}
                  value={evidenceBinding}
                  onChange={setEvidenceBinding}
                />
              </>
            )}

            {actionEndpoint === 'authorizeIpc' && (
              <div className="row" style={{ marginBottom: '0.5rem' }}>
                <div className="field">
                  <label>Authorization Duty</label>
                  <select value={authDuty} onChange={(e) => setAuthDuty(e.target.value as 'CHAPTER_HEAD' | 'FINANCE')}>
                    <option value="CHAPTER_HEAD">CHAPTER_HEAD</option>
                    <option value="FINANCE">FINANCE</option>
                  </select>
                </div>
                <div className="field">
                  <label>signed_at</label>
                  <input required value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
                </div>
              </div>
            )}

            {(actionEndpoint === 'createRm' || actionEndpoint === 'replaceRm') && (
              <div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <strong>Opening RM Inspection Lines</strong>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() =>
                      setRmLines((p) => [
                        ...p,
                        { ipc_line_id: '', accepted_quantity: '0', damaged_quantity: '0', rejected_quantity: '0', accepted_value: '0.00', finding_reason: '' },
                      ])
                    }
                  >
                    + RM Line
                  </button>
                </div>
                {rmLines.map((rl, idx) => (
                  <div key={idx} className="row" style={{ marginBottom: '0.4rem', padding: '0.4rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div className="field">
                      <label>ipc_line_id</label>
                      <input
                        required
                        value={rl.ipc_line_id}
                        onChange={(e) => setRmLines((p) => p.map((x, i) => (i === idx ? { ...x, ipc_line_id: e.target.value } : x)))}
                      />
                    </div>
                    <div className="field" style={{ maxWidth: '6.5rem' }}>
                      <label>accepted</label>
                      <input
                        value={rl.accepted_quantity}
                        onChange={(e) => setRmLines((p) => p.map((x, i) => (i === idx ? { ...x, accepted_quantity: e.target.value } : x)))}
                      />
                    </div>
                    <div className="field" style={{ maxWidth: '6.5rem' }}>
                      <label>damaged</label>
                      <input
                        value={rl.damaged_quantity}
                        onChange={(e) => setRmLines((p) => p.map((x, i) => (i === idx ? { ...x, damaged_quantity: e.target.value } : x)))}
                      />
                    </div>
                    <div className="field" style={{ maxWidth: '6.5rem' }}>
                      <label>rejected</label>
                      <input
                        value={rl.rejected_quantity}
                        onChange={(e) => setRmLines((p) => p.map((x, i) => (i === idx ? { ...x, rejected_quantity: e.target.value } : x)))}
                      />
                    </div>
                    <div className="field" style={{ maxWidth: '7rem' }}>
                      <label>accepted_value</label>
                      <input
                        value={rl.accepted_value}
                        onChange={(e) => setRmLines((p) => p.map((x, i) => (i === idx ? { ...x, accepted_value: e.target.value } : x)))}
                      />
                    </div>
                    <div className="field">
                      <label>finding_reason</label>
                      <input
                        value={rl.finding_reason}
                        onChange={(e) => setRmLines((p) => p.map((x, i) => (i === idx ? { ...x, finding_reason: e.target.value } : x)))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {actionEndpoint === 'inspectRm' && (
              <div className="row" style={{ marginBottom: '0.5rem' }}>
                <div className="field">
                  <label>inspected_at</label>
                  <input required value={inspectedAt} onChange={(e) => setInspectedAt(e.target.value)} />
                </div>
                <div className="field">
                  <label>technical_representative_id (optional)</label>
                  <input value={techRepId} onChange={(e) => setTechRepId(e.target.value)} />
                </div>
                <div className="field">
                  <label>inspection_notes</label>
                  <input required value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} />
                </div>
              </div>
            )}

            {actionEndpoint === 'postRm' && (
              <div className="field" style={{ marginBottom: '0.6rem' }}>
                <label>acknowledgment_id UUID</label>
                <input required value={acknowledgmentId} onChange={(e) => setAcknowledgmentId(e.target.value)} />
              </div>
            )}

            {opBlockReason && <div className="alert info">{opBlockReason}</div>}
            <div className="row">
              <button className="btn" type="submit" disabled={busy || opBlockReason !== null} title={opBlockReason ?? undefined}>
                Execute Opening Action
              </button>
              <button className="btn secondary" type="button" onClick={parkDraftInMemory}>
                Hold Draft in RAM
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h3>Opening Outcome Lookup, Exact Revision &amp; Inspection</h3>
          <div className="row" style={{ marginBottom: '0.5rem' }}>
            <div className="field" style={{ maxWidth: '8rem' }}>
              <label htmlFor="op-rev-n">Revision #</label>
              <input id="op-rev-n" type="number" min={1} value={exactRev} onChange={(e) => setExactRev(e.target.value)} />
            </div>
            <button type="button" className="btn secondary" disabled={!selectedRmId} onClick={() => void loadOpeningRead('rm', 'version')}>
              Read RM Revision
            </button>
          </div>
          <form onSubmit={lookupByKey}>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <div className="field">
                <label htmlFor="op-lkp-name">operation_name</label>
                <input id="op-lkp-name" value={opName} onChange={(e) => setOpName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="op-lkp-key">X-Action-Key UUID</label>
                <input id="op-lkp-key" value={lookupKey} onChange={(e) => setLookupKey(e.target.value)} required />
              </div>
              <button className="btn secondary" type="submit">
                Lookup by Key
              </button>
            </div>
          </form>
          <form onSubmit={lookupByOpId}>
            <div className="row" style={{ marginBottom: '0.65rem' }}>
              <div className="field">
                <label htmlFor="op-lkp-id">operation_id UUID</label>
                <input id="op-lkp-id" value={lookupOpId} onChange={(e) => setLookupOpId(e.target.value)} required />
              </div>
              <button className="btn secondary" type="submit">
                Read Operation ID
              </button>
            </div>
          </form>
          {detailJson !== null && <pre className="json-box">{JSON.stringify(detailJson, null, 2)}</pre>}
          {printHtml !== null && (
            <div style={{ marginTop: '0.65rem' }}>
              <h4>Printable Document Preview (sandboxed)</h4>
              <iframe title="Opening Print Preview" sandbox="" srcDoc={printHtml} style={{ width: '100%', height: '240px', border: '1px solid #cbd5e1' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiMutate, buildQuery, newActionKey } from '../api/client.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';
import { memoryDraftStore } from '../state/memoryDraftStore.ts';

type CatalogueEntity = 'items' | 'variants' | 'units' | 'locations';

interface CatalogueRecord {
  id: string;
  chapter_id: string;
  code: string;
  state: 'active' | 'retired';
  material_version: number;
  created_at: string;
  updated_at: string;
  description?: string;
  name?: string;
  label?: string;
  unit_id?: string;
  item_id?: string;
  quantity_kind?: string;
  quantity_scale?: number;
  quantity_identity_locked?: boolean;
  kind?: string;
  custodian_id?: string | null;
  settings?: unknown;
}

interface CatalogueWorkspaceProps {
  userId: string;
  chapterId: string;
  refreshSignal: number;
}

export function CatalogueWorkspace({ userId, chapterId, refreshSignal }: CatalogueWorkspaceProps) {
  const [entity, setEntity] = useState<CatalogueEntity>('items');
  const [stateFilter, setStateFilter] = useState<'active' | 'retired' | 'all'>('active');
  const [queryText, setQueryText] = useState('');
  const [rows, setRows] = useState<CatalogueRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogueRecord | null>(null);
  const [historyJson, setHistoryJson] = useState<unknown>(null);

  const formKey = `catalogue:${entity}`;

  function readSavedDraft(targetEntity: CatalogueEntity): Record<string, string> {
    const saved = memoryDraftStore.getDraft(userId, chapterId, `catalogue:${targetEntity}`);
    if (!saved) {
      return {};
    }
    try {
      return JSON.parse(saved.payloadJson) as Record<string, string>;
    } catch {
      return {};
    }
  }

  const initialDraft = readSavedDraft('items');
  const [code, setCode] = useState(initialDraft.code ?? '');
  const [titleField, setTitleField] = useState(initialDraft.titleField ?? '');
  const [parentItemId, setParentItemId] = useState(initialDraft.parentItemId ?? '');
  const [unitId, setUnitId] = useState(initialDraft.unitId ?? '');
  const [qtyKind, setQtyKind] = useState<'count' | 'weight' | 'volume' | 'length'>('count');
  const [qtyScale, setQtyScale] = useState('0');
  const [locKind, setLocKind] = useState('stockroom');
  const [custodianId, setCustodianId] = useState('');
  const [replaceState, setReplaceState] = useState<'active' | 'retired'>('active');
  const [reason, setReason] = useState(initialDraft.reason ?? '');

  const [opName, setOpName] = useState('createCatalogueItem');
  const [lookupKey, setLookupKey] = useState('');
  const [lookupOpId, setLookupOpId] = useState('');
  const [lookupVersion, setLookupVersion] = useState('1');
  const [lookupResult, setLookupResult] = useState<unknown>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

  function switchEntity(tab: CatalogueEntity) {
    setEntity(tab);
    setSelected(null);
    setHistoryJson(null);
    const d = readSavedDraft(tab);
    setCode(d.code ?? '');
    setTitleField(d.titleField ?? '');
    setParentItemId(d.parentItemId ?? '');
    setUnitId(d.unitId ?? '');
    setReason(d.reason ?? '');
  }

  const loadList = useCallback(
    async (cursor?: string | null) => {
      const qs = buildQuery({
        state: stateFilter,
        q: queryText.trim() || undefined,
        limit: 25,
        cursor: cursor ?? undefined,
      });
      const res = await apiGet<CatalogueRecord[]>(`/api/v1/chapters/${chapterId}/catalogue/${entity}${qs}`);
      setRows((prev) => (cursor ? [...prev, ...res.data] : res.data));
      setNextCursor(res.page?.next_cursor ?? null);
    },
    [chapterId, entity, stateFilter, queryText],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadList();
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
  }, [loadList, refreshSignal]);

  function parkDraftInMemory() {
    memoryDraftStore.saveDraft({
      userId,
      chapterId,
      formKey,
      label: `Catalogue ${entity}`,
      baseVersion: selected?.material_version ?? null,
      pendingActionKey: null,
      payloadJson: JSON.stringify({ code, titleField, parentItemId, unitId, reason }),
    });
    setStatusMessage('Unsaved form kept in chapter-scoped RAM only (cleared on sign-out).');
  }

  function startEdit(row: CatalogueRecord) {
    setSelected(row);
    setCode(row.code);
    setTitleField(row.description ?? row.label ?? row.name ?? '');
    setParentItemId(row.item_id ?? '');
    setUnitId(row.unit_id ?? '');
    setQtyScale(row.quantity_scale !== undefined ? String(row.quantity_scale) : '0');
    setLocKind(row.kind ?? 'stockroom');
    setCustodianId(row.custodian_id ?? '');
    setReplaceState(row.state);
    setReason('');
    setHistoryJson(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReplayed(false);
    setStatusMessage(null);
    const key = newActionKey();
    const isReplace = selected !== null;

    let body: Record<string, unknown>;
    if (entity === 'items') {
      body = isReplace
        ? { expected_material_version: selected.material_version, state: replaceState, description: titleField, unit_id: unitId, reason }
        : { code, description: titleField, unit_id: unitId, reason };
    } else if (entity === 'variants') {
      body = isReplace
        ? {
            expected_material_version: selected.material_version,
            state: replaceState,
            label: titleField,
            unit_id: unitId,
            quantity_scale: Number.parseInt(qtyScale, 10),
            reason,
          }
        : {
            code,
            item_id: parentItemId,
            label: titleField,
            unit_id: unitId,
            quantity_scale: Number.parseInt(qtyScale, 10),
            reason,
          };
    } else if (entity === 'units') {
      body = isReplace
        ? {
            expected_material_version: selected.material_version,
            state: replaceState,
            name: titleField,
            quantity_kind: qtyKind,
            quantity_scale: Number.parseInt(qtyScale, 10),
            reason,
          }
        : {
            code,
            name: titleField,
            quantity_kind: qtyKind,
            quantity_scale: Number.parseInt(qtyScale, 10),
            reason,
          };
    } else {
      body = isReplace
        ? {
            expected_material_version: selected.material_version,
            state: replaceState,
            name: titleField,
            kind: locKind,
            custodian_id: custodianId.trim() || null,
            reason,
          }
        : {
            code,
            name: titleField,
            kind: locKind,
            custodian_id: custodianId.trim() || null,
            reason,
          };
    }

    const url = isReplace
      ? `/api/v1/chapters/${chapterId}/catalogue/${entity}/${selected.id}`
      : `/api/v1/chapters/${chapterId}/catalogue/${entity}`;

    try {
      const { result } = await apiMutate<CatalogueRecord>(isReplace ? 'PUT' : 'POST', url, body, key);
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      setReplayed(result.replayed);
      setStatusMessage(`${isReplace ? 'Replaced' : 'Created'} ${entity} ${result.data.code} (v${result.data.material_version}). Key: ${key}`);
      setLookupKey(key);
      setSelected(null);
      setCode('');
      setTitleField('');
      setReason('');
      await loadList();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function inspectHistory(id: string) {
    setError(null);
    try {
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/catalogue/${entity}/${id}/history?limit=25`);
      setHistoryJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function inspectVersion(id: string, version: number) {
    setError(null);
    try {
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/catalogue/${entity}/${id}/versions/${version}`);
      setHistoryJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function lookupOperation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiGet<unknown>(
        `/api/v1/chapters/${chapterId}/catalogue/operations/by-key${buildQuery({
          action_key: lookupKey.trim(),
          operation_name: opName,
        })}`,
        { 'X-Action-Key': lookupKey.trim() },
      );
      setLookupResult(res.data);
    } catch (err) {
      setError(err);
    }
  }

  async function lookupOperationById(e: React.FormEvent) {
    e.preventDefault();
    if (!lookupOpId.trim()) {
      return;
    }
    setError(null);
    try {
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/catalogue/operations/${lookupOpId.trim()}`);
      setLookupResult(res.data);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Stage 1 Catalogue (`PUT` Versioned + Sticky Precision)</h2>
        <div className="tabs">
          {(['items', 'variants', 'units', 'locations'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`tab-btn ${entity === tab ? 'active' : ''}`}
              onClick={() => switchEntity(tab)}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        <OperationBanner error={error} statusMessage={statusMessage} replayed={replayed} onDismiss={() => setStatusMessage(null)} />

        <div className="row" style={{ marginBottom: '0.85rem' }}>
          <div className="field">
            <label htmlFor="cat-state">State filter</label>
            <select id="cat-state" value={stateFilter} onChange={(e) => setStateFilter(e.target.value as 'active' | 'retired' | 'all')}>
              <option value="active">active</option>
              <option value="retired">retired</option>
              <option value="all">all</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="cat-q">Prefix search (q)</label>
            <input id="cat-q" value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Code or label prefix" />
          </div>
          <button type="button" className="btn secondary" onClick={() => void loadList()}>
            Reload
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name / Description</th>
                <th>State</th>
                <th>Material v</th>
                <th>Details</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No {entity} records returned.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.code}</td>
                    <td>{r.description ?? r.label ?? r.name}</td>
                    <td>{r.state}</td>
                    <td>v{r.material_version}</td>
                    <td className="mono">
                      {r.id}
                      {r.quantity_scale !== undefined ? ` · scale=${r.quantity_scale}` : ''}
                      {r.quantity_identity_locked ? ' [LOCKED]' : ''}
                    </td>
                    <td>
                      <div className="row">
                        <button type="button" className="btn secondary" onClick={() => startEdit(r)}>
                          Replace (`PUT`)
                        </button>
                        <button type="button" className="btn secondary" onClick={() => void inspectHistory(r.id)}>
                          History
                        </button>
                        <button type="button" className="btn secondary" onClick={() => void inspectVersion(r.id, r.material_version)}>
                          Current Snapshot
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {nextCursor && (
          <div style={{ marginTop: '0.6rem' }}>
            <button type="button" className="btn secondary" onClick={() => void loadList(nextCursor)}>
              Load Next Page
            </button>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>{selected ? `Replace ${entity.slice(0, -1)} ${selected.code} (v${selected.material_version})` : `Create ${entity.slice(0, -1)}`}</h3>
          <form onSubmit={handleSubmit}>
            {!selected && (
              <div className="field" style={{ marginBottom: '0.6rem' }}>
                <label htmlFor="cat-code">Uppercase ASCII Code</label>
                <input id="cat-code" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </div>
            )}
            <div className="field" style={{ marginBottom: '0.6rem' }}>
              <label htmlFor="cat-title">{entity === 'items' ? 'Description' : entity === 'variants' ? 'Label' : 'Name'}</label>
              <input id="cat-title" required value={titleField} onChange={(e) => setTitleField(e.target.value)} />
            </div>
            {entity === 'variants' && !selected && (
              <div className="field" style={{ marginBottom: '0.6rem' }}>
                <label htmlFor="cat-item">Parent Item UUID</label>
                <input id="cat-item" required value={parentItemId} onChange={(e) => setParentItemId(e.target.value)} />
              </div>
            )}
            {(entity === 'items' || entity === 'variants') && (
              <div className="field" style={{ marginBottom: '0.6rem' }}>
                <label htmlFor="cat-unit">Unit UUID</label>
                <input id="cat-unit" required value={unitId} onChange={(e) => setUnitId(e.target.value)} />
              </div>
            )}
            {entity === 'units' && (
              <div className="field" style={{ marginBottom: '0.6rem' }}>
                <label htmlFor="cat-qkind">Quantity Kind</label>
                <select id="cat-qkind" value={qtyKind} onChange={(e) => setQtyKind(e.target.value as 'count' | 'weight' | 'volume' | 'length')}>
                  <option value="count">count</option>
                  <option value="weight">weight</option>
                  <option value="volume">volume</option>
                  <option value="length">length</option>
                </select>
              </div>
            )}
            {(entity === 'units' || entity === 'variants') && (
              <div className="field" style={{ marginBottom: '0.6rem' }}>
                <label htmlFor="cat-qscale">Quantity Scale (0..6)</label>
                <input id="cat-qscale" type="number" min={0} max={6} required value={qtyScale} onChange={(e) => setQtyScale(e.target.value)} />
              </div>
            )}
            {entity === 'locations' && (
              <>
                <div className="field" style={{ marginBottom: '0.6rem' }}>
                  <label htmlFor="cat-lkind">Location Kind</label>
                  <input id="cat-lkind" required value={locKind} onChange={(e) => setLocKind(e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: '0.6rem' }}>
                  <label htmlFor="cat-cust">Custodian UUID (optional)</label>
                  <input id="cat-cust" value={custodianId} onChange={(e) => setCustodianId(e.target.value)} />
                </div>
              </>
            )}
            {selected && (
              <div className="field" style={{ marginBottom: '0.6rem' }}>
                <label htmlFor="cat-rstate">Target State</label>
                <select id="cat-rstate" value={replaceState} onChange={(e) => setReplaceState(e.target.value as 'active' | 'retired')}>
                  <option value="active">active</option>
                  <option value="retired">retired</option>
                </select>
              </div>
            )}
            <div className="field" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="cat-reason">Audit Reason</label>
              <input id="cat-reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="row">
              <button className="btn" type="submit" disabled={busy}>
                {selected ? 'Submit PUT Replace' : 'Create (POST)'}
              </button>
              <button className="btn secondary" type="button" onClick={parkDraftInMemory}>
                Hold Draft in RAM
              </button>
              {selected && (
                <button className="btn secondary" type="button" onClick={() => setSelected(null)}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="card">
          <h3>Operation Outcome Lookup (`Ticket 03`)</h3>
          <form onSubmit={lookupOperation}>
            <div className="field" style={{ marginBottom: '0.6rem' }}>
              <label htmlFor="op-name">operation_name</label>
              <input id="op-name" required value={opName} onChange={(e) => setOpName(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: '0.6rem' }}>
              <label htmlFor="op-key">action_key (`X-Action-Key` UUID)</label>
              <input id="op-key" required value={lookupKey} onChange={(e) => setLookupKey(e.target.value)} />
            </div>
            <button className="btn secondary" type="submit">
              Lookup by Key
            </button>
          </form>
          <form onSubmit={lookupOperationById} style={{ marginTop: '0.65rem' }}>
            <div className="row">
              <div className="field">
                <label htmlFor="op-id">operation_id UUID</label>
                <input id="op-id" required value={lookupOpId} onChange={(e) => setLookupOpId(e.target.value)} />
              </div>
              <button className="btn secondary" type="submit">
                Lookup by Operation ID
              </button>
            </div>
          </form>
          {selected && (
            <div className="row" style={{ marginTop: '0.65rem' }}>
              <div className="field" style={{ maxWidth: '8rem' }}>
                <label htmlFor="cat-ver-n">Material Ver</label>
                <input id="cat-ver-n" type="number" min={1} value={lookupVersion} onChange={(e) => setLookupVersion(e.target.value)} />
              </div>
              <button
                type="button"
                className="btn secondary"
                onClick={() => void inspectVersion(selected.id, Number.parseInt(lookupVersion, 10) || selected.material_version)}
              >
                Read Exact Version
              </button>
            </div>
          )}
          {lookupResult !== null && <pre className="json-box">{JSON.stringify(lookupResult, null, 2)}</pre>}
          {historyJson !== null && (
            <>
              <h4 style={{ marginBottom: '0.3rem' }}>Version History / Snapshot</h4>
              <pre className="json-box">{JSON.stringify(historyJson, null, 2)}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

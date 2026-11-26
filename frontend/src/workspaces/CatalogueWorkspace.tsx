import { useCallback, useEffect, useState } from 'react';
import { actionBlockReason } from '../api/access.ts';
import { apiGet, apiMutate, buildQuery, newActionKey } from '../api/client.ts';
import type { ChapterAccessSnapshot } from '../api/types.ts';
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
  chapterAccess: ChapterAccessSnapshot | null;
  onBackToDashboard?: () => void;
}

export function CatalogueWorkspace({
  userId,
  chapterId,
  refreshSignal,
  chapterAccess,
  onBackToDashboard,
}: CatalogueWorkspaceProps) {
  const maintainReason = actionBlockReason(chapterAccess, 'catalogue.maintain');
  const historyReason = actionBlockReason(chapterAccess, 'history.read');
  const [entity, setEntity] = useState<CatalogueEntity>('items');
  const [viewTab, setViewTab] = useState<'records' | 'audit'>('records');
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
    setStatusMessage('Unsaved form changes saved as a temporary draft for this session (cleared when you sign out).');
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
      const { result } = await apiMutate<{ operation_id?: string; resource?: CatalogueRecord } | CatalogueRecord>(
        isReplace ? 'PUT' : 'POST',
        url,
        body,
        key,
      );
      const payload = result.data as { operation_id?: string; resource?: CatalogueRecord } & Partial<CatalogueRecord>;
      const record = payload.resource ?? (payload as CatalogueRecord);
      const opPrefix = isReplace ? 'replaceCatalogue' : 'createCatalogue';
      const opEntity = entity === 'items' ? 'Item' : entity === 'variants' ? 'Variant' : entity === 'units' ? 'Unit' : 'Location';
      memoryDraftStore.clearDraft(userId, chapterId, formKey);
      setReplayed(result.replayed);
      const entityNoun = entity === 'items' ? 'item' : entity === 'variants' ? 'item variant' : entity === 'units' ? 'unit' : 'location';
      setStatusMessage(`${isReplace ? 'Updated' : 'Added'} ${entityNoun} ${record.code} (rev. ${record.material_version}). Reference: ${key}`);
      setOpName(`${opPrefix}${opEntity}`);
      setLookupKey(key);
      if (payload.operation_id) {
        setLookupOpId(payload.operation_id);
      }
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

  async function inspectRecord(id: string) {
    setError(null);
    try {
      const res = await apiGet<unknown>(`/api/v1/chapters/${chapterId}/catalogue/${entity}/${id}`);
      setHistoryJson(res.data);
    } catch (err) {
      setError(err);
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

  const entityHeading =
    entity === 'items'
      ? 'Item'
      : entity === 'variants'
        ? 'Item Variant'
        : entity === 'units'
          ? 'Unit'
          : 'Location';

  return (
    <main className="p03-workspace-shell">
      <div className="p03-workspace-inner">
        <header className="p03-top-header surface-card">
          <div className="p03-header-search-row">
            <div className="p03-search-input-wrap">
              <svg
                className="p03-search-icon"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              <input
                id="cat-q"
                className="form-control p03-search-input"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Search catalogue by code or name..."
                aria-label="Search catalogue by code or name"
              />
            </div>

            <div className="p03-search-meta">
              <span className="p03-version-pill">{rows.length} Loaded</span>
              {queryText.trim().length > 0 && (
                <button
                  type="button"
                  className="p03-search-clear-btn"
                  onClick={() => setQueryText('')}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                className="p03-search-action-btn"
                disabled={busy}
                onClick={() => void loadList()}
              >
                {busy ? 'Loading...' : 'Reload'}
              </button>
            </div>
          </div>

          <div className="p03-header-nav-row">
            <div className="p03-header-left">
              <h1 className="p03-main-title">Item &amp; Location Catalogue</h1>
            </div>
            <div className="p03-header-controls">
              <div className="p03-filter-pill-bar" role="tablist" aria-label="Catalogue sections">
                {(['items', 'variants', 'units', 'locations'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={viewTab === 'records' && entity === tab}
                    className={`p03-filter-pill ${viewTab === 'records' && entity === tab ? 'is-active' : ''}`}
                    onClick={() => {
                      setViewTab('records');
                      switchEntity(tab);
                    }}
                  >
                    {tab === 'items' ? 'Items' : tab === 'variants' ? 'Variants' : tab === 'units' ? 'Units' : 'Locations'}
                  </button>
                ))}
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewTab === 'audit'}
                  className={`p03-filter-pill ${viewTab === 'audit' ? 'is-active' : ''}`}
                  onClick={() => setViewTab('audit')}
                >
                  History &amp; Lookup
                </button>
              </div>
              {onBackToDashboard && (
                <button
                  type="button"
                  className="btn-batcave-secondary p04-back-btn"
                  onClick={onBackToDashboard}
                >
                  ← Back to My Work
                </button>
              )}
            </div>
          </div>
        </header>

        <section className="p03-card surface-card form-stack" aria-label="Catalogue workspace summary">
          <div className="p03-card-header-row">
            <div>
              <h2 className="p03-section-title">{entityHeading} Overview</h2>
              <p className="form-card-subtitle">
                Manage chapter {entity} definitions, revisions, and lookup history.
              </p>
            </div>
            <div className="p03-chip-wrap">
              <span className="p03-version-pill">{rows.length} {entity}</span>
              <span className="p03-version-pill">Filter: {stateFilter}</span>
              {selected && <span className="p03-version-pill p03-mono-inline">Editing {selected.code}</span>}
            </div>
          </div>
          <OperationBanner
            error={error}
            statusMessage={statusMessage}
            replayed={replayed}
            onDismiss={() => setStatusMessage(null)}
          />
        </section>

        {viewTab === 'records' ? (
          <div className="p02-members-grid">
            <div className="p02-column-stack">
              <section className="p03-card surface-card form-stack" aria-label="Catalogue records list">
                <div className="p03-card-header-row">
                  <div>
                    <h2 className="p03-section-title">{entityHeading} Directory</h2>
                    <p className="form-card-subtitle">
                      {rows.length} {entity} record{rows.length === 1 ? '' : 's'} loaded
                    </p>
                  </div>
                  <div className="p03-filter-pill-bar" role="group" aria-label="Filter record status">
                    {(['active', 'retired', 'all'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`p03-filter-pill ${stateFilter === st ? 'is-active' : ''}`}
                        onClick={() => setStateFilter(st)}
                      >
                        {st === 'active' ? 'Active' : st === 'retired' ? 'Retired' : 'All'}
                      </button>
                    ))}
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p className="p03-muted-copy">
                    No {entity} records found. Add a new {entityHeading.toLowerCase()} using the form, or change the status filter above.
                  </p>
                ) : (
                  <div className="p03-history-list">
                    {rows.map((r) => (
                      <article
                        key={r.id}
                        className={`p03-history-card ${selected?.id === r.id ? 'is-search-match' : ''} ${
                          r.state === 'retired' ? 'is-superseded' : ''
                        }`}
                      >
                        <div className="p03-history-head">
                          <div className="p03-history-title-group">
                            <span className="p03-version-pill p03-id-pill p03-mono-inline">{r.code}</span>
                            <strong>{r.description ?? r.label ?? r.name}</strong>
                            <span className={`s02-status-tag ${r.state === 'active' ? 'is-ready' : 'is-uncertain'}`}>
                              {r.state}
                            </span>
                            <span className="p03-version-pill">rev. {r.material_version}</span>
                            {r.quantity_scale !== undefined && (
                              <span className="p03-version-pill">{r.quantity_scale} decimals</span>
                            )}
                            {r.quantity_identity_locked && (
                              <span className="s02-status-tag is-overdue">In Use</span>
                            )}
                          </div>
                        </div>

                        <div className="p02-compact-actions">
                          <div className="p02-compact-btn-group">
                            <button
                              type="button"
                              className="p02-compact-btn"
                              disabled={maintainReason !== null}
                              title={maintainReason ?? undefined}
                              onClick={() => startEdit(r)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="p02-compact-btn"
                              onClick={() => {
                                void inspectRecord(r.id);
                                setViewTab('audit');
                              }}
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              className="p02-compact-btn"
                              disabled={historyReason !== null}
                              title={historyReason ?? undefined}
                              onClick={() => {
                                void inspectHistory(r.id);
                                setViewTab('audit');
                              }}
                            >
                              History
                            </button>
                            <button
                              type="button"
                              className="p02-compact-btn"
                              disabled={historyReason !== null}
                              title={historyReason ?? undefined}
                              onClick={() => {
                                void inspectVersion(r.id, r.material_version);
                                setViewTab('audit');
                              }}
                            >
                              Snapshot
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {nextCursor && (
                  <button
                    type="button"
                    className="btn-batcave-secondary"
                    onClick={() => void loadList(nextCursor)}
                  >
                    Load Next Page
                  </button>
                )}
              </section>
            </div>

            <div className="p02-column-stack">
              <section className="p03-card surface-card form-stack" aria-label="Catalogue record editor">
                <h2 className="p03-section-title">
                  {selected ? `Edit ${selected.code} (rev. ${selected.material_version})` : `Add New ${entityHeading}`}
                </h2>

                {maintainReason && (
                  <div className="callout-banner is-warning">
                    <span className="callout-dot dot-warning" aria-hidden="true" />
                    <span>{maintainReason}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="form-stack">
                  {!selected && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="cat-code">
                        Short Code (Letters &amp; Numbers)
                      </label>
                      <input
                        id="cat-code"
                        className="form-control"
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" htmlFor="cat-title">
                      {entity === 'items' ? 'Description' : entity === 'variants' ? 'Label' : 'Name'}
                    </label>
                    <input
                      id="cat-title"
                      className="form-control"
                      required
                      value={titleField}
                      onChange={(e) => setTitleField(e.target.value)}
                    />
                  </div>

                  {entity === 'variants' && !selected && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="cat-item">
                        Parent Item Reference
                      </label>
                      <input
                        id="cat-item"
                        className="form-control"
                        required
                        value={parentItemId}
                        onChange={(e) => setParentItemId(e.target.value)}
                      />
                    </div>
                  )}

                  {(entity === 'items' || entity === 'variants') && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="cat-unit">
                        Unit of Measure Reference
                      </label>
                      <input
                        id="cat-unit"
                        className="form-control"
                        required
                        value={unitId}
                        onChange={(e) => setUnitId(e.target.value)}
                      />
                    </div>
                  )}

                  {entity === 'units' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="cat-qkind">
                        Measurement Type
                      </label>
                      <select
                        id="cat-qkind"
                        className="form-control"
                        value={qtyKind}
                        onChange={(e) => setQtyKind(e.target.value as 'count' | 'weight' | 'volume' | 'length')}
                      >
                        <option value="count">Count (pieces)</option>
                        <option value="weight">Weight</option>
                        <option value="volume">Volume</option>
                        <option value="length">Length</option>
                      </select>
                    </div>
                  )}

                  {(entity === 'units' || entity === 'variants') && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="cat-qscale">
                        Decimal Places (0–6)
                      </label>
                      <input
                        id="cat-qscale"
                        className="form-control"
                        type="number"
                        min={0}
                        max={6}
                        required
                        value={qtyScale}
                        onChange={(e) => setQtyScale(e.target.value)}
                      />
                    </div>
                  )}

                  {entity === 'locations' && (
                    <div className="p03-two-col">
                      <div className="form-group">
                        <label className="form-label" htmlFor="cat-lkind">
                          Location Type
                        </label>
                        <input
                          id="cat-lkind"
                          className="form-control"
                          required
                          value={locKind}
                          onChange={(e) => setLocKind(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="cat-cust">
                          Assigned Custodian (optional)
                        </label>
                        <input
                          id="cat-cust"
                          className="form-control"
                          value={custodianId}
                          onChange={(e) => setCustodianId(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {selected && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="cat-rstate">
                        Status
                      </label>
                      <select
                        id="cat-rstate"
                        className="form-control"
                        value={replaceState}
                        onChange={(e) => setReplaceState(e.target.value as 'active' | 'retired')}
                      >
                        <option value="active">Active</option>
                        <option value="retired">Retired</option>
                      </select>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" htmlFor="cat-reason">
                      Reason for Change
                    </label>
                    <input
                      id="cat-reason"
                      className="form-control"
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>

                  {selected ? (
                    <div className="form-stack">
                      <button
                        className="btn-batcave-primary"
                        type="submit"
                        disabled={busy || maintainReason !== null}
                        title={maintainReason ?? undefined}
                      >
                        Save Changes
                      </button>
                      <div className="p03-guard-buttons">
                        <button
                          className="btn-batcave-secondary"
                          type="button"
                          onClick={parkDraftInMemory}
                        >
                          Save Temporary Draft
                        </button>
                        <button
                          className="btn-batcave-secondary"
                          type="button"
                          onClick={() => setSelected(null)}
                        >
                          Cancel Edit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p03-guard-buttons">
                      <button
                        className="btn-batcave-primary"
                        type="submit"
                        disabled={busy || maintainReason !== null}
                        title={maintainReason ?? undefined}
                      >
                        Add Record
                      </button>
                      <button
                        className="btn-batcave-secondary"
                        type="button"
                        onClick={parkDraftInMemory}
                      >
                        Save Temporary Draft
                      </button>
                    </div>
                  )}
                </form>
              </section>
            </div>
          </div>
        ) : (
          <div className="p02-members-grid">
            <section className="p03-card surface-card form-stack" aria-label="Change submission lookup">
              <h2 className="p03-section-title">
                Check Submitted Change Status
              </h2>
              <form onSubmit={lookupOperation} className="form-stack">
                <div className="form-group">
                  <label className="form-label" htmlFor="op-name">
                    Change Type
                  </label>
                  <select
                    id="op-name"
                    className="form-control"
                    value={opName}
                    onChange={(e) => setOpName(e.target.value)}
                  >
                    <option value="createCatalogueItem">Add Item</option>
                    <option value="replaceCatalogueItem">Edit Item</option>
                    <option value="createCatalogueVariant">Add Item Variant</option>
                    <option value="replaceCatalogueVariant">Edit Item Variant</option>
                    <option value="createCatalogueUnit">Add Unit of Measure</option>
                    <option value="replaceCatalogueUnit">Edit Unit of Measure</option>
                    <option value="createCatalogueLocation">Add Storage Location</option>
                    <option value="replaceCatalogueLocation">Edit Storage Location</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="op-key">
                    Submission Reference
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="op-key"
                      className="form-control"
                      required
                      value={lookupKey}
                      onChange={(e) => setLookupKey(e.target.value)}
                    />
                    <button className="btn-batcave-secondary p03-shrink-btn" type="submit">
                      Check Reference
                    </button>
                  </div>
                </div>
              </form>

              <form onSubmit={lookupOperationById} className="form-stack">
                <div className="form-group">
                  <label className="form-label" htmlFor="op-id">
                    Change Record Reference
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="op-id"
                      className="form-control"
                      required
                      value={lookupOpId}
                      onChange={(e) => setLookupOpId(e.target.value)}
                    />
                    <button className="btn-batcave-secondary p03-shrink-btn" type="submit">
                      View Record
                    </button>
                  </div>
                </div>
              </form>

              {selected && (
                <div className="form-group">
                  <label className="form-label" htmlFor="cat-ver-n">
                    Read Revision for {selected.code}
                  </label>
                  <div className="p03-input-action-row">
                    <input
                      id="cat-ver-n"
                      className="form-control"
                      type="number"
                      min={1}
                      value={lookupVersion}
                      onChange={(e) => setLookupVersion(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-batcave-secondary p03-shrink-btn"
                      onClick={() =>
                        void inspectVersion(selected.id, Number.parseInt(lookupVersion, 10) || selected.material_version)
                      }
                    >
                      Read Version
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="p03-card surface-card form-stack" aria-label="Change inspection output">
              <h2 className="p03-section-title">
                Record History &amp; Lookup Output
              </h2>
              {lookupResult === null && historyJson === null ? (
                <p className="p03-muted-copy">
                  No inspection selected. Choose Details, History, or Snapshot on any record card, or check a submission reference on the left.
                </p>
              ) : (
                <div className="form-stack">
                  {lookupResult !== null && <pre className="json-box">{JSON.stringify(lookupResult, null, 2)}</pre>}
                  {historyJson !== null && <pre className="json-box">{JSON.stringify(historyJson, null, 2)}</pre>}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

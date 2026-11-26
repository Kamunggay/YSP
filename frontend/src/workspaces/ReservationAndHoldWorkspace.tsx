import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiMutate, buildQuery, newActionKey } from '../api/client.ts';
import { OperationBanner } from '../components/OperationBanner.tsx';

interface StockHoldRecord {
  id: string;
  status: string;
  version: number;
  material_version: number;
  reason_code: string;
  reason: string;
}

interface ReservationRecord {
  id: string;
  status: string;
  version: number;
  material_version: number;
  active_quantity: string;
  blocked_quantity: string;
}

interface ReservationAndHoldWorkspaceProps {
  chapterId: string;
  refreshSignal: number;
}

export function ReservationAndHoldWorkspace({ chapterId, refreshSignal }: ReservationAndHoldWorkspaceProps) {
  const [rfId, setRfId] = useState('');
  const [prepId, setPrepId] = useState('');
  const [reservationId, setReservationId] = useState('');
  const [holdId, setHoldId] = useState('');

  const [reviewJson, setReviewJson] = useState<unknown>(null);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [holds, setHolds] = useState<StockHoldRecord[]>([]);
  const [bodyJson, setBodyJson] = useState('{}');
  const [opKind, setOpKind] = useState<'prepare' | 'commit' | 'release' | 'reallocate' | 'placeHold' | 'proposeClear' | 'clearHold'>('prepare');
  const [lookupKey, setLookupKey] = useState('');
  const [resultJson, setResultJson] = useState<unknown>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [replayed, setReplayed] = useState(false);

  const loadHolds = useCallback(async () => {
    const res = await apiGet<StockHoldRecord[]>(`/api/v1/chapters/${chapterId}/stock-holds?limit=25`);
    setHolds(res.data);
    if (!holdId && res.data[0]?.id) {
      setHoldId(res.data[0].id);
    }
  }, [chapterId, holdId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadHolds();
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
  }, [loadHolds, refreshSignal]);

  async function loadRfAllocations() {
    if (!rfId.trim()) {
      return;
    }
    setError(null);
    try {
      const [rev, resv] = await Promise.all([
        apiGet<unknown>(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/allocation-review`),
        apiGet<ReservationRecord[]>(`/api/v1/chapters/${chapterId}/internal-rfs/${rfId.trim()}/reservations?limit=25`),
      ]);
      setReviewJson(rev.data);
      setReservations(resv.data);
      if (!reservationId && resv.data[0]?.id) {
        setReservationId(resv.data[0].id);
      }
    } catch (err) {
      setError(err);
    }
  }

  async function executeAction(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReplayed(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyJson);
    } catch {
      setBusy(false);
      setError(new Error('Body must be valid JSON.'));
      return;
    }

    const base = `/api/v1/chapters/${chapterId}`;
    const targetMap: Record<typeof opKind, { method: 'POST' | 'PUT'; path: string }> = {
      prepare: { method: 'POST', path: `${base}/internal-rfs/${rfId.trim()}/reservation-preparations` },
      commit: { method: 'POST', path: `${base}/internal-rfs/${rfId.trim()}/reservation-preparations/${prepId.trim()}/commit` },
      release: { method: 'POST', path: `${base}/internal-rfs/${rfId.trim()}/reservations/${reservationId.trim()}/release` },
      reallocate: { method: 'POST', path: `${base}/internal-rfs/${rfId.trim()}/reservations/${reservationId.trim()}/reallocate` },
      placeHold: { method: 'POST', path: `${base}/stock-holds` },
      proposeClear: { method: 'PUT', path: `${base}/stock-holds/${holdId.trim()}/clearance-proposal` },
      clearHold: { method: 'POST', path: `${base}/stock-holds/${holdId.trim()}/clear` },
    };

    const target = targetMap[opKind];
    const key = newActionKey();
    try {
      const { result } = await apiMutate<Record<string, unknown>>(target.method, target.path, parsed, key);
      setReplayed(result.replayed);
      setResultJson(result.data);
      setLookupKey(key);
      if (opKind === 'prepare' && typeof result.data.preparation_id === 'string') {
        setPrepId(result.data.preparation_id);
      }
      setStatusMessage(`${opKind} executed cleanly. Key: ${key}`);
      await loadHolds();
      if (rfId.trim()) {
        await loadRfAllocations();
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function lookupByKey(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiGet<unknown>(
        `/api/v1/chapters/${chapterId}/reservation-operations/by-key${buildQuery({ action_key: lookupKey.trim() })}`,
      );
      setResultJson(res.data);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Two-Step Reservations &amp; HTTP Stock Holds (`Ticket 07`)</h2>
        <OperationBanner error={error} statusMessage={statusMessage} replayed={replayed} onDismiss={() => setStatusMessage(null)} />

        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <div className="field">
            <label htmlFor="res-rf">rf_id UUID</label>
            <input id="res-rf" value={rfId} onChange={(e) => setRfId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="res-prep">preparation_id UUID</label>
            <input id="res-prep" value={prepId} onChange={(e) => setPrepId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="res-id">reservation_id UUID</label>
            <input id="res-id" value={reservationId} onChange={(e) => setReservationId(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="hold-id">hold_id UUID</label>
            <input id="hold-id" value={holdId} onChange={(e) => setHoldId(e.target.value)} />
          </div>
          <button type="button" className="btn secondary" onClick={() => void loadRfAllocations()} disabled={!rfId.trim()}>
            Load RF Allocation Review
          </button>
          <button type="button" className="btn secondary" onClick={() => void loadHolds()}>
            Reload Holds
          </button>
        </div>

        <div className="grid-2">
          <div>
            <h4>RF Reservations ({reservations.length})</h4>
            <pre className="json-box">{JSON.stringify({ review: reviewJson, reservations }, null, 2)}</pre>
          </div>
          <div>
            <h4>Chapter Stock Holds ({holds.length})</h4>
            <pre className="json-box">{JSON.stringify(holds, null, 2)}</pre>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Execute Reservation or Stock Hold Action (`X-Action-Key`)</h3>
          <form onSubmit={executeAction}>
            <div className="field" style={{ marginBottom: '0.5rem' }}>
              <label htmlFor="rh-op">Operation</label>
              <select id="rh-op" value={opKind} onChange={(e) => setOpKind(e.target.value as typeof opKind)}>
                <option value="prepare">1. POST Prepare Reservation</option>
                <option value="commit">2. POST Commit Prepared Reservation</option>
                <option value="release">POST Release Reservation Ranges</option>
                <option value="reallocate">POST Reallocate Reservation</option>
                <option value="placeHold">POST Place Stock Hold</option>
                <option value="proposeClear">PUT Propose Hold Clearance (Signatories)</option>
                <option value="clearHold">POST Clear Hold (matches_paper: true)</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: '0.65rem' }}>
              <label htmlFor="rh-json">Canonical JSON Body</label>
              <textarea id="rh-json" rows={8} className="mono" value={bodyJson} onChange={(e) => setBodyJson(e.target.value)} />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              Run Action
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Reservation / Hold Outcome Recovery</h3>
          <form onSubmit={lookupByKey}>
            <div className="row" style={{ marginBottom: '0.65rem' }}>
              <div className="field">
                <label htmlFor="rh-lkp">X-Action-Key UUID</label>
                <input id="rh-lkp" required value={lookupKey} onChange={(e) => setLookupKey(e.target.value)} />
              </div>
              <button className="btn secondary" type="submit">
                Lookup
              </button>
            </div>
          </form>
          {resultJson !== null && <pre className="json-box">{JSON.stringify(resultJson, null, 2)}</pre>}
        </div>
      </div>
    </div>
  );
}

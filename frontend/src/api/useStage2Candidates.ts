import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actionBlockReason } from './access.ts';
import { ContractApiError } from './client.ts';
import { fetchAllAuthorizedPages } from './pagination.ts';
import type { SearchablePickerOption } from '../components/SearchableRecordPicker.tsx';
import type { ChapterAccessSnapshot } from './types.ts';

export interface CandidateCatalogueItem {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
}

export interface CandidateCatalogueVariant {
  id: string;
  item_id: string;
  code: string;
  label: string;
  default_unit_id?: string | null;
  is_active?: boolean;
}

export interface CandidateCatalogueUnit {
  id: string;
  code: string;
  label: string;
  quantity_scale?: number;
  is_active?: boolean;
}

export interface CandidateLocation {
  id: string;
  code?: string;
  name: string;
  location_type?: string;
  is_active?: boolean;
}

export interface CandidateInternalRf {
  id: string;
  reference: string | null;
  status: string;
  material_version: number;
  requesting_unit_id?: string | null;
  event_id?: string | null;
  needed_at?: string | null;
  approved_at?: string | null;
  lines?: Array<{
    id: string;
    variant_id: string;
    unit_id: string;
    approved_quantity?: string;
    issued_quantity?: string;
    canceled_quantity?: string;
    unreserved_outstanding_quantity?: string;
  }>;
}

export interface CandidateStockLot {
  id: string;
  variant_id: string;
  unit_id: string;
  location_id: string;
  source_kind: string;
  source_reference?: string | null;
  condition: string;
  custody?: string;
  available_quantity: string;
  on_hand_quantity?: string;
  restriction_state?: string;
}

export interface Stage2CandidatesState {
  loading: boolean;
  error: unknown;
  items: CandidateCatalogueItem[];
  variants: CandidateCatalogueVariant[];
  units: CandidateCatalogueUnit[];
  locations: CandidateLocation[];
  rfs: CandidateInternalRf[];
  lots: CandidateStockLot[];
  itemOptions: Array<SearchablePickerOption<CandidateCatalogueItem>>;
  variantOptions: Array<SearchablePickerOption<CandidateCatalogueVariant>>;
  unitOptions: Array<SearchablePickerOption<CandidateCatalogueUnit>>;
  locationOptions: Array<SearchablePickerOption<CandidateLocation>>;
  rfOptions: Array<SearchablePickerOption<CandidateInternalRf>>;
  lotOptions: Array<SearchablePickerOption<CandidateStockLot>>;
  requestingUnitOptions: Array<SearchablePickerOption<string>>;
  eventOptions: Array<SearchablePickerOption<string>>;
  representativeOptions: Array<SearchablePickerOption<string>>;
  describeVariant: (variantId: string) => string;
  describeUnit: (unitId: string) => string;
  describeLocation: (locationId: string) => string;
  describeRf: (rfId: string | null | undefined) => string;
  refresh: () => Promise<void>;
}

export function useStage2Candidates(
  chapterId: string,
  refreshSignal: number,
  chapterAccess: ChapterAccessSnapshot | null,
): Stage2CandidatesState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [items, setItems] = useState<CandidateCatalogueItem[]>([]);
  const [variants, setVariants] = useState<CandidateCatalogueVariant[]>([]);
  const [units, setUnits] = useState<CandidateCatalogueUnit[]>([]);
  const [locations, setLocations] = useState<CandidateLocation[]>([]);
  const [rfs, setRfs] = useState<CandidateInternalRf[]>([]);
  const [lots, setLots] = useState<CandidateStockLot[]>([]);
  const generationRef = useRef(0);
  const activeChapterRef = useRef(chapterId);
  useEffect(() => {
    activeChapterRef.current = chapterId;
  }, [chapterId]);

  const canReadCatalogue = !actionBlockReason(chapterAccess, 'catalogue.read');
  const canReadRf = !actionBlockReason(chapterAccess, 'rf.read');
  const canReadStock = !actionBlockReason(chapterAccess, 'stock.read');

  useEffect(() => {
    // Clear previous chapter projections immediately when chapter changes.
    generationRef.current += 1;
    setItems([]);
    setVariants([]);
    setUnits([]);
    setLocations([]);
    setRfs([]);
    setLots([]);
    setError(null);
  }, [chapterId]);

  const loadCandidates = useCallback(async () => {
    if (!chapterId) {
      return;
    }
    const targetChapter = chapterId;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setLoading(true);
    setError(null);

    const guard = () =>
      activeChapterRef.current === targetChapter && generationRef.current === generation;

    async function fetchAuthorized<T>(path: string, permitted: boolean): Promise<T[]> {
      if (!permitted) {
        return [];
      }
      try {
        return await fetchAllAuthorizedPages<T>(path, { shouldContinue: guard });
      } catch (err) {
        // Optional enrichment resources for a partial-duty officer (e.g. rf.read vs po.read)
        if (err instanceof ContractApiError && err.status === 403) {
          return [];
        }
        throw err;
      }
    }

    try {
      const [itemRows, variantRows, unitRows, locRows, rfRows, lotRows] = await Promise.all([
        fetchAuthorized<CandidateCatalogueItem>(
          `/api/v1/chapters/${targetChapter}/catalogue/items?state=all`,
          canReadCatalogue,
        ),
        fetchAuthorized<CandidateCatalogueVariant>(
          `/api/v1/chapters/${targetChapter}/catalogue/variants?state=all`,
          canReadCatalogue,
        ),
        fetchAuthorized<CandidateCatalogueUnit>(
          `/api/v1/chapters/${targetChapter}/catalogue/units?state=all`,
          canReadCatalogue,
        ),
        fetchAuthorized<CandidateLocation>(
          `/api/v1/chapters/${targetChapter}/catalogue/locations?state=all`,
          canReadCatalogue,
        ),
        fetchAuthorized<CandidateInternalRf>(
          `/api/v1/chapters/${targetChapter}/internal-rfs`,
          canReadRf,
        ),
        fetchAuthorized<CandidateStockLot>(
          `/api/v1/chapters/${targetChapter}/stock/lots`,
          canReadStock,
        ),
      ]);

      if (!guard()) {
        return;
      }
      setItems(itemRows);
      setVariants(variantRows);
      setUnits(unitRows);
      setLocations(locRows);
      setRfs(rfRows);
      setLots(lotRows);
    } catch (err) {
      if (guard()) {
        setError(err);
      }
    } finally {
      if (guard()) {
        setLoading(false);
      }
    }
  }, [chapterId, canReadCatalogue, canReadRf, canReadStock]);

  useEffect(() => {
    void loadCandidates();
  }, [chapterId, loadCandidates]);

  useEffect(() => {
    if (refreshSignal > 0) {
      void loadCandidates();
    }
  }, [loadCandidates, refreshSignal]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const variantMap = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const rfMap = useMemo(() => new Map(rfs.map((r) => [r.id, r])), [rfs]);

  const itemOptions = useMemo<Array<SearchablePickerOption<CandidateCatalogueItem>>>(
    () =>
      items.map((i) => ({
        id: i.id,
        primaryLabel: `${i.code} — ${i.name}`,
        badge: i.is_active === false ? 'Inactive' : 'Active',
        badgeTone: i.is_active === false ? 'warning' : 'neutral',
        meta: i,
      })),
    [items],
  );

  const variantOptions = useMemo<Array<SearchablePickerOption<CandidateCatalogueVariant>>>(
    () =>
      variants.map((v) => {
        const parent = itemMap.get(v.item_id);
        return {
          id: v.id,
          primaryLabel: `${v.code} — ${v.label}`,
          secondaryLabel: parent ? `Item: ${parent.code} (${parent.name})` : undefined,
          badge: v.is_active === false ? 'Inactive' : 'Variant',
          badgeTone: v.is_active === false ? 'warning' : 'neutral',
          searchText: `${v.code} ${v.label} ${parent?.code ?? ''} ${parent?.name ?? ''}`,
          meta: v,
        };
      }),
    [itemMap, variants],
  );

  const unitOptions = useMemo<Array<SearchablePickerOption<CandidateCatalogueUnit>>>(
    () =>
      units.map((u) => ({
        id: u.id,
        primaryLabel: `${u.code} — ${u.label}`,
        badge: `Scale ${u.quantity_scale ?? 0}`,
        meta: u,
      })),
    [units],
  );

  const locationOptions = useMemo<Array<SearchablePickerOption<CandidateLocation>>>(
    () =>
      locations.map((l) => ({
        id: l.id,
        primaryLabel: l.code ? `${l.code} — ${l.name}` : l.name,
        secondaryLabel: l.location_type ? `Type: ${l.location_type}` : undefined,
        badge: l.is_active === false ? 'Inactive' : 'Location',
        meta: l,
      })),
    [locations],
  );

  const rfOptions = useMemo<Array<SearchablePickerOption<CandidateInternalRf>>>(
    () =>
      rfs.map((rf) => ({
        id: rf.id,
        primaryLabel: rf.reference ?? `Draft RF (${rf.id.slice(0, 8)}…)`,
        secondaryLabel: rf.requesting_unit_id
          ? `Unit ${rf.requesting_unit_id.slice(0, 8)}… · Rev m${rf.material_version}`
          : `Rev m${rf.material_version}`,
        badge: rf.status.replaceAll('_', ' '),
        badgeTone: rf.status === 'approved' ? 'ready' : rf.status === 'canceled' ? 'danger' : 'neutral',
        meta: rf,
      })),
    [rfs],
  );

  const lotOptions = useMemo<Array<SearchablePickerOption<CandidateStockLot>>>(
    () =>
      lots.map((lot) => {
        const v = variantMap.get(lot.variant_id);
        const l = locationMap.get(lot.location_id);
        const u = unitMap.get(lot.unit_id);
        return {
          id: lot.id,
          primaryLabel: `${lot.source_reference ?? lot.id.slice(0, 8)} · ${v?.code ?? lot.variant_id.slice(0, 8)}`,
          secondaryLabel: `${l?.name ?? lot.location_id.slice(0, 8)} · Free ${lot.available_quantity} ${u?.code ?? ''}`,
          badge: `${lot.condition}${lot.restriction_state ? ` (${lot.restriction_state})` : ''}`,
          badgeTone:
            lot.restriction_state === 'uninterpreted'
              ? 'danger'
              : lot.restriction_state === 'bounded'
                ? 'warning'
                : 'ready',
          meta: lot,
        };
      }),
    [locationMap, lots, unitMap, variantMap],
  );

  const requestingUnitOptions = useMemo<Array<SearchablePickerOption<string>>>(() => {
    const ids = new Set<string>();
    for (const rf of rfs) {
      if (rf.requesting_unit_id) {
        ids.add(rf.requesting_unit_id);
      }
    }
    return Array.from(ids).map((id) => ({
      id,
      primaryLabel: `Requesting Unit (${id.slice(0, 8)}…)`,
      secondaryLabel: `Derived from chapter RFs · ${id}`,
      meta: id,
    }));
  }, [rfs]);

  const eventOptions = useMemo<Array<SearchablePickerOption<string>>>(() => {
    const ids = new Set<string>();
    for (const rf of rfs) {
      if (rf.event_id) {
        ids.add(rf.event_id);
      }
    }
    return Array.from(ids).map((id) => ({
      id,
      primaryLabel: `Chapter Event (${id.slice(0, 8)}…)`,
      secondaryLabel: `Derived from chapter RFs · ${id}`,
      meta: id,
    }));
  }, [rfs]);

  const representativeOptions = useMemo<Array<SearchablePickerOption<string>>>(() => {
    const list: Array<SearchablePickerOption<string>> = [];
    if (chapterAccess) {
      const actionCount = chapterAccess.actions.length;
      list.push({
        id: chapterAccess.user_id,
        primaryLabel: `Signed-in Chapter Member (${actionCount} permission entries)`,
        secondaryLabel: chapterAccess.user_id,
        meta: chapterAccess.user_id,
      });
    }
    return list;
  }, [chapterAccess]);

  const describeVariant = useCallback(
    (variantId: string) => {
      const v = variantMap.get(variantId);
      return v ? `${v.code} — ${v.label}` : `Variant ${variantId.slice(0, 8)}…`;
    },
    [variantMap],
  );

  const describeUnit = useCallback(
    (unitId: string) => unitMap.get(unitId)?.code ?? unitId.slice(0, 8),
    [unitMap],
  );

  const describeLocation = useCallback(
    (locationId: string) => locationMap.get(locationId)?.name ?? `Location ${locationId.slice(0, 8)}…`,
    [locationMap],
  );

  const describeRf = useCallback(
    (rfId: string | null | undefined) => {
      if (!rfId) {
        return '—';
      }
      return rfMap.get(rfId)?.reference ?? `RF ${rfId.slice(0, 8)}…`;
    },
    [rfMap],
  );

  return {
    loading,
    error,
    items,
    variants,
    units,
    locations,
    rfs,
    lots,
    itemOptions,
    variantOptions,
    unitOptions,
    locationOptions,
    rfOptions,
    lotOptions,
    requestingUnitOptions,
    eventOptions,
    representativeOptions,
    describeVariant,
    describeUnit,
    describeLocation,
    describeRf,
    refresh: loadCandidates,
  };
}

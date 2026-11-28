import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet } from '../api/client.ts';
import type { SearchablePickerOption } from '../components/SearchableRecordPicker.tsx';
import type { ChapterAccessSnapshot } from '../api/types.ts';

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

const PREVIEW_CANDIDATE_DEFAULTS = {
  items: [
    { id: '95000000-0000-4000-8000-000000000050', code: 'SHIRT', name: 'Chapter Shirt', is_active: true },
    { id: '95000000-0000-4000-8000-000000000060', code: 'BOTTLE', name: 'Reusable Bottle 500ml', is_active: true },
    { id: '95000000-0000-4000-8000-000000000070', code: 'KIT', name: 'First Aid Field Kit', is_active: true },
  ] satisfies CandidateCatalogueItem[],
  variants: [
    {
      id: '95000000-0000-4000-8000-000000000051',
      item_id: '95000000-0000-4000-8000-000000000050',
      code: 'SHIRT-M',
      label: 'Chapter Shirt / Medium',
      default_unit_id: '95000000-0000-4000-8000-000000000052',
      is_active: true,
    },
    {
      id: '95000000-0000-4000-8000-000000000061',
      item_id: '95000000-0000-4000-8000-000000000060',
      code: 'BOTTLE-500',
      label: 'Reusable Bottle / 500ml',
      default_unit_id: '95000000-0000-4000-8000-000000000052',
      is_active: true,
    },
    {
      id: '95000000-0000-4000-8000-000000000071',
      item_id: '95000000-0000-4000-8000-000000000070',
      code: 'KIT-AID',
      label: 'First Aid Field Kit / Standard',
      default_unit_id: '95000000-0000-4000-8000-000000000053',
      is_active: true,
    },
  ] satisfies CandidateCatalogueVariant[],
  units: [
    { id: '95000000-0000-4000-8000-000000000052', code: 'PCS', label: 'Pieces', quantity_scale: 0, is_active: true },
    { id: '95000000-0000-4000-8000-000000000053', code: 'KIT', label: 'Kits', quantity_scale: 0, is_active: true },
  ] satisfies CandidateCatalogueUnit[],
  locations: [
    {
      id: '61000000-0000-4000-8000-000000000001',
      code: 'STR-MAIN',
      name: 'Main Chapter Stockroom',
      location_type: 'stockroom',
      is_active: true,
    },
    {
      id: '61000000-0000-4000-8000-000000000002',
      code: 'STR-HOLD',
      name: 'Receiving Inspection & Quarantine Cage',
      location_type: 'stockroom',
      is_active: true,
    },
  ] satisfies CandidateLocation[],
  rfs: [
    {
      id: '91000000-0000-4000-8000-000000000001',
      reference: 'RF-2026-0001',
      status: 'approved',
      material_version: 2,
      requesting_unit_id: '62000000-0000-4000-8000-000000000001',
      event_id: '63000000-0000-4000-8000-000000000001',
      needed_at: '2026-12-03T08:00:00.000000Z',
      lines: [
        {
          id: '91000000-0000-4000-8000-000000000011',
          variant_id: '95000000-0000-4000-8000-000000000051',
          unit_id: '95000000-0000-4000-8000-000000000052',
          approved_quantity: '45',
          unreserved_outstanding_quantity: '15',
        },
      ],
    },
    {
      id: '91000000-0000-4000-8000-000000000002',
      reference: 'RF-2026-0002',
      status: 'approved',
      material_version: 1,
      requesting_unit_id: '62000000-0000-4000-8000-000000000002',
      event_id: null,
      needed_at: '2026-12-05T08:00:00.000000Z',
      lines: [
        {
          id: '91000000-0000-4000-8000-000000000021',
          variant_id: '95000000-0000-4000-8000-000000000051',
          unit_id: '95000000-0000-4000-8000-000000000052',
          approved_quantity: '10',
          unreserved_outstanding_quantity: '10',
        },
      ],
    },
  ] satisfies CandidateInternalRf[],
};

export function useStage2Candidates(
  chapterId: string,
  refreshSignal: number,
  previewEnabled: boolean,
  chapterAccess: ChapterAccessSnapshot | null,
): Stage2CandidatesState {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CandidateCatalogueItem[]>([]);
  const [variants, setVariants] = useState<CandidateCatalogueVariant[]>([]);
  const [units, setUnits] = useState<CandidateCatalogueUnit[]>([]);
  const [locations, setLocations] = useState<CandidateLocation[]>([]);
  const [rfs, setRfs] = useState<CandidateInternalRf[]>([]);
  const [lots, setLots] = useState<CandidateStockLot[]>([]);
  const generationRef = useRef(0);

  const loadCandidates = useCallback(async () => {
    if (!chapterId) {
      return;
    }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setLoading(true);

    async function safeList<T>(path: string, fallback: T[]): Promise<T[]> {
      try {
        const res = await apiGet<T[]>(path);
        const rows = Array.isArray(res.data) ? res.data : [];
        if (rows.length === 0 && previewEnabled) {
          return fallback;
        }
        return rows;
      } catch {
        return previewEnabled ? fallback : [];
      }
    }

    const [itemRows, variantRows, unitRows, locRows, rfRows, lotRows] = await Promise.all([
      safeList<CandidateCatalogueItem>(
        `/api/v1/chapters/${chapterId}/catalogue/items?state=all&limit=100`,
        PREVIEW_CANDIDATE_DEFAULTS.items,
      ),
      safeList<CandidateCatalogueVariant>(
        `/api/v1/chapters/${chapterId}/catalogue/variants?state=all&limit=100`,
        PREVIEW_CANDIDATE_DEFAULTS.variants,
      ),
      safeList<CandidateCatalogueUnit>(
        `/api/v1/chapters/${chapterId}/catalogue/units?state=all&limit=100`,
        PREVIEW_CANDIDATE_DEFAULTS.units,
      ),
      safeList<CandidateLocation>(
        `/api/v1/chapters/${chapterId}/catalogue/locations?state=all&limit=100`,
        PREVIEW_CANDIDATE_DEFAULTS.locations,
      ),
      safeList<CandidateInternalRf>(
        `/api/v1/chapters/${chapterId}/internal-rfs?limit=50`,
        PREVIEW_CANDIDATE_DEFAULTS.rfs,
      ),
      safeList<CandidateStockLot>(
        `/api/v1/chapters/${chapterId}/stock/lots?limit=50`,
        [],
      ),
    ]);

    if (generationRef.current !== generation) {
      return;
    }
    setItems(itemRows);
    setVariants(variantRows);
    setUnits(unitRows);
    setLocations(locRows);
    setRfs(rfRows);
    setLots(lotRows);
    setLoading(false);
  }, [chapterId, previewEnabled]);

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
    if (previewEnabled) {
      ids.add('62000000-0000-4000-8000-000000000001');
      ids.add('62000000-0000-4000-8000-000000000002');
    }
    return Array.from(ids).map((id) => ({
      id,
      primaryLabel:
        id === '62000000-0000-4000-8000-000000000001'
          ? 'Community Response Team A'
          : id === '62000000-0000-4000-8000-000000000002'
            ? 'Campus Outreach Committee'
            : `Requesting Unit (${id.slice(0, 8)}…)`,
      secondaryLabel: `Derived from chapter RFs · ${id}`,
      meta: id,
    }));
  }, [previewEnabled, rfs]);

  const eventOptions = useMemo<Array<SearchablePickerOption<string>>>(() => {
    const ids = new Set<string>();
    for (const rf of rfs) {
      if (rf.event_id) {
        ids.add(rf.event_id);
      }
    }
    if (previewEnabled) {
      ids.add('63000000-0000-4000-8000-000000000001');
    }
    return Array.from(ids).map((id) => ({
      id,
      primaryLabel:
        id === '63000000-0000-4000-8000-000000000001'
          ? 'Barangay Relief Caravan'
          : `Chapter Event (${id.slice(0, 8)}…)`,
      secondaryLabel: `Derived from chapter RFs · ${id}`,
      meta: id,
    }));
  }, [previewEnabled, rfs]);

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
    if (previewEnabled) {
      list.push({
        id: '10000000-0000-4000-8000-000000000008',
        primaryLabel: 'Marco Technical (Technical Representative)',
        secondaryLabel: '10000000-0000-4000-8000-000000000008',
        meta: '10000000-0000-4000-8000-000000000008',
      });
    }
    return list;
  }, [chapterAccess, previewEnabled]);

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

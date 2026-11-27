# Stage 2 committed WebSocket notifications and authorized resynchronization

Specification [#27](https://github.com/Kamunggay/YSP/issues/27), ticket `07-committed-stage2-websocket-notifications`.
Candidate contract only: no Stage 2 HTTP controller, WebSocket runtime change, migration, measured timing, or
multi-laptop browser rehearsal is executed here. `openapi.yaml` alone defines Stage 2 HTTP payloads;
`events.schema.yaml` defines closed Draft 2020-12 Stage 2 notice schemas; `events.yaml` defines the six exact
Stage 2 event names, subject version bindings, co-emitted Stage 1 events, 100% Stage 2 operation dispositions,
safe-GET `refresh_operations`, checked positive/negative examples, and worked scenarios.

## Ownership, requirements and boundaries

Leader owns WebSocket outbox infrastructure, subscription authorization (`authorizeSessionNotifications`,
`authorizeChapterNotifications`), dispatch admission, revocation fencing, and all six Stage 2 domain events
(`stage2.repf.changed.v1`, `stage2.purchase-order.changed.v1`, `stage2.donation.changed.v1`,
`stage2.receiving-report.changed.v1`, `stage2.receiving-discrepancy.changed.v1`,
`stage2.receiving-hold.changed.v1`). Efren supplies co-emitted `stage1.stock-lot.changed.v1` notices inside
Leader's shared transaction whenever `prepareReceivingInventory` (`postReceivingReport`) or
`applyLotRestrictionResolution` (`resolveDonationRestriction` with `resolution_kind: apply`) changes stockroom
lots. Glenn preserves `stage1.internal-rf.changed.v1` on `cancelInternalRf` (co-emitting
`stage2.repf.changed.v1` and `stage2.purchase-order.changed.v1` inside the same commit when linked open RepFs or
POs are flagged `linked_demand_canceled: true`), owns `GET /replenishment/needs` and `GET /allocation-queue`, and
consumes every Stage 2 notice in React/TypeScript UI refresh handlers.

Every domain owner persists affected outbox rows inside the same MySQL transaction as the committed state,
history snapshot, and `ActionReceipt`. No required cross-owner domain update is ever delegated to best-effort
WebSocket delivery.

| Trace | Coverage and limits |
| --- | --- |
| `GOV-01`–`GOV-09`, `SEC-01`–`SEC-03` | Current session/MFA, active chapter membership, and exact subject/GET duty re-evaluated at subscribe, every recipient dispatch, and every HTTP read; uniform denial (`403`/`404`) without existence disclosure. |
| `DOC-01`–`DOC-11` | Minimal 8-field envelope with opaque UUIDs and canonical integer versions; zero human references (`REPF`/`PO`/`DA`/`RM`), PHP amounts, donor names, reasons, or evidence bytes on the wire. |
| `PRC-01`–`PRC-09`, `INV-10`–`INV-12` | Live refresh of RepFs, nested quotations, POs, `GET /replenishment/needs`, Stage 1 `inbound_open_po`, `demand_changed` alerts on `cancelInternalRf`, and procurement reports. |
| `RCV-01`–`RCV-13`, `INV-09`, `INV-14`, ADR 0004 | Live refresh of unified PO/DA Receiving Reports, newly posted usable/quarantined/rejected lots (`stage1.stock-lot.changed.v1`), donor-restriction resolutions, discrepancies, missing-source holds, and `GET /allocation-queue`. |
| `RPT-01`, `RPT-03`, `RPT-04`, Stage 2 `RPT-06` | Zero synthetic alert-only events: live duty-filtered `GET /alerts` and mounted Stage 2 JSON reports refresh reactively from committed domain and stock-lot events. |
| `AC-07`, `AC-12`, `AC-14`–`AC-16`, `ADD-AC-11` | Downstream multi-laptop live refresh, revocation, reconnect resync, and preserved unsaved-edit acceptance obligations (not passed by schema validation alone). |

## Channel reuse, current-authority dispatch re-evaluation and uniform denial

Stage 2 introduces zero new WebSocket authorization endpoints and zero new channel topologies. It extends Stage 1's
existing private chapter outbox and subscription model verbatim:

- **Logical chapter outbox channel:** `private-stage1.chapter.{chapter_id}` records committed Stage 2 and
  co-emitted Stage 1 chapter-scoped change intents in the transactional outbox.
- **Per-recipient authorized delivery channels:** Each authenticated browser socket subscribes through Stage 1's
  unchanged `POST /api/v1/auth/notification-subscriptions/authorize` (`authorizeSessionNotifications` ->
  `private-stage1.user.{current_user_uuid}`) and
  `POST /api/v1/chapters/{chapter_id}/notification-subscriptions/authorize` (`authorizeChapterNotifications` ->
  `private-stage1.chapter.{url_chapter_uuid}.user.{current_user_uuid}`). No wildcard, public, presence, client-event,
  or unscreened chapter-wide broadcast channel is permitted.
- **Current-authority delivery re-evaluation:** Prior channel admission is never sufficient for dispatch. Before
  delivering any Stage 2 notice to a subscribed socket, the server re-evaluates:
  1. The user account is currently enabled with an active full MFA session bound to that live socket.
  2. The user still holds active membership in `event.chapter_id`.
  3. The user currently holds the exact subject detail-read scope required by the notice (`repf.read` or
     `quotation.read` for RepF, `po.read` for PO, `da.read` for Donation, `receiving.read` for Receiving Report,
     Discrepancy, and Missing-Source Hold; Stage 1 stock read scope for `stage1.stock-lot.changed.v1`).
- **Revocation fencing and uniform denial:** Membership removal, duty revocation, account disable, or MFA reset
  commits fence subsequent recipient dispatch and disconnect/unsubscribe affected chapter or session sockets
  before any later notice is dispatched. A revoked or unadmitted recipient receives zero Stage 2 resource UUIDs.
  Every subsequent HTTP refresh or recovery call independently rechecks authority and returns uniform denial:
  `404 chapter_not_found` for unadmitted/revoked chapters, `403 duty_denied` for missing duties on an admitted
  chapter, and `404 operation_not_found` for unauthorized/revoked recovery lookups, without reversing any
  already-committed business record.

## Strict 8-field envelope, Stage 1 co-emissions and zero synthetic alerts

All six Stage 2 events use Stage 1's exact closed 8-field JSON object (`additionalProperties: false`):
`event_name`, `event_id` (UUIDv4, stable across retries/fanout), `committed_at` (UTC RFC 3339 with six fractional
digits ending `Z`; Asia/Manila is display-only), `chapter_id` (UUIDv4, non-null), `resource_kind`, `resource_id`
(opaque subject UUID), `resource_version` (integer `>= 1`), and `material_version` (integer `>= 1`).

| Event name | `resource_kind` | OpenAPI subject schema | `id_field` | `resource_version_field` | `material_version_field` |
| --- | --- | --- | --- | --- | --- |
| `stage2.repf.changed.v1` | `repf` | `Repf` | `id` | `version` | `material_version` |
| `stage2.purchase-order.changed.v1` | `purchase_order` | `PurchaseOrder` | `id` | `version` | `material_version` |
| `stage2.donation.changed.v1` | `donation` | `Donation` | `da_id` | `version` | `material_version` |
| `stage2.receiving-report.changed.v1` | `receiving_report` | `ReceivingReport` | `id` | `version` | `material_version` |
| `stage2.receiving-discrepancy.changed.v1` | `receiving_discrepancy` | `ReceivingDiscrepancy` | `id` | `version` | `material_version` |
| `stage2.receiving-hold.changed.v1` | `receiving_hold` | `ReceivingHold` | `id` | `version` | `material_version` |

- **Nested quotations & supplier selection:** `createRepfQuotation`, `replaceRepfQuotation`, `deleteRepfQuotation`,
  and `recordSupplierSelection` emit `stage2.repf.changed.v1` with a fresh `event_id` carrying the parent RepF's
  current `(version, material_version)` without incrementing `Repf.version`. Clients MUST therefore refresh mounted
  `listRepfQuotations`, `readRepf`, and `readProcurementReport` on any unseen `event_id` for
  `stage2.repf.changed.v1` even when `resource_version` equals the last reconciled `Repf.version` (suppressing only
  duplicate `event_id` deliveries or strictly older versions).
- **Stage 1 `stage1.stock-lot.changed.v1` co-emission:**
  - `postReceivingReport` co-emits `stage1.stock-lot.changed.v1` inside the same commit for every usable,
    quarantined, or rejected lot posted via Efren's `prepareReceivingInventory`, alongside
    `stage2.receiving-report.changed.v1`, `stage2.purchase-order.changed.v1` (`source_kind: po`) or
    `stage2.donation.changed.v1` (`source_kind: da`), and `stage2.receiving-discrepancy.changed.v1` (when
    damaged/rejected counts open discrepancies).
  - `resolveDonationRestriction` always emits `stage2.donation.changed.v1` on commit, and co-emits
    `stage1.stock-lot.changed.v1` **only** when `resolution_kind` is `apply` and Efren's
    `applyLotRestrictionResolution` updates remaining posted stockroom lot segments (`audit_review` or zero
    already-posted segments emits only `stage2.donation.changed.v1`).
- **Stage 1 `cancelInternalRf` preservation (`PRC-08`):** Stage 1 `cancelInternalRf` keeps its exact Stage 1
  events (`stage1.internal-rf.changed.v1`, plus affected reservation/stock-lot/preparation notices) and co-emits
  `stage2.repf.changed.v1` and `stage2.purchase-order.changed.v1` in the same transaction strictly for linked open
  RepFs and POs flagged `linked_demand_canceled: true`.
- **Zero synthetic alert-only events:** Because `GET /alerts` (`listOfficerAlerts`) is derived live from committed
  state with zero persisted alert rows (`persisted_ack_supported: false`), Stage 2 defines **zero** synthetic
  alert-only WebSocket events. Mounted alert feeds refresh reactively from the six Stage 2 domain events plus
  co-emitted `stage1.stock-lot.changed.v1`, `stage1.internal-rf.changed.v1`, and `stage1.chapter-setup.changed.v1`.
- **Commit-only outbox semantics:** Every safe `GET` read, printable HTML view, and recovery lookup emits zero
  events. Every mutation persists outbox rows atomically with its commit strictly for subjects whose represented
  state/version changed, and emits **zero** events on rollback, rejection (`4xx`/`5xx`), no-op, or identical
  `X-Action-Key` replay (`X-Action-Replayed: true`). Delivery failure or duplicate delivery never rolls back a
  commit, replays a mutation, or authorizes a second physical receipt or handover.

## Deduplication, disconnect/reconnect resynchronization and preserved form edits

- **Deduplication & ordering:** Clients deduplicate by `event_id` within the active session and track reconciled
  `(user_id, chapter_id, resource_kind, resource_id, resource_version, material_version)`. Events carry no
  cross-resource ordering guarantee and no replay cursor; clients never infer stock quantities, PHP totals, or
  outstanding balances from event counts. Strictly older versions (`< resource_version`) are ignored after a
  successful current GET, and equal versions with a duplicate `event_id` are ignored; an unseen `event_id` at an
  equal `resource_version` on `stage2.repf.changed.v1` still invalidates nested quotation/procurement reads. A newer
  notice arriving while a GET is in flight marks the subject dirty for one follow-up GET; slow obsolete GET
  response generations are discarded.
- **Disconnect/reconnect resynchronization sweep (no mutation replay):** On initial connect, socket reconnect, or
  tab focus return after disconnection:
  1. Mark mounted Stage 2 projections stale and suspend consequential write submissions.
  2. Re-verify Stage 1 `readCurrentSession`, `listMyChapterMemberships`, `readChapterContext`, and
     `readChapterAccess` for the active chapter. Reconnecting never grants authority.
  3. Obtain an owned live socket and fresh private channel authorization via Stage 1
     `authorizeSessionNotifications` and `authorizeChapterNotifications`; await subscription acknowledgment and
     buffer incoming hints before starting reads.
  4. Refresh only currently permitted mounted safe `GET` queries (subject lists/details/history/related,
     `listReplenishmentNeeds`, `listAllocationQueue`, `listOfficerAlerts`, and mounted JSON reports
     `readInventoryReport` / `readProcurementReport` / `readControlReport`; reset expired 5-minute pagination
     cursors on `409 snapshot_stale`).
  5. Resolve any locally pending same-person Stage 2 write intents exclusively through safe `GET` recovery lookups
     (`findProcurementOperationByKey` / `readProcurementOperation`, `findDonationOperation` /
     `readDonationOperation`, `findReceivingOperationByKey` / `readReceivingOperation`) using the private local
     `X-Action-Key`. Never auto-replay a `POST`/`PUT`/`DELETE` mutation on reconnect; `404 operation_not_found`,
     unavailable responses, or missing notices never prove rollback.
  6. Drain buffered/dirty subjects with current safe `GET`s and resume allowed commands only after explicit user
     review of changed material.
- **In-memory preservation of unsaved form text:** Unsaved edits across RepF lines/justifications, quotation
  comparisons, PO drafts/amendments, DA lines/valuations, Receiving Report inspection counts, discrepancy notes,
  and missing-source hold forms are retained strictly in memory under `(user_id, origin_chapter_id, resource_kind,
  resource_id, base_material_version)`:
  - When a background refresh loads a newer `version` or `material_version` for the same enabled authorized user
    in the same permitted chapter, stage the fresh server snapshot alongside the dirty form, display a clear
    stale/conflict indicator, and require explicit user comparison/reconfirmation. Background refresh **never**
    overwrites dirty form text, silently merges signed-evidence material, or auto-submits.
  - On explicit chapter change, increment the context generation, cancel in-flight old-chapter requests, leave the
    old private chapter subscription, clear rendered old projections, and park permitted same-person drafts under
    their origin chapter so late old-chapter notices/GETs cannot mutate the new chapter or relabel drafts.
  - On membership/duty revocation, account disable, sign-out, or verified identity replacement, immediately purge
    forbidden projections, private action keys, and identity-bound edit buffers (`SEC-02`/`SEC-03`). Expired
    sessions may hold an inaccessible in-memory buffer only until the same identity re-authenticates; another user
    never receives or sees it, and no cross-user shared storage of drafts or private evidence is allowed.

## Validation and downstream acceptance obligations

Run `contracts/stage2/validate.py` (normal -> `--invalid-example` -> normal) using the workspace-local pinned
Python virtual environment (`contracts/stage2/validation-requirements.txt`). `validate_notifications` verifies
Draft 2020-12 event schemas, exact 8-field closure, 100% Stage 2 operation and procedure dispositions, zero
synthetic alert events, safe-GET `refresh_operations`, exact OpenAPI subject schema field parity (`id_field`,
`resource_version_field`, `material_version_field`), `current_http_case` value bindings, positive/negative event
examples, and worked scenarios.

Downstream Stage 2 runtime implementation and separate 3-laptop HTTPS/WSS browser rehearsal (not executed here)
must verify real MySQL transactional outbox commit/rollback atomicity, `postReceivingReport` and
`resolveDonationRestriction` co-emission of `stage1.stock-lot.changed.v1`, `cancelInternalRf` co-emission without
deadlock, current-authority dispatch re-evaluation and immediate revocation fencing, uniform denial, disconnect/
reconnect resync with recovery lookups and zero duplicated writes, and in-memory preservation of unsaved form
edits across concurrent laptops.

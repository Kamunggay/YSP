# Committed notifications and authorized resynchronization

Specification [#19](https://github.com/Kamunggay/YSP/issues/19), ticket `stage1-contracts-09`.
Candidate contract only: no HTTP subscription controller, WebSocket infrastructure,
provider, migration, measured timing or browser acceptance exists here.
`openapi.yaml` alone defines HTTP payloads. `events.schema.yaml` defines closed
notice schemas; `events.yaml` supplies exact names, subjects, canonical version
bindings, audiences, refresh operation IDs, complete operation/procedure
dispositions, checked examples and eight worked scenarios. These are normative
together; companion material never defines another HTTP payload.

## Ownership, requirements and boundaries

Leader owns infrastructure, canonical coordination, HTTP subscription authorization,
session/socket binding, private gateway, dispatch admission, revocation and durable
notification follow-up. Glenn supplies catalogue/demand/reservation/hold notices
and consumes all frontend updates. Leader supplies setup/authority/evidence and
IPC/opening RM notices. Efren supplies signed issue and stock notices, including
Inventory effects inside receiving/reservation/hold transactions. Each domain
owner persists every affected notice intent within the same business commit,
with its result/audit; another owner's required domain update is never delegated
to best-effort notification delivery. Leader reviews Glenn/Efren; Efren reviews
consequential Leader/shared changes; Glenn checks all UI consumption. Affected
owners review subjects, audiences and refreshes. Agent authorship/review does not
constitute those human reviews; actual outcomes are recorded in local evidence.

Sources: MVP-IMPLEMENTATION-PLAN sections 5/6, MVP-DELIVERY-SCOPE WebSocket
requirements, TRD TR-16/TR-17, #19 stories 48/49 and completion criterion 6.
Retain candidate status and approved operational prerequisites.

| Trace | This slice; coverage limits |
| --- | --- |
| GOV-01/02, SEC-01/02/03 | Individual full/MFA identity and current chapter/membership/duty admission at subscribe, dispatch and each GET; provider status grants no operational access. |
| GOV-03–09 | Refresh current setup/independence/approval decisions. Notices grant no authority and replace no domain approval checks. |
| DOC-01–07/09/10 | Current identity/version/history/related-read invalidation; no human references, private reasons, signature bytes or audit bodies broadcast. |
| DOC-08/11, INV-05–09 | Committed-only receipt/reservation/issue effects and safe uncertain-outcome lookup; no second movement/handover on notification failure. |
| INV-01–04/10–14, RF-01–08 | Refresh seven separate stock views, eligibility, overlapping holds, exact commitments, RF progress and shortages. No later procurement/ADJ action. |
| RCV accepted-only/MIG-04 | One accepted IPC/RM baseline; examples do not approve live activation. |
| AC-01/02/04/19, ADD-02/08 and applicable ADD-AC | Later connected quantity/history/access/refresh and preserved-edit acceptance, not passed by schema examples. |
| APP-FLOW S1-02–06/14–20, S2-11/18–19, S3-15–23 | RF correction/approval/reservation and accepted-source/signed-issue refresh; later-stage portions remain excluded. |

## Authorization and private delivery

New Leader-owned, Glenn-consumed operations are `authorizeSessionNotifications`
(POST `/api/v1/auth/notification-subscriptions/authorize`) and
`authorizeChapterNotifications` (POST
`/api/v1/chapters/{chapter_id}/notification-subscriptions/authorize`). Canonical
OpenAPI defines schemas, headers, cookie/CSRF security, statuses and examples.
No business action key, reference, evidence, stored outcome or stock effect applies.
Exact supported channels are `private-stage1.user.{current_user_uuid}` and
`private-stage1.chapter.{url_chapter_uuid}.user.{current_user_uuid}`. UUIDs are
canonical lowercase. No arbitrary target user, public/presence/client-event room,
wildcard or chapter-wide payload channel is allowed. Channel names are never grants.

Origin then CSRF then enabled full session/current MFA precede admission. Chapter
channels require active chapter/current membership; a member with no domain duty
can receive only permitted setup invalidations. Domain delivery additionally
requires the exact subject detail-read predicate: requester/approver/unit, IPC
participant, evidence target and combined stock/RF duties remain enforced.

Runtime must bind each live WSS socket to the actual authenticated browser session
at connection/authorization with same-origin checks and session tracking. A client
socket number is never proof of ownership; another browser of the same user cannot
claim it. The JSON `auth` response is the private-handshake exception to domain
`data` envelopes: public app key plus lowercase HMAC-SHA256 of
`socket_id:channel_name`, application secret server-only. A copied signature
authorizes no other socket/channel. Require connection/session ownership even
when a valid signature is copied. Custom SDK JSON authorization may be needed;
neither SDK nor transport is implemented. Uniform subscription denial covers
wrong/unknown/expired/unowned socket, user, chapter and channel without existence
disclosure. No durable business intent is consumed; identical retry is safe only
for the same still-live connection.

Re-evaluate current enabled session, membership and exact subject read scope before
each recipient dispatch. Previously admitting a private channel is insufficient.
Authority revocation commits fence future delivery and disconnect/remove affected
subscriptions before subsequent dispatch, serialized with admission checks. No
subject identifiers are sent to a now-forbidden recipient. Already transmitted
authorized hints cannot be recalled; protected bodies are never included. Every
HTTP read separately rechecks authority. These extra requirements are our security
design, not automatic guarantees from a private-channel handshake.

The self authority notice contains only the already known user UUID, null chapter
and versions: no grant IDs or list of revoked chapters. Membership/duty/alternate
changes notify affected enabled individuals, including the removed member, through
their self channel. Disabled/reset identities lose sessions/sockets even if no
last notice can be delivered. Disconnection and current checks remain mandatory
when control delivery fails. New grants can invalidate the person's membership
list without disclosing the new chapter to any other person.

## Subjects, identities and commit behavior

All 16 exact names in `events.yaml` end `.changed.v1`; wire name equals payload
`event_name`, without an automatic model namespace. Breaking changes require a
new suffix and coordinated consumers. Unknown versions trigger current permitted
resync and suspend affected commands pending client compatibility; do not guess.
Every required field is present: null means no canonical version exists, not zero
or unknown. `event_id` identifies one persisted subject-change notice and remains
stable across retries/fanout. `committed_at` is UTC database commitment time with
six fractional digits; Asia/Manila is display only. The business occasion Event
is distinct. `resource_id` is an opaque subject UUID, never a human reference,
action key, attachment identity or operation-result identity.

Authority uses self user identity with null versions. Setup uses chapter identity
and canonical `ChapterAccessResult.data.setup_version`. Catalogue uses material
version and null resource version. Evidence uses evidence UUID/current numeric
`version`, with null material version. IPC/RM resource version is `revision`;
RF/reservation/hold/issue/preparation use `version`; lots use `stock_version`.
Material version is copied only where that subject exposes `material_version`.
RF progress_version is refetched, not inferred. Opening baseline uses chapter ID
and null versions, avoiding an invented sequence. Registry mappings are checked
against the canonical HTTP schemas.

Every HTTP operation and controlled procedure has an explicit disposition. Emit
listed subjects only if their represented state/version actually changes; no
fabricated affected resource. Internal participant notices belong to the caller's
shared commit. Rejection, rollback, identical replay and no-op emit no new notice.
Print/current/history/result reads and authorization have no domain notification.
Authentication secrets/activity are not broadcast; affected session lifecycle is
enforced directly without signing out unrelated browsers. Controlled setup names
its affected-user/setup events; new account creation has no admitted consumer.

Approved setup/policy invalidations also refresh currently permitted mounted catalogue/settings/history, stock/eligibility/shortage and domain blockers using the exact setup-event refresh IDs; the notice grants no dependent read access. Hold changes also notify scoped RF-only readers when blocked RF projections change.

Opening post invalidates IPC/RM/accepted lots/baseline; rejected/quarantined findings
remain in authorized finding reads, never fabricated usable stock. Cancellation,
release/reallocation and issue invalidate affected RF/reservation/stock and stored
preparation/issue subjects only when they change. Holds invalidate lot eligibility,
retained blocked commitments, preparations and issue fences without any movement.
Evidence replacement invalidates evidence and the mounted authorized target's
readiness/acknowledgment: read the target from the existing authorized evidence
link, then independently authorize IPC/RM/issue/hold reads. No target ID/hash is
added to the wire. Changed signed material requires fresh matching paper.

Persist intents atomically with domain changes, audit and stored result. Dispatch
only committed intents. Failed delivery, retry exhaustion, offline clients and
duplicates never undo a commit, repost a command, consume stock again or permit
a second physical handover. Retry same event identity/original committed versions
but current delivery authority. Leader owns durable retry visibility and retained
undelivered intent handling; numeric retry/timing policy remains a later decision.

No exactly-once delivery, cross-resource order, replay cursor, continuous snapshot
or offline delivery guarantee exists. Several unordered notices can describe one
atomic commit; do not count quantities or movements from events. Deduplicate IDs
in the current client session. Track versions by user/chapter/kind/resource;
ignore old/equal hints only after successful current read reconciliation. Null
versions always invalidate. A newer hint during a GET marks the subject dirty
for another GET. Failed reads retain stale/error state and pending invalidation.
Serialize subject reads or reject older response generations to prevent slow
earlier GETs overwriting newer projections.

## Resynchronization and preserved edits

No additional resync HTTP endpoint is needed. Reuse `readCurrentSession`, all pages
of `listMyChapterMemberships`, then `readChapterContext`/`readChapterAccess` for the
explicit chapter. Per-event `refresh_operations` use the exact existing path/query
parameters, payloads, sorting/pagination and errors. There is no companion HTTP
snapshot, union payload or authorization token for posting. Subject GET uses event
resource ID/chapter; parent RF IDs, version UUIDs and variants come from current
authorized domain reads or same-person retained UI context. When missing, refresh
permitted parent/list first; do not guess or reuse another chapter's cache. Call
only contextually permitted queries for displayed subjects/lists. Reset stale
cursors after gaps; follow the existing snapshot/conflict rules.

Initial connect, reconnect and focus return after disconnection follow this sweep:

1. Mark projections stale, suspend consequential commands, verify current session,
   MFA and membership. A reconnect creates no authority.
2. Obtain an owned live socket and fresh authorization; await successful private
   subscription acknowledgment, then buffer hints before reading current state.
3. Refresh context/access, permitted displayed lists/details/stock/evidence-target
   readiness and all pending same-person operation outcomes. Failed reads remain
   visibly stale; a missed hint does not exempt a displayed resource from resync.
4. Drain buffered/dirty subjects by current GET. If authority changes during the
   sweep, recheck and discard obsolete identity/chapter response generations.
5. Resume allowed actions only after explicit review of changed material. Preserve
   uncertain intents until authorized by-key/result lookup establishes outcome.
   Denied, unavailable, missing/in-flight results or missing notices never prove
   rollback or physical return. Follow ticket08 reconciliation; never re-handover.

For pending intents reuse exact domain `findCatalogueOperation`/
`readCatalogueOperation`, `findOpeningActionByKey`/`readOpeningAction`,
`findInternalRfOperationResult`/`readInternalRfOperationResult`,
`findReservationOperation`/`readReservationOperation`, and
`findActualIssueOperation`/`readActualIssueOperation`. Keys remain local/private.
Current originating-command/result authority applies even to older commits;
`notifications09-old-result-revoked` shows denial without reversing commitment.

Retain dirty edits only for the same current authorized individual, original
chapter/resource and base material version. Stage fresh server data separately,
show stale/conflict and require explicit comparison/reconfirmation. Refresh never
overwrites the dirty form, silently merges acknowledgment material or auto-submits.
On explicit chapter change cancel old handlers/requests by context generation,
leave old chapter subscriptions, clear rendered old projections and park permitted
same-person drafts under their origin. Admit/authorize the new chapter and sweep.
Late old notices/GETs cannot change new context; no draft is relabeled/submitted
there. Returning to its admitted origin restores edits for review only.

Revoked scope removes forbidden projections and edit buffers. Disable/sign-out/
verified identity replacement purges protected caches and identity-bound buffers.
Expiry may hold an inaccessible in-memory buffer until the same person verifies
identity; another account never receives it. No cross-user/shared persistence of
private evidence, results or drafts is authorized. Ordinary refresh/upload/transport
failure preserves permitted edits; preservation never overrides SEC-02/03.

## Validation and later acceptance

The existing pinned `validate.py` invocation in `agreement.md` checks HTTP examples,
closed event examples, every operation/procedure disposition, safe refresh IDs,
canonical version mappings and the eight worked scenario references. Run normal,
deliberate-invalid, then normal again. Schema checks cannot establish delivery,
authorization, MySQL commit/dispatch serialization or browser behavior.

Later real HTTP/MySQL/WSS tests must prove durable commit/rollback intents, lost
response recovery, current dispatch revocation ordering, copied socket/channel/
signature denial, requester/unit/evidence-target scope, disabled sessions,
duplicate/old/missed hints, slow obsolete GETs, cursor reset and identity change.
Preserve exact-ten input after only-six conflict; explicit six remains one commit
with four outstanding. Hold-first rejection versus issue-first single commitment
retain existing physical reconciliation rules.

Manual acceptance **not run**: three individually authenticated laptops through
real HTTPS/WSS gateway see permitted committed IPC/RM/reservation/signed-issue
updates automatically; another chapter/private subject denied; revoke/disable
while connected; reconnect after missed notices; chapter change/late responses;
same-person unsaved edits and origin preserved; protected inputs hidden on account
replacement; lost issue response recovered without second handover. Record actual
accounts/independence, observer, date/origin/revision/environment, provider and
end-to-end timings. Reverb remains proposed; tunnel and numeric timing require
that rehearsal. Never restore withdrawn polling criteria. Six scaffold checks and
contract validation are separate and do not pass connected Stage 1 acceptance.

Technical sources: [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html) and
[Laravel channel/transaction controls](https://laravel.com/docs/13.x/broadcasting).
Framework documentation supplies no evidence this extra dispatch/session design
has been implemented.

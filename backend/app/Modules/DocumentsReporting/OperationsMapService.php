<?php

declare(strict_types=1);

namespace App\Modules\DocumentsReporting;

use Illuminate\Support\Facades\DB;

/**
 * Phase 4 (P25) Supporting-only Interactive Operations Map, scenario tracer,
 * accessible text-alternative parity, neutral RBAC node inspection, and graceful fallback.
 */
final class OperationsMapService
{
    private const string ILLUSTRATIVE_TAG = 'ILLUSTRATIVE SCENARIO — NOT LIVE OPERATIONAL DATA';

    /** @var array<string, array{title: string, summary: string}> */
    private const array VIEWS = [
        'view_1_swimlanes' => ['title' => 'Chapter Operational Swimlanes', 'summary' => 'End-to-end flow across Intake, Review, Inventory, Purchasing, Sales, Finance, and Audit.'],
        'view_2_money_or' => ['title' => 'Money vs Verified Official Receipt Gate', 'summary' => 'Verified OR required before protected stock allocation or funded RepF forwarding.'],
        'view_3_stocks_custody' => ['title' => 'Seven Stock Views & Custody Boundary', 'summary' => 'Disjoint buckets: usable on-hand, free available, RF reserved, SO reserved, booth custody, quarantined, inbound PO.'],
        'view_4_governance_matrix' => ['title' => 'Dual-Control Governance Matrix', 'summary' => 'Segregation of duties and MFA checkpoints across RF, SO, Inventory, Finance, and Booth closeout.'],
        'view_5_scenario_tracer' => ['title' => 'Worked Example Scenario Tracer', 'summary' => 'Step-by-step walkthrough of non-live reference examples with explicit policy labels.'],
    ];

    /** @var array<string, array{title: string, steps: list<string>}> */
    private const array SCENARIOS = [
        'track1_so_backorder' => [
            'title' => 'Track 1: SO Split + Dual 48h Clocks + Funded RepF Backorder',
            'steps' => ['Approve SO -> split 6 available (Clock 1 48h) + 2 shortage', 'Buyer accepts split -> Clock 2 48h starts on 2 shortage', 'Verified OR funds backorder before Clock 2 -> RepF unlocked; Clock 1 expiry releases only unpaid 6'],
        ],
        'track2_booth_100_30_70' => [
            'title' => 'Track 2: Booth Custody 100 Issued / 30 Sold / 70 Returned',
            'steps' => ['Dispatch 100 units into booth custody (separated from free warehouse)', 'Record 30 verified booth sales + 70 physical return', 'Independent reviewer confirms zero unexplained variance at closeout'],
        ],
        'purchasing_po_100_rm_40' => [
            'title' => 'Purchasing PO 100 Delivered with RM 40 Return',
            'steps' => ['Receive 100 against locked PO price & qty', 'Segregate 40 damaged to quarantine under Return Material note', 'Post 60 usable to warehouse stock_positions without mixing quarantined qty'],
        ],
    ];

    /** @var array<string, array{title: string, roles: list<string>, restricted_details: string}> */
    private const array NODES = [
        'sales_payment_gate' => ['title' => 'Sales Verified OR Payment Gate', 'roles' => ['CHAPTER_HEAD', 'FINANCE'], 'restricted_details' => 'Finance OR validation ledger checks amount >= estimated cost before protecting stock or unlocking RepF.'],
        'booth_closeout_node' => ['title' => 'Independent Booth Closeout Checkpoint', 'roles' => ['CHAPTER_HEAD', 'INDEPENDENT_REVIEWER'], 'restricted_details' => 'Independent Reviewer reconciles variance count, OR totals, and cash drop seals prior to custody release.'],
        'stock_eligibility_node' => ['title' => 'Warehouse Stock Eligibility & Policy Gate', 'roles' => ['CHAPTER_HEAD', 'INVENTORY'], 'restricted_details' => 'Disjoint lot/condition/donor restriction intervals evaluated with FOR UPDATE locks before reserve or release.'],
    ];

    public function __construct(private ChapterOutcomes $outcomes) {}

    /** @param array<string, mixed> $actor
     * @return array<string, mixed> */
    public function getMap(int $chapterId, array $actor): array
    {
        $st = $this->ensureState($chapterId, (int) $actor['user_id']);
        $scenKey = (string) $st->active_scenario;
        $scen = self::SCENARIOS[$scenKey] ?? self::SCENARIOS['track1_so_backorder'];

        return [
            'chapter_id' => (string) $chapterId, 'is_supporting_only' => true, 'illustrative_tag' => self::ILLUSTRATIVE_TAG,
            'state' => [
                'active_view' => (string) $st->active_view, 'active_scenario' => $scenKey,
                'text_alternative_enabled' => (bool) $st->text_alternative_enabled, 'map_unavailable' => (bool) $st->map_unavailable,
                'row_version' => (int) $st->row_version,
            ],
            'views' => self::VIEWS,
            'scenarios' => array_map(fn (string $k, array $s): array => [
                'scenario_code' => $k, 'title' => $s['title'], 'illustrative_tag' => self::ILLUSTRATIVE_TAG, 'steps' => $s['steps'],
            ], array_keys(self::SCENARIOS), self::SCENARIOS),
            'active_scenario_detail' => [
                'scenario_code' => $scenKey, 'title' => $scen['title'], 'illustrative_tag' => self::ILLUSTRATIVE_TAG, 'steps' => $scen['steps'],
            ],
            'text_alternative_outline' => $this->textOutline((string) $st->active_view, $scenKey),
            'nodes' => array_map(fn (string $k, array $n): array => ['node_code' => $k, 'title' => $n['title']], array_keys(self::NODES), self::NODES),
        ];
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function selectViewAndScenario(int $chapterId, array $actor, string $key, array $in): array
    {
        $view = (string) ($in['view_code'] ?? '');
        $scen = (string) ($in['scenario_code'] ?? '');
        if (! isset(self::VIEWS[$view]) || ! isset(self::SCENARIOS[$scen])) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Valid view_code and scenario_code are required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'map.select_view', 'MapSelect@p25.v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $in, $view, $scen): array {
            if (($r = $this->outcomes->replay($chapterId, 'map.select_view', $key, $hash)) !== null) {
                return $r;
            }
            $st = $this->ensureState($chapterId, (int) $actor['user_id'], true);
            if (isset($in['expected_row_version']) && (int) $in['expected_row_version'] !== (int) $st->row_version) {
                return $this->outcomes->stale($chapterId, $this->mapRecordState($st));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $newVer = (int) $st->row_version + 1;
            DB::table('operations_map_states')->where('id', (int) $st->id)->update([
                'active_view' => $view, 'active_scenario' => $scen, 'row_version' => $newVer,
                'updated_by_user_id' => (int) $actor['user_id'], 'updated_at' => $now,
            ]);
            DB::table('operations_map_audit_events')->insert([
                'chapter_id' => $chapterId, 'actor_user_id' => (int) $actor['user_id'], 'event_type' => 'select_view_scenario',
                'view_code' => $view, 'scenario_code' => $scen, 'outcome' => 'allowed', 'detail' => self::ILLUSTRATIVE_TAG, 'occurred_at' => $now,
            ]);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'map.select_view', $key, $hash, 'MapSelect@p25.v1',
                ChapterOutcomes::recordState((string) $st->id, 'OPS_MAP_STATE', $newVer, 1, ['active_view' => $view, 'active_scenario' => $scen]),
                ['map' => $this->getMap($chapterId, $actor)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function toggleTextAlternative(int $chapterId, array $actor, string $key, array $in): array
    {
        $enabled = (bool) ($in['enabled'] ?? true);
        $hash = ChapterOutcomes::fingerprint($chapterId, 'map.toggle_text_alternative', 'MapTextAlt@p25.v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $in, $enabled): array {
            if (($r = $this->outcomes->replay($chapterId, 'map.toggle_text_alternative', $key, $hash)) !== null) {
                return $r;
            }
            $st = $this->ensureState($chapterId, (int) $actor['user_id'], true);
            if (isset($in['expected_row_version']) && (int) $in['expected_row_version'] !== (int) $st->row_version) {
                return $this->outcomes->stale($chapterId, $this->mapRecordState($st));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $newVer = (int) $st->row_version + 1;
            DB::table('operations_map_states')->where('id', (int) $st->id)->update([
                'text_alternative_enabled' => $enabled, 'row_version' => $newVer,
                'updated_by_user_id' => (int) $actor['user_id'], 'updated_at' => $now,
            ]);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'map.toggle_text_alternative', $key, $hash, 'MapTextAlt@p25.v1',
                ChapterOutcomes::recordState((string) $st->id, 'OPS_MAP_STATE', $newVer, 1, ['text_alternative_enabled' => $enabled ? 'true' : 'false']),
                ['map' => $this->getMap($chapterId, $actor)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function setFailureMode(int $chapterId, array $actor, string $key, array $in): array
    {
        $unavail = (bool) ($in['map_unavailable'] ?? false);
        $hash = ChapterOutcomes::fingerprint($chapterId, 'map.set_failure_mode', 'MapFailureMode@p25.v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $in, $unavail): array {
            if (($r = $this->outcomes->replay($chapterId, 'map.set_failure_mode', $key, $hash)) !== null) {
                return $r;
            }
            $st = $this->ensureState($chapterId, (int) $actor['user_id'], true);
            if (isset($in['expected_row_version']) && (int) $in['expected_row_version'] !== (int) $st->row_version) {
                return $this->outcomes->stale($chapterId, $this->mapRecordState($st));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $newVer = (int) $st->row_version + 1;
            DB::table('operations_map_states')->where('id', (int) $st->id)->update([
                'map_unavailable' => $unavail, 'row_version' => $newVer,
                'updated_by_user_id' => (int) $actor['user_id'], 'updated_at' => $now,
            ]);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'map.set_failure_mode', $key, $hash, 'MapFailureMode@p25.v1',
                ChapterOutcomes::recordState((string) $st->id, 'OPS_MAP_STATE', $newVer, 1, ['map_unavailable' => $unavail ? 'true' : 'false']),
                ['map' => $this->getMap($chapterId, $actor)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @return array{http_status: int, body: array<string, mixed>} */
    public function renderDiagram(int $chapterId, array $actor): array
    {
        $st = $this->ensureState($chapterId, (int) $actor['user_id']);
        $now = now()->format('Y-m-d H:i:s.u');
        if ((bool) $st->map_unavailable) {
            DB::table('operations_map_audit_events')->insert([
                'chapter_id' => $chapterId, 'actor_user_id' => (int) $actor['user_id'], 'event_type' => 'render_diagram',
                'view_code' => (string) $st->active_view, 'scenario_code' => (string) $st->active_scenario,
                'outcome' => 'unavailable', 'detail' => 'MAP_RENDERER_UNAVAILABLE', 'occurred_at' => $now,
            ]);

            return ['http_status' => 424, 'body' => [
                'code' => 'MAP_RENDERER_UNAVAILABLE',
                'message' => 'Visual map diagram is temporarily unavailable; text alternative and operational workflows remain accessible.',
                'text_alternative_available' => true,
                'text_alternative_outline' => $this->textOutline((string) $st->active_view, (string) $st->active_scenario),
            ]];
        }

        return ['http_status' => 200, 'body' => [
            'illustrative_tag' => self::ILLUSTRATIVE_TAG,
            'view_code' => (string) $st->active_view,
            'scenario_code' => (string) $st->active_scenario,
            'nodes' => array_keys(self::NODES),
            'text_alternative_outline' => $this->textOutline((string) $st->active_view, (string) $st->active_scenario),
        ]];
    }

    /** @param array<string, mixed> $actor
     * @return array{http_status: int, body: array<string, mixed>} */
    public function inspectNode(int $chapterId, array $actor, string $nodeCode): array
    {
        if (! isset(self::NODES[$nodeCode])) {
            return $this->outcomes->blocked($chapterId, 404, 'NODE_NOT_FOUND', 'Operations map node not found.');
        }
        $node = self::NODES[$nodeCode];

        /** @var list<string> $duties */
        $duties = $actor['duties'] ?? [];
        $ok = array_intersect($duties, $node['roles']) !== [];
        $now = now()->format('Y-m-d H:i:s.u');

        DB::table('operations_map_audit_events')->insert([
            'chapter_id' => $chapterId, 'actor_user_id' => (int) $actor['user_id'], 'event_type' => 'inspect_node',
            'node_code' => $nodeCode, 'outcome' => $ok ? 'allowed' : 'denied',
            'detail' => $ok ? 'node_detail_viewed' : 'NEUTRAL_SCOPE_RESTRICTED_EXPLANATION', 'occurred_at' => $now,
        ]);

        if (! $ok) {
            return $this->outcomes->forbidden('NEUTRAL_SCOPE_RESTRICTED_EXPLANATION', 'This operational checkpoint is restricted to authorized chapter duties.');
        }

        return ['http_status' => 200, 'body' => [
            'node_code' => $nodeCode,
            'node_title' => $node['title'],
            'illustrative_tag' => self::ILLUSTRATIVE_TAG,
            'restricted_details' => $node['restricted_details'],
        ]];
    }

    /** @return array<string, mixed> */
    private function mapRecordState(object $st): array
    {
        return ChapterOutcomes::recordState((string) $st->id, 'OPS_MAP_STATE', (int) $st->row_version, 1, [
            'active_view' => (string) $st->active_view, 'active_scenario' => (string) $st->active_scenario,
        ]);
    }

    private function ensureState(int $chapterId, int $userId, bool $lock = false): object
    {
        $now = now()->format('Y-m-d H:i:s.u');
        DB::table('operations_map_states')->insertOrIgnore([
            'chapter_id' => $chapterId, 'active_view' => 'view_1_swimlanes', 'active_scenario' => 'track1_so_backorder',
            'text_alternative_enabled' => false, 'map_unavailable' => false, 'row_version' => 1,
            'updated_by_user_id' => $userId, 'updated_at' => $now,
        ]);

        $q = DB::table('operations_map_states')->where('chapter_id', $chapterId);
        /** @var object $row */
        $row = ($lock ? $q->lockForUpdate() : $q)->first();

        return $row;
    }

    /** @return list<string> */
    private function textOutline(string $viewCode, string $scenCode): array
    {
        $v = self::VIEWS[$viewCode] ?? self::VIEWS['view_1_swimlanes'];
        $s = self::SCENARIOS[$scenCode] ?? self::SCENARIOS['track1_so_backorder'];

        return [$v['title'].': '.$v['summary'], self::ILLUSTRATIVE_TAG.' — '.$s['title'], ...$s['steps']];
    }
}

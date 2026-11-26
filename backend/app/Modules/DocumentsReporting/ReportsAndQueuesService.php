<?php

declare(strict_types=1);

namespace App\Modules\DocumentsReporting;

use App\Modules\InventoryCustody\InventoryLedgerParticipant;
use App\Modules\InventoryCustody\QuantityMath;
use Illuminate\Support\Facades\DB;

/**
 * Phase 4 (P24) Seven-view stock projections, accessible role-scoped work queues,
 * dual date-basis sanitized CSV/PDF outputs, and permission-checked job retries.
 */
final class ReportsAndQueuesService
{
    /** @var array<string, list<string>> */
    private const array GROUP_DUTIES = [
        'inventory' => ['CHAPTER_HEAD', 'INVENTORY', 'RECEIVING', 'DISPATCH'],
        'demand_procurement' => ['CHAPTER_HEAD', 'COMMITTEE_REQUESTER', 'RF_APPROVER', 'PURCHASING'],
        'finance_booth' => ['CHAPTER_HEAD', 'FINANCE', 'SALES_OFFICER', 'SALES_REVIEWER', 'BOOTH_CUSTODIAN'],
        'control_audit' => ['CHAPTER_HEAD', 'INDEPENDENT_REVIEWER', 'FINANCE'],
    ];

    public function __construct(
        private InventoryLedgerParticipant $inventory,
        private ChapterOutcomes $outcomes,
    ) {}

    /** @return array<string, mixed> */
    public function sevenStockViews(int $chapterId): array
    {
        $soByVar = [];
        foreach (DB::table('sale_stock_pools')->where('chapter_id', $chapterId)->get() as $p) {
            $soByVar[(int) $p->item_variant_id] = QuantityMath::add(
                QuantityMath::dbToMicroString((string) $p->so_unpaid_reserved_qty),
                QuantityMath::dbToMicroString((string) $p->so_paid_reserved_qty),
            );
        }

        $byVar = [];
        foreach ($this->inventory->allStockPositionSummaries($chapterId) as $r) {
            $vid = $r['variant_id'];
            $cur = $byVar[$vid] ?? [
                'variant_id' => (string) $vid, 'sku' => $r['sku'], 'item_name' => $r['item_name'],
                'variant_code' => $r['variant_code'], 'scale' => $r['unit_scale'],
                'usable' => '0', 'rf' => '0', 'so' => $soByVar[$vid] ?? '0', 'booth' => '0', 'quarantined' => '0', 'inbound' => '0',
            ];
            $oh = QuantityMath::dbToMicroString($r['on_hand_qty']);
            $res = QuantityMath::dbToMicroString($r['reserved_qty']);
            if (! $r['is_usable_for_issue']) {
                $cur['quarantined'] = QuantityMath::add($cur['quarantined'], $oh);
            } elseif ($r['location_kind'] === 'booth') {
                $cur['booth'] = QuantityMath::add($cur['booth'], $oh);
            } elseif ($r['location_kind'] === 'warehouse') {
                $cur['usable'] = QuantityMath::add($cur['usable'], $oh);
                $cur['rf'] = QuantityMath::add($cur['rf'], $res);
            }
            $byVar[$vid] = $cur;
        }

        $tot = ['usable' => '0', 'available' => '0', 'rf' => '0', 'so' => '0', 'booth' => '0', 'quarantined' => '0', 'inbound' => '0'];
        $variants = [];
        foreach ($byVar as $v) {
            $used = QuantityMath::add($v['rf'], $v['so']);
            $avail = QuantityMath::cmp($v['usable'], $used) > 0 ? QuantityMath::sub($v['usable'], $used) : '0';
            foreach (['usable', 'rf', 'so', 'booth', 'quarantined', 'inbound'] as $k) {
                $tot[$k] = QuantityMath::add($tot[$k], $v[$k]);
            }
            $tot['available'] = QuantityMath::add($tot['available'], $avail);
            $variants[] = [
                'variant_id' => $v['variant_id'], 'sku' => $v['sku'], 'item_name' => $v['item_name'], 'variant_code' => $v['variant_code'],
                'usable_on_hand_qty' => QuantityMath::toUnitQuantity($v['usable'], $v['scale']),
                'available_to_allocate_qty' => QuantityMath::toUnitQuantity($avail, $v['scale']),
                'rf_reserved_qty' => QuantityMath::toUnitQuantity($v['rf'], $v['scale']),
                'so_reserved_qty' => QuantityMath::toUnitQuantity($v['so'], $v['scale']),
                'booth_custody_qty' => QuantityMath::toUnitQuantity($v['booth'], $v['scale']),
                'quarantined_qty' => QuantityMath::toUnitQuantity($v['quarantined'], $v['scale']),
                'inbound_po_qty' => QuantityMath::toUnitQuantity($v['inbound'], $v['scale']),
            ];
        }

        return [
            'chapter_id' => (string) $chapterId,
            'views' => [
                'usable_on_hand_qty' => QuantityMath::microToWireString($tot['usable'], 6),
                'available_to_allocate_qty' => QuantityMath::microToWireString($tot['available'], 6),
                'rf_reserved_qty' => QuantityMath::microToWireString($tot['rf'], 6),
                'so_reserved_qty' => QuantityMath::microToWireString($tot['so'], 6),
                'booth_custody_qty' => QuantityMath::microToWireString($tot['booth'], 6),
                'quarantined_qty' => QuantityMath::microToWireString($tot['quarantined'], 6),
                'inbound_po_qty' => QuantityMath::microToWireString($tot['inbound'], 6),
            ],
            'variants' => $variants,
        ];
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $query
     * @return array{http_status: int, body: array<string, mixed>} */
    public function workspace(int $chapterId, array $actor, array $query = []): array
    {
        $cur = $this->outcomes->parseCursor($chapterId, 'reports.workspace', $query);
        if (! $cur['ok']) {
            return $cur['error'];
        }
        $bucket = (string) ($query['bucket'] ?? '');
        $duty = (string) ($query['duty'] ?? '');
        $uncertain = filter_var($query['uncertain_only'] ?? false, FILTER_VALIDATE_BOOLEAN);

        $q = DB::table('work_queue_items')->where('chapter_id', $chapterId)
            ->when(in_array($bucket, ['needs_my_action', 'waiting_on_others', 'resolved_history'], true), fn ($b) => $b->where('bucket', $bucket))
            ->when($duty !== '', fn ($b) => $b->where('required_duty', $duty))
            ->when($uncertain, fn ($b) => $b->where('is_uncertain_outcome', true))
            ->when($cur['after_id'] > 0, fn ($b) => $b->where('id', '>', $cur['after_id']))
            ->orderBy('id');

        $rows = $q->limit($cur['limit'] + 1)->get()->all();
        $hasMore = count($rows) > $cur['limit'];
        $slice = $hasMore ? array_slice($rows, 0, $cur['limit']) : $rows;
        $nextCursor = $hasMore ? ($cur['encode_cursor'])((int) end($slice)->id) : null;

        usort($slice, fn (object $a, object $b): int => ((int) $b->is_uncertain_outcome <=> (int) $a->is_uncertain_outcome)
            ?: ((int) $a->urgency_rank <=> (int) $b->urgency_rank)
            ?: ((int) $a->id <=> (int) $b->id));

        $queues = array_map(fn (object $i): array => [
            'item_id' => (string) $i->id, 'bucket' => (string) $i->bucket, 'source_module' => (string) $i->source_module,
            'item_kind' => (string) $i->item_kind, 'title' => (string) $i->title, 'description' => (string) $i->description,
            'required_duty' => (string) $i->required_duty, 'is_uncertain_outcome' => (bool) $i->is_uncertain_outcome,
            'urgency_rank' => (int) $i->urgency_rank, 'action_state' => (string) $i->action_state,
            'reference_code' => $i->reference_code, 'row_version' => (int) $i->row_version, 'occurred_at' => (string) $i->occurred_at,
        ], $slice);

        $jobs = DB::table('report_output_jobs')->where('chapter_id', $chapterId)->orderByDesc('id')->get()
            ->map(fn ($j): array => $this->jobDto($j))->values()->all();

        return ['http_status' => 200, 'body' => [
            'chapter_id' => (string) $chapterId,
            'role_focus' => ['primary_duty' => (string) ($actor['role_code'] ?? ''), 'duties' => $actor['duties'] ?? []],
            'stock_views' => $this->sevenStockViews($chapterId),
            'queue_items' => $queues, 'items' => $queues, 'next_cursor' => $nextCursor,
            'report_jobs' => $jobs, 'mutations_applied' => false,
        ]];
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function enqueueAlert(int $chapterId, array $actor, string $key, array $in): array
    {
        $bucket = (string) ($in['bucket'] ?? 'needs_my_action');
        $title = trim((string) ($in['title'] ?? ''));
        $duty = trim((string) ($in['required_duty'] ?? 'CHAPTER_HEAD'));
        if (! in_array($bucket, ['needs_my_action', 'waiting_on_others', 'resolved_history'], true) || $title === '' || $duty === '') {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Valid bucket, title, and required_duty are required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'reports.enqueue_alert', 'QueueEnqueue@p24.v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $in, $bucket, $title, $duty): array {
            if (($r = $this->outcomes->replay($chapterId, 'reports.enqueue_alert', $key, $hash)) !== null) {
                return $r;
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $id = DB::table('work_queue_items')->insertGetId([
                'chapter_id' => $chapterId, 'bucket' => $bucket, 'source_module' => trim((string) ($in['source_module'] ?? 'DocumentsReporting')),
                'item_kind' => trim((string) ($in['item_kind'] ?? 'action_alert')), 'title' => $title,
                'description' => trim((string) ($in['description'] ?? $title)), 'required_duty' => $duty,
                'is_uncertain_outcome' => (bool) ($in['is_uncertain_outcome'] ?? false),
                'urgency_rank' => max(1, min(255, (int) ($in['urgency_rank'] ?? 20))),
                'assigned_user_id' => isset($in['assigned_user_id']) ? (int) $in['assigned_user_id'] : null,
                'action_state' => 'pending', 'reference_code' => isset($in['reference_code']) ? trim((string) $in['reference_code']) : null,
                'row_version' => 1, 'occurred_at' => $now, 'created_at' => $now, 'updated_at' => $now,
            ]);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'reports.enqueue_alert', $key, $hash, 'QueueEnqueue@p24.v1',
                ChapterOutcomes::recordState((string) $id, 'QUEUE_ITEM', 1, 1, ['bucket' => $bucket]),
                ['queue_item' => ['item_id' => (string) $id, 'bucket' => $bucket, 'title' => $title, 'required_duty' => $duty,
                    'is_uncertain_outcome' => (bool) ($in['is_uncertain_outcome'] ?? false), 'row_version' => 1]],
                201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function generateReport(int $chapterId, array $actor, string $key, array $in): array
    {
        [$grp, $code, $basis, $fmt, $from, $to] = [
            (string) ($in['report_group'] ?? ''), trim((string) ($in['report_code'] ?? '')),
            (string) ($in['date_basis'] ?? ''), (string) ($in['format'] ?? ''),
            (string) ($in['period_from'] ?? ''), (string) ($in['period_to'] ?? ''),
        ];
        if (! isset(self::GROUP_DUTIES[$grp]) || $code === ''
            || ! in_array($basis, ['actual_occurrence', 'entry_verification_posting'], true)
            || ! in_array($fmt, ['pdf', 'csv'], true)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) !== 1 || preg_match('/^\d{4}-\d{2}-\d{2}$/', $to) !== 1 || $from > $to) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Valid report_group, report_code, date_basis, format, and YYYY-MM-DD period are required.');
        }

        /** @var list<string> $duties */
        $duties = $actor['duties'] ?? [];
        $allowed = self::GROUP_DUTIES[$grp];
        $matched = null;
        foreach ($allowed as $d) {
            if (in_array($d, $duties, true)) {
                $matched = $d;
                break;
            }
        }
        if ($matched === null) {
            return $this->outcomes->forbidden('FORBIDDEN', 'Your chapter duty cannot generate reports in this group.');
        }
        $reqDuty = (string) ($in['required_duty'] ?? $matched);
        if (! in_array($reqDuty, $allowed, true)) {
            $reqDuty = $matched;
        }

        $hash = ChapterOutcomes::fingerprint($chapterId, 'reports.generate', 'GenReport@p24.v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $in, $grp, $code, $basis, $fmt, $from, $to, $reqDuty): array {
            if (($r = $this->outcomes->replay($chapterId, 'reports.generate', $key, $hash)) !== null) {
                return $r;
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $fail = (bool) ($in['simulate_failure'] ?? false);
            $file = sprintf('%s-%s-%s.%s', strtolower((string) ($actor['chapter_code'] ?? 'ch')), strtolower(preg_replace('/[^A-Za-z0-9_-]/', '_', $code) ?? 'rep'), $basis, $fmt);
            $mime = $fmt === 'csv' ? 'text/csv; charset=UTF-8' : 'application/pdf';
            $content = $fail ? null : $this->renderOutput($chapterId, $code, $basis, $fmt, $from, $to, is_array($in['extra_rows'] ?? null) ? $in['extra_rows'] : []);

            $jobId = DB::table('report_output_jobs')->insertGetId([
                'chapter_id' => $chapterId, 'report_group' => $grp, 'report_code' => $code, 'date_basis' => $basis,
                'period_from' => $from, 'period_to' => $to, 'format' => $fmt, 'status' => $fail ? 'failed' : 'generated',
                'required_duty' => $reqDuty, 'requested_by_user_id' => (int) $actor['user_id'], 'reposted_effect' => false,
                'retry_count' => 0, 'row_version' => 1, 'file_name' => $file, 'mime_type' => $mime, 'content_text' => $content,
                'failure_reason' => $fail ? 'Temporary renderer interruption; safe to retry.' : null,
                'generated_at' => $fail ? null : $now, 'created_at' => $now, 'updated_at' => $now,
            ]);
            /** @var object $jobRow */
            $jobRow = DB::table('report_output_jobs')->where('id', $jobId)->first();
            $job = $this->jobDto($jobRow);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'reports.generate', $key, $hash, 'GenReport@p24.v1',
                ChapterOutcomes::recordState((string) $jobId, 'REPORT_JOB', 1, 1, ['status' => (string) $job['status']]),
                ['job' => $job, 'recoverable' => $fail], $fail ? 200 : 201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function retryReport(int $chapterId, array $actor, int $jobId, string $key, array $in = []): array
    {
        $hash = ChapterOutcomes::fingerprint($chapterId, 'reports.retry_job', 'RetryReport@p24.v1', ['job_id' => $jobId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $jobId, $key, $hash, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'reports.retry_job', $key, $hash)) !== null) {
                return $r;
            }
            $job = DB::table('report_output_jobs')->where('chapter_id', $chapterId)->where('id', $jobId)->lockForUpdate()->first();
            if ($job === null) {
                return $this->outcomes->blocked($chapterId, 404, 'JOB_NOT_FOUND', 'Report job not found.');
            }
            /** @var list<string> $duties */
            $duties = $actor['duties'] ?? [];
            if (! in_array((string) $job->required_duty, $duties, true) && ! in_array('CHAPTER_HEAD', $duties, true)) {
                return $this->outcomes->forbidden('DUTY_REVOKED_OR_MISSING', 'Current active duty no longer permits retrying this report.');
            }
            if ((string) $job->status !== 'failed') {
                return $this->outcomes->blocked($chapterId, 409, 'JOB_NOT_FAILED', 'Only failed report generation jobs can be retried.');
            }
            if (isset($in['expected_row_version']) && (int) $in['expected_row_version'] !== (int) $job->row_version) {
                return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $jobId, 'REPORT_JOB', (int) $job->row_version, 1, ['status' => (string) $job->status]));
            }

            $now = now()->format('Y-m-d H:i:s.u');
            $content = $this->renderOutput($chapterId, (string) $job->report_code, (string) $job->date_basis, (string) $job->format, (string) $job->period_from, (string) $job->period_to, []);
            $newVer = (int) $job->row_version + 1;
            DB::table('report_output_jobs')->where('id', $jobId)->update([
                'status' => 'retried', 'reposted_effect' => false, 'retry_count' => (int) $job->retry_count + 1, 'row_version' => $newVer,
                'content_text' => $content, 'failure_reason' => null, 'generated_at' => $now, 'updated_at' => $now,
            ]);
            /** @var object $jobRow */
            $jobRow = DB::table('report_output_jobs')->where('id', $jobId)->first();
            $dto = $this->jobDto($jobRow);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'reports.retry_job', $key, $hash, 'RetryReport@p24.v1',
                ChapterOutcomes::recordState((string) $jobId, 'REPORT_JOB', $newVer, 1, ['status' => 'retried']),
                ['reposted_effect' => false, 'job' => $dto]);
        }, 3);
    }

    /** @param array<int, mixed> $extra */
    private function renderOutput(int $chapterId, string $code, string $basis, string $fmt, string $from, string $to, array $extra): string
    {
        $views = $this->sevenStockViews($chapterId)['views'];
        if ($fmt === 'csv') {
            $lines = [
                $this->csvRow(['report_code', 'date_basis', 'period_from', 'period_to', 'metric_or_label', 'value']),
                $this->csvRow([$code, $basis, $from, $to, 'usable_on_hand_qty', (string) $views['usable_on_hand_qty']]),
                $this->csvRow([$code, $basis, $from, $to, 'available_to_allocate_qty', (string) $views['available_to_allocate_qty']]),
                $this->csvRow([$code, $basis, $from, $to, 'rf_reserved_qty', (string) $views['rf_reserved_qty']]),
                $this->csvRow([$code, $basis, $from, $to, 'so_reserved_qty', (string) $views['so_reserved_qty']]),
                $this->csvRow([$code, $basis, $from, $to, 'booth_custody_qty', (string) $views['booth_custody_qty']]),
                $this->csvRow([$code, $basis, $from, $to, 'quarantined_qty', (string) $views['quarantined_qty']]),
                $this->csvRow([$code, $basis, $from, $to, 'inbound_po_qty', (string) $views['inbound_po_qty']]),
            ];
            foreach ($extra as $row) {
                if (is_array($row)) {
                    $lines[] = $this->csvRow([$code, $basis, $from, $to, (string) ($row['label'] ?? 'note'), (string) ($row['value'] ?? '')]);
                }
            }

            return implode("\r\n", $lines)."\r\n";
        }

        $summary = sprintf('%s [%s] (%s..%s) avail=%s rf=%s so=%s booth=%s', $code, $basis, $from, $to, $views['available_to_allocate_qty'], $views['rf_reserved_qty'], $views['so_reserved_qty'], $views['booth_custody_qty']);

        return "%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>endobj\n4 0 obj<< /Length ".strlen($summary)." >>stream\n(".$summary.")\nendstream\nendobj\n%%EOF\n";
    }

    /** @param list<string> $fields */
    private function csvRow(array $fields): string
    {
        return implode(',', array_map(function (string $raw): string {
            $safe = preg_match('/^[=+\-@]/', $raw) === 1 ? "'".$raw : $raw;

            return '"'.str_replace('"', '""', $safe).'"';
        }, $fields));
    }

    /** @return array<string, mixed> */
    private function jobDto(object $j): array
    {
        return [
            'job_id' => (string) $j->id, 'chapter_id' => (string) $j->chapter_id, 'report_group' => (string) $j->report_group,
            'report_code' => (string) $j->report_code, 'date_basis' => (string) $j->date_basis, 'period_from' => (string) $j->period_from,
            'period_to' => (string) $j->period_to, 'format' => (string) $j->format, 'status' => (string) $j->status,
            'required_duty' => (string) $j->required_duty, 'reposted_effect' => (bool) $j->reposted_effect,
            'retry_count' => (int) $j->retry_count, 'row_version' => (int) $j->row_version,
            'file_name' => (string) $j->file_name, 'mime_type' => (string) $j->mime_type,
            'content_text' => $j->content_text, 'failure_reason' => $j->failure_reason, 'generated_at' => $j->generated_at,
        ];
    }
}

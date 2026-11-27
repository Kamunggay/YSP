<?php

namespace App\Services\Evidence;

use App\Models\EvidenceRecord;
use App\Services\Authority\ChapterAuthority;
use Illuminate\Support\Facades\DB;

final class StageTwoEvidenceTarget
{
    private const RULES = [
        'quotation_attachment' => [
            'repfs' => ['quotation.read', 'quotation.manage', ['approved', 'partially_ordered']],
            'purchase_orders' => ['po.read', 'po.acknowledge', ['issued', 'partially_received']],
        ],
        'po_supplier_dr' => [
            'receiving_reports' => ['receiving.read', 'receiving.match_evidence', ['draft', 'inspected', 'evidence_matched']],
        ],
        'da_acknowledgment' => [
            'donations' => ['da.read', 'da.acknowledge', ['pending_acknowledgment']],
        ],
        'da_receipt' => [
            'receiving_reports' => ['receiving.read', 'receiving.match_evidence', ['draft', 'inspected', 'evidence_matched']],
        ],
        'donor_restriction_resolution' => [
            'donations' => ['da.read', 'da.restriction_resolve', ['acknowledged', 'partially_received', 'received', 'closed_short']],
        ],
        'receiving_discrepancy' => [
            'receiving_discrepancies' => ['receiving.read', 'discrepancy.resolve', ['open', 'supplier_notified', 'under_review']],
        ],
        'missing_source_hold' => [
            'receiving_holds' => ['receiving.read', 'receiving.hold_manage', ['held']],
        ],
    ];

    public static function supports(string $purpose): bool
    {
        return isset(self::RULES[$purpose]);
    }

    public static function authorize(
        ChapterAuthority $authority,
        string $purpose,
        string $id,
        bool $editing,
        ?EvidenceRecord $evidence,
    ): ?bool {
        $chapter = $authority->chapter->id;
        $rules = self::RULES[$purpose];
        $permitted = array_filter($rules, fn ($rule) => $authority->allows($rule[$editing ? 1 : 0]));
        if ($permitted === []) {
            return null;
        }

        if (count($rules) > 1) {
            $matching = array_filter(array_keys($rules), fn ($table) => DB::table($table)->where('chapter_id', $chapter)->where('id', $id)->exists());
            if (count($matching) !== 1 || ! isset($permitted[reset($matching)])) {
                return null;
            }
            $permitted = array_intersect_key($permitted, array_flip($matching));
        }

        foreach ($permitted as $table => [, , $states]) {
            $query = DB::table($table)->where('chapter_id', $chapter)->where('id', $id);
            if ($table === 'receiving_reports') {
                $query->where('source_kind', $purpose === 'po_supplier_dr' ? 'po' : 'da');
            }
            $target = ($editing ? $query->lockForUpdate() : $query->sharedLock())->first();
            if (! $target) {
                continue;
            }
            $editable = in_array($target->status, $states, true);
            if ($editable && $editing && $evidence !== null) {
                $editable = match ($purpose) {
                    'quotation_attachment' => $table === 'repfs'
                        ? ! DB::table('repf_quotations')->where('chapter_id', $chapter)->where('repf_id', $id)
                            ->where('is_selected', true)->where('evidence_binding->evidence_id', $evidence->id)->sharedLock()->first(['id'])
                        : data_get(json_decode($target->acknowledgment ?? 'null', true), 'evidence_binding.evidence_id') !== $evidence->id,
                    'donor_restriction_resolution' => ! DB::table('donation_restriction_resolutions')->where('chapter_id', $chapter)
                        ->where('da_id', $id)->where('binding->evidence_id', $evidence->id)->sharedLock()->first(['id']),
                    default => true,
                };
            }

            return $editable;
        }

        return null;
    }
}

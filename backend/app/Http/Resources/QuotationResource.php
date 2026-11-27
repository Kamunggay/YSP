<?php

namespace App\Http\Resources;

use App\Models\RepfQuotation;
use App\Services\Authority\ChapterAuthority;

final class QuotationResource
{
    public static function format(RepfQuotation $quotation, ?ChapterAuthority $authority = null, bool $enforceEvidenceRead = true): array
    {
        $terms = $quotation->terms_json ?? [];
        $canReadEvidence = ! $enforceEvidenceRead || ($authority?->allows('evidence.read') ?? false);

        return [
            'id' => $quotation->id,
            'chapter_id' => $quotation->chapter_id,
            'repf_id' => $quotation->repf_id,
            'version' => (int) $quotation->version,
            'material_version' => (int) $quotation->material_version,
            'supplier' => $quotation->supplier,
            'quoted_at' => $terms['quoted_at'],
            'valid_until' => $terms['valid_until'] ?? null,
            'lead_time_days' => (int) $terms['lead_time_days'],
            'availability_summary' => $terms['availability_summary'],
            'quality_warranty_terms' => $terms['quality_warranty_terms'],
            'payment_and_delivery_terms' => $terms['payment_and_delivery_terms'],
            'reliability_notes' => $terms['reliability_notes'] ?? null,
            'currency' => 'PHP',
            'total_amount_php' => (string) $quotation->total_amount_php,
            'is_selected' => (bool) $quotation->is_selected,
            'selected_at' => $quotation->is_selected ? RepfResource::instant($quotation->selected_at) : null,
            'evidence_binding' => $canReadEvidence ? $quotation->evidence_binding : null,
            'recorded_by' => RepfResource::actor($quotation->recorder),
            'lines' => $quotation->lines,
            'created_at' => RepfResource::instant($quotation->created_at),
            'updated_at' => RepfResource::instant($quotation->updated_at),
        ];
    }

    public static function redactEvidence(array $quotation, ?ChapterAuthority $authority): array
    {
        if (isset($quotation['evidence_binding']) && ! ($authority?->allows('evidence.read') ?? false)) {
            $quotation['evidence_binding'] = null;
        }

        return $quotation;
    }
}

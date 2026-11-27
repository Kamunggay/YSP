<?php

namespace App\Http\Resources;

use App\Models\Donation;
use App\Models\DonationLine;
use App\Models\DonationRestrictionResolution;
use Brick\Math\BigDecimal;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Donation */
class DonationResource extends JsonResource
{
    public function __construct(
        Donation $resource,
        private readonly bool $includeEvidence = true,
    ) {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        return self::format($this->resource, $this->includeEvidence);
    }

    public static function format(Donation $donation, bool $includeEvidence = true): array
    {
        return [
            'da_id' => $donation->id,
            'chapter_id' => $donation->chapter_id,
            'version' => (int) $donation->version,
            'material_version' => (int) $donation->material_version,
            'status' => $donation->status,
            'reference' => $donation->reference,
            'prepared_by' => $donation->prepared_by,
            'donor_name' => $donation->donor_name,
            'lines' => $donation->lines->map(self::line(...))->values()->all(),
            'valuation_policy' => [
                'policy_id' => $donation->valuation_policy_id,
                'version' => (int) $donation->valuation_policy_version,
            ],
            'pledged_total_value_php' => (string) $donation->pledged_total_value_php,
            'acknowledgment' => $includeEvidence ? $donation->acknowledgment : null,
            'updated_at' => self::instant($donation->updated_at),
        ];
    }

    public static function line(DonationLine $line): array
    {
        return [
            'line_id' => $line->id,
            'variant_id' => $line->variant_id,
            'unit_id' => $line->unit_id,
            'pledged_quantity' => self::quantity($line, 'pledged_quantity'),
            'condition_notes' => $line->condition_notes,
            'valuation_kind' => $line->valuation_kind,
            'unit_value_php' => (string) $line->unit_value_php,
            'valuation_basis' => $line->valuation_basis,
            'restrictions' => $line->restrictions,
            'quantity_scale' => (int) $line->quantity_scale,
            'received_quantity' => self::quantity($line, 'received_quantity'),
            'outstanding_quantity' => self::quantity($line, 'outstanding_quantity'),
            'pledged_value_php' => (string) $line->pledged_value_php,
        ];
    }

    public static function acknowledgmentMaterial(Donation $donation): array
    {
        return [
            'chapter_id' => $donation->chapter_id,
            'da_id' => $donation->id,
            'material_version' => (int) $donation->material_version,
            'prepared_by' => $donation->prepared_by,
            'donor_name' => $donation->donor_name,
            'lines' => $donation->lines->map(fn (DonationLine $line) => [
                'line_id' => $line->id,
                'variant_id' => $line->variant_id,
                'unit_id' => $line->unit_id,
                'pledged_quantity' => self::quantity($line, 'pledged_quantity'),
                'condition_notes' => $line->condition_notes,
                'valuation_kind' => $line->valuation_kind,
                'unit_value_php' => (string) $line->unit_value_php,
                'valuation_basis' => $line->valuation_basis,
                'restrictions' => $line->restrictions,
                'quantity_scale' => (int) $line->quantity_scale,
                'pledged_value_php' => (string) $line->pledged_value_php,
            ])->values()->all(),
            'valuation_policy' => [
                'policy_id' => $donation->valuation_policy_id,
                'version' => (int) $donation->valuation_policy_version,
            ],
            'pledged_total_value_php' => (string) $donation->pledged_total_value_php,
        ];
    }

    public static function resolution(DonationRestrictionResolution $resolution): array
    {
        return [
            'resolution_id' => $resolution->id,
            'da_line_id' => $resolution->da_line_id,
            'reason' => $resolution->reason,
            'resolution_kind' => $resolution->resolution_kind,
            'restrictions' => $resolution->restrictions,
            'previous_restrictions' => $resolution->previous_restrictions,
            'actor_id' => $resolution->actor_id,
            'signed_at' => self::instant($resolution->signed_at),
            'committed_at' => self::instant($resolution->committed_at),
            'binding' => $resolution->binding,
            'snapshot' => $resolution->snapshot,
        ];
    }

    public static function quantity(DonationLine $line, string $field): string
    {
        return (string) BigDecimal::of($line->$field)->toScale((int) $line->quantity_scale);
    }

    public static function instant(?DateTimeInterface $at): ?string
    {
        return $at === null ? null : CarbonImmutable::instance($at)->utc()->format('Y-m-d\TH:i:s.u\Z');
    }
}

<?php

namespace App\Http\Resources;

use App\Models\RepfLine;
use App\Models\User;
use Brick\Math\BigDecimal;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RepfResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $review = $this->review_json ?? [];
        $lines = $this->lines->map(self::line(...))->all();

        return [
            'id' => $this->id,
            'chapter_id' => $this->chapter_id,
            'repf_reference' => $this->repf_reference,
            'status' => $this->status,
            'version' => $this->version,
            'material_version' => $this->material_version,
            'funding_source' => $this->funding_source,
            'urgency' => $this->urgency,
            'trigger_kinds' => array_values(array_unique(array_column($lines, 'trigger_kind'))),
            'justification' => $this->justification,
            'estimated_total_php' => $this->estimated_total_php,
            'approved_budget_php' => $this->approved_budget_php,
            'has_additional_purchase_override' => $this->lines->contains(fn (RepfLine $line) => $line->additional_purchase_reason !== null),
            'linked_demand_canceled' => $this->linked_demand_canceled,
            'preparer' => self::actor($this->preparer),
            'submitted_by' => $review['submitted_by'] ?? null,
            'submitted_at' => $review['submitted_at'] ?? null,
            'budget_reviewer' => $review['budget_reviewer'] ?? null,
            'budget_reviewed_at' => $review['budget_reviewed_at'] ?? null,
            'budget_decision' => $review['budget_decision'] ?? null,
            'budget_decision_reason' => $review['budget_decision_reason'] ?? null,
            'canceled_by' => $review['canceled_by'] ?? null,
            'canceled_at' => $review['canceled_at'] ?? null,
            'cancel_reason' => $review['cancel_reason'] ?? null,
            'lines' => $lines,
            'created_at' => self::instant($this->created_at),
            'updated_at' => self::instant($this->updated_at),
        ];
    }

    private static function line(RepfLine $line): array
    {
        $variant = $line->variant;

        return [
            'id' => $line->id,
            'line_number' => $line->line_number,
            'trigger_kind' => $line->trigger_kind,
            'item_id' => $line->item_id,
            'item_code' => $variant->item->code,
            'variant_id' => $line->variant_id,
            'variant_code' => $variant->code ?? $variant->sku,
            'display_name' => $variant->name ?? $variant->label ?? $variant->item->name,
            'unit_id' => $line->unit_id,
            'unit_code' => $line->unit->code,
            'quantity_scale' => $line->quantity_scale,
            'rf_id' => $line->rf_id,
            'rf_reference' => $line->rf_reference,
            'rf_line_id' => $line->rf_line_id,
            'rf_material_version' => $line->rf_material_version,
            'linked_demand_canceled' => $line->linked_demand_canceled,
            'linked_demand_canceled_at' => self::instant($line->linked_demand_canceled_at),
            'requested_quantity' => self::quantity($line, 'requested_quantity'),
            'ordered_quantity' => self::quantity($line, 'ordered_quantity'),
            'canceled_quantity' => self::quantity($line, 'canceled_quantity'),
            'remaining_to_order_quantity' => self::quantity($line, 'remaining_to_order_quantity'),
            'estimated_unit_cost_php' => $line->estimated_unit_cost_php,
            'estimated_line_total_php' => $line->estimated_line_total_php,
            'needed_by' => self::instant($line->needed_by),
            'net_need_breakdown' => $line->net_need_breakdown,
            'additional_purchase_reason' => $line->additional_purchase_reason,
            'notes' => $line->notes,
        ];
    }

    public static function quantity(RepfLine $line, string $field): string
    {
        return (string) BigDecimal::of($line->$field)->toScale($line->quantity_scale);
    }

    public static function actor(User $user): array
    {
        return ['user_id' => $user->id, 'display_name' => mb_substr(trim($user->name), 0, 120)];
    }

    public static function instant(?DateTimeInterface $at): ?string
    {
        return $at === null ? null : CarbonImmutable::instance($at)->utc()->format('Y-m-d\TH:i:s.u\Z');
    }
}

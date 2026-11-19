<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InternalRf extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'internal_rfs';

    protected $fillable = [
        'id',
        'chapter_id',
        'rf_number',
        'requester_user_id',
        'requesting_unit_id',
        'event_id',
        'purpose',
        'justification',
        'needed_at',
        'status',
        'fulfillment_status',
        'version',
        'material_version',
        'progress_version',
        'submitted_at',
        'approved_at',
        'approved_by_user_id',
        'approved_duty_grant_id',
        'approved_alternate_id',
        'approval_route_policy_id',
        'approved_material_version',
        'return_reason',
        'cancel_reason',
        'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'needed_at' => 'datetime',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
            'closed_at' => 'datetime',
            'version' => 'integer',
            'material_version' => 'integer',
            'progress_version' => 'integer',
            'approved_material_version' => 'integer',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(InternalRfLine::class, 'rf_id')->orderBy('line_order');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(InternalRfVersion::class, 'rf_id')->orderBy('version');
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(StockReservation::class, 'source_id')->where('source_type', 'RF');
    }

    public function actualIssues(): HasMany
    {
        return $this->hasMany(ActualIssue::class, 'requisition_id');
    }
}

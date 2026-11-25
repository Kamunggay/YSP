<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ActualIssue extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'material_version' => 'integer',
            'actual_handover_at' => 'datetime',
            'handed_over_at' => 'datetime',
            'acknowledged_at' => 'datetime',
            'entered_at' => 'datetime',
            'matched_at' => 'datetime',
            'posted_at' => 'datetime',
            'printed_at' => 'datetime',
            'recipient_accepts_partial' => 'boolean',
            'material_json' => 'array',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(ActualIssueLine::class, 'actual_issue_id');
    }

    public function reconciliations(): HasMany
    {
        return $this->hasMany(IssueReconciliation::class, 'actual_issue_id');
    }

    public function history(): HasMany
    {
        return $this->hasMany(ActualIssueHistory::class, 'actual_issue_id')->orderBy('version');
    }

    public function rf(): BelongsTo
    {
        return $this->belongsTo(InternalRf::class, 'requisition_id');
    }
}

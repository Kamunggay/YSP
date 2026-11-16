<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ActualIssue extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $casts = [
        'actual_handover_at' => 'datetime',
        'material_version' => 'integer',
    ];

    public function lines(): HasMany
    {
        return $this->hasMany(ActualIssueLine::class, 'actual_issue_id');
    }

    public function reconciliations(): HasMany
    {
        return $this->hasMany(IssueReconciliation::class, 'actual_issue_id');
    }
}

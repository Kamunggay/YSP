<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IssueReconciliation extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $casts = [
        'reconciled_at' => 'datetime',
    ];

    public function actualIssue(): BelongsTo
    {
        return $this->belongsTo(ActualIssue::class, 'actual_issue_id');
    }
}

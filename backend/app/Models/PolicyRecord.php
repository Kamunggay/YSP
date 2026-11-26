<?php

namespace App\Models;

use App\Services\Shared\CanonicalJson;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PolicyRecord extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected $casts = [
        'rules_json' => 'array',
        'effective_from' => 'datetime',
        'effective_until' => 'datetime',
    ];

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class, 'chapter_id');
    }

    public function setupEvidence(): array
    {
        $digest = CanonicalJson::sha256($this->rules_json);

        return AuditLog::where('chapter_id', $this->chapter_id)
            ->where('action', 'controlled:recordPolicy')->where('entity_id', $this->aggregate_id ?? $this->id)
            ->orderByDesc('created_at')->orderByDesc('id')->sharedLock()->get()
            ->first(fn (AuditLog $audit) => ($audit->details['version'] ?? null) === (int) $this->policy_version
                && ($audit->details['value_sha256'] ?? null) === $digest)?->details ?? [];
    }
}

<?php

namespace App\Models;

use App\Services\Shared\CanonicalJson;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DutyGrant extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected $casts = [
        'is_alternate' => 'boolean',
        'scope' => 'array',
        'valid_from' => 'datetime',
        'valid_until' => 'datetime',
    ];

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class, 'chapter_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function alternateDecisionScope(): ?string
    {
        if (! $this->is_alternate || ! in_array($this->duty_code, [
            'RF_APPROVER', 'CHAPTER_HEAD', 'FINANCE', 'BUDGET_APPROVER', 'INDEPENDENT_REVIEWER',
        ], true)) {
            return null;
        }

        $digest = $this->approvalDigest();

        return AuditLog::where('chapter_id', $this->chapter_id)
            ->where('action', 'controlled:setAlternate')->where('entity_id', $this->id)
            ->orderByDesc('created_at')->orderByDesc('id')->sharedLock()->get()
            ->first(fn (AuditLog $audit) => ($audit->details['grant_sha256'] ?? null) === $digest
                && collect($audit->details['approvals'] ?? [])->contains('authority', 'CHAPTER_HEAD'))
            ?->details['decision_scope_reference'] ?? null;
    }

    public function approvalDigest(): string
    {
        return CanonicalJson::sha256([
            $this->id, $this->chapter_id, $this->user_id, $this->duty_code, $this->replaces_user_id,
            $this->status, $this->scope, $this->valid_from?->toISOString(), $this->valid_until?->toISOString(),
            (int) $this->version,
        ]);
    }
}

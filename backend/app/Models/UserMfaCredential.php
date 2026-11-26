<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserMfaCredential extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $hidden = ['secret', 'encrypted_seed', 'recovery_codes'];

    protected $casts = [
        'encrypted_seed' => 'encrypted',
        'pending_expires_at' => 'immutable_datetime',
        'recovery_set_created_at' => 'immutable_datetime',
        'is_confirmed' => 'boolean',
        'recovery_codes' => 'array',
        'accepted_totp_steps' => 'array',
    ];

    public const PENDING_FIELDS = [
        'enrollment_id' => null,
        'pending_browser_session_id' => null,
        'pending_expires_at' => null,
    ];

    public function revokeRecoverySet(): void
    {
        BrowserMfaReceipt::eraseDelivery($this->recovery_set_id);
        $this->fill(['recovery_set_id' => null, 'recovery_set_created_at' => null, 'recovery_codes' => null]);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}

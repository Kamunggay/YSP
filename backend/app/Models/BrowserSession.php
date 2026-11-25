<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class BrowserSession extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $guarded = [];

    protected $hidden = ['token_hash', 'csrf_token', 'sign_in_receipt'];

    protected $casts = [
        'expires_at' => 'immutable_datetime',
        'authenticated_at' => 'immutable_datetime',
        'sign_in_receipt' => 'array',
    ];

    public function rotateToken(): string
    {
        $token = bin2hex(random_bytes(32));
        $this->token_hash = hash('sha256', $token);
        $this->csrf_token = bin2hex(random_bytes(32));

        return $token;
    }

    public function currentUser(): ?User
    {
        if (! $this->user_id) {
            return null;
        }

        return User::whereKey($this->user_id)
            ->whereIn('status', ['active', 'enabled'])
            ->where('version', $this->user_version)
            ->sharedLock()
            ->first();
    }

    public function refreshProgress(?User $user): bool
    {
        if (! $user) {
            if ($this->user_id) {
                $this->delete();
            }

            return false;
        }

        if ($this->next_step !== null) {
            return true;
        }

        if ($user->mfaCredential()->where('is_confirmed', true)->exists()) {
            $this->next_step = 'challenge_authenticator';
        } elseif ($this->requiresMfa($user)) {
            $this->next_step = 'enroll_authenticator';
        }

        if ($this->next_step !== null) {
            $this->authenticated_at = null;
            $this->expires_at = now()->startOfSecond()->addMinutes(10);
            $this->save();
        }

        return true;
    }

    public function projection(User $user): array
    {
        $data = [
            'state' => $this->next_step ? 'continuation' : 'authenticated',
            'user' => ['id' => $user->id, 'display_name' => $user->name],
            'expires_at' => $this->expires_at->toISOString(),
        ];

        return $data + ($this->next_step
            ? ['next_step' => $this->next_step]
            : [
                'authentication_method' => 'password',
                'mfa_required' => false,
                'authenticated_at' => $this->authenticated_at->toISOString(),
            ]);
    }

    private function requiresMfa(User $user): bool
    {
        $now = now();

        return DB::table('provider_role_grants')
            ->where('user_id', $user->id)
            ->whereIn('role_code', ['provisioner', 'billing_admin', 'recovery_operator'])
            ->where('starts_at', '<=', $now)
            ->whereNull('revoked_at')
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', $now))
            ->exists() || $user->dutyGrants()
            ->whereIn('duty_code', ['CHAPTER_HEAD', 'FINANCE', 'RF_APPROVER', 'SALES_REVIEWER', 'BUDGET_APPROVER'])
            ->where('status', 'active')
            ->where(fn (Builder $query) => $query->whereNull('valid_from')->orWhere('valid_from', '<=', $now))
            ->where(fn (Builder $query) => $query->whereNull('valid_until')->orWhere('valid_until', '>', $now))
            ->whereIn('chapter_id', $user->memberships()->where('membership_status', 'active')->select('chapter_id'))
            ->exists();
    }
}

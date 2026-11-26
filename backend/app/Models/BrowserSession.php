<?php

namespace App\Models;

use App\Services\Authority\ChapterAuthority;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
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

    public function mfaReceipts(): HasMany
    {
        return $this->hasMany(BrowserMfaReceipt::class);
    }

    public function clearPendingEnrollment(): void
    {
        UserMfaCredential::where('pending_browser_session_id', $this->id)->where('is_confirmed', false)
            ->update(UserMfaCredential::PENDING_FIELDS + ['encrypted_seed' => null]);
    }

    public function completeMfa(string $method): string
    {
        $this->next_step = null;
        $this->authentication_method = $method;
        $this->authenticated_at = now()->startOfSecond();
        $this->expires_at = $this->authenticated_at->addHours(2);
        $token = $this->rotateToken();
        $this->save();

        return $token;
    }

    public function rotateToken(): string
    {
        $token = bin2hex(random_bytes(32));
        $this->token_hash = hash('sha256', $token);
        $this->csrf_token = bin2hex(random_bytes(32));

        return $token;
    }

    public static function forToken(#[\SensitiveParameter] mixed $token, bool $includeExpired = false): ?self
    {
        return is_string($token) && preg_match('/\A[a-f0-9]{64}\z/', $token)
            ? self::where('token_hash', hash('sha256', $token))
                ->when(! $includeExpired, fn ($query) => $query->where('expires_at', '>', now()))
                ->lockForUpdate()->first()
            : null;
    }

    public function currentUser(bool $write = false): ?User
    {
        if (! $this->user_id) {
            return null;
        }

        $account = User::whereKey($this->user_id)
            ->whereIn('status', ['active', 'enabled'])
            ->where('version', $this->user_version);

        return ($write ? $account->lockForUpdate() : $account->sharedLock())->first();
    }

    public function acceptPassword(User $user, string $key, string $fingerprint): array
    {
        $this->authentication_method = 'password';
        $this->user_id = $user->id;
        $this->user_version = $user->version;
        $this->authenticated_at = now()->startOfSecond();
        $this->expires_at = $this->authenticated_at->addHours(2);
        $token = $this->rotateToken();
        $this->refreshProgress($user);
        $result = $this->projection($user);
        $this->sign_in_receipt = ['key' => $key, 'fingerprint' => $fingerprint, 'result' => $result];
        $this->save();

        return [$result, $token];
    }

    public function refreshProgress(?User $user): bool
    {
        if (! $user) {
            if ($this->user_id) {
                $this->clearPendingEnrollment();
                $this->delete();
            }

            return false;
        }

        if ($this->next_step !== null || $this->authentication_method !== 'password') {
            return true;
        }

        if ($user->mfaCredential()->where('is_confirmed', true)->sharedLock()->first(['id'])) {
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
                'authentication_method' => $this->authentication_method,
                'mfa_required' => $this->authentication_method !== 'password' && $this->requiresMfa($user),
                'authenticated_at' => $this->authenticated_at->toISOString(),
            ]);
    }

    private function requiresMfa(User $user): bool
    {
        $now = now()->format('Y-m-d H:i:s.u');

        return DB::table('provider_role_grants')
            ->where('user_id', $user->id)
            ->whereIn('role_code', ['provisioner', 'billing_admin', 'recovery_operator'])
            ->where('starts_at', '<=', $now)
            ->whereNull('revoked_at')
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', $now))
            ->sharedLock()->first(['id']) !== null
            || ChapterAuthority::setupEntitlements($user->id)
                ->whereIn('chapter_id', Chapter::whereIn('status', ChapterAuthority::AVAILABLE_CHAPTERS)->select('id'))
                ->sharedLock()->first(['id']) !== null
            || $user->dutyGrants()
                ->whereIn('duty_code', ['CHAPTER_HEAD', 'FINANCE', 'RF_APPROVER', 'SALES_REVIEWER', 'BUDGET_APPROVER'])
                ->where('status', 'active')
                ->where(fn (Builder $query) => $query->whereNull('valid_from')->orWhere('valid_from', '<=', $now))
                ->where(fn (Builder $query) => $query->whereNull('valid_until')->orWhere('valid_until', '>', $now))
                ->whereIn('chapter_id', $user->memberships()->current()
                    ->whereHas('chapter', fn (Builder $query) => $query->whereIn('status', ChapterAuthority::AVAILABLE_CHAPTERS))
                    ->select('chapter_id'))
                ->sharedLock()->first(['id']) !== null;
    }
}

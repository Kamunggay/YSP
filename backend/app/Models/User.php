<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class User extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $hidden = [
        'password_hash',
    ];

    public function memberships(): HasMany
    {
        return $this->hasMany(ChapterMembership::class, 'user_id');
    }

    public function dutyGrants(): HasMany
    {
        return $this->hasMany(DutyGrant::class, 'user_id');
    }

    public function mfaCredential(): HasOne
    {
        return $this->hasOne(UserMfaCredential::class, 'user_id');
    }
}

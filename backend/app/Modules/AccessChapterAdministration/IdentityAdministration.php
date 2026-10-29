<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use App\Modules\DocumentsReporting\SecurityHistory;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class IdentityAdministration
{
    public function __construct(private SecurityHistory $history) {}

    /**
     * @throws QueryException
     */
    public function createIdentity(string $name, string $email, string $passwordHash, string $operatorReference): string
    {
        return DB::transaction(function () use ($name, $email, $passwordHash, $operatorReference): string {
            DB::table('users')->insert([
                'public_id' => (string) Str::ulid(),
                'name' => $name,
                'email' => $email,
                'email_key' => $email,
                'password_hash' => $passwordHash,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $id = (string) DB::connection()->getPdo()->lastInsertId();
            $this->history->identityCreated($id, $operatorReference);

            return $id;
        });
    }
}

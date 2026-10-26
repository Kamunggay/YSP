<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Modules\DocumentsReporting\SecurityHistory;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class CreateIdentity extends Command
{
    protected $signature = 'identity:create';

    protected $description = 'Create only an identity in a restricted account-holder terminal session';

    public function handle(SecurityHistory $history): int
    {
        if (! $this->input->isInteractive() || ! stream_isatty(STDIN)) {
            $this->error('An interactive terminal with hidden input is required.');

            return self::FAILURE;
        }
        $operator = trim((string) $this->ask('Operator audit reference'));
        if ($operator === '' || mb_strlen($operator) > 160 || preg_match('/[\x00-\x1F\x7F]/', $operator)) {
            $this->error('A technical operator identity or terminal audit reference is required.');

            return self::FAILURE;
        }
        $name = trim((string) $this->ask('Display name'));
        $email = strtolower(trim((string) $this->ask('Email')));
        if ($name === '' || mb_strlen($name) > 160 || strlen($email) > 254 || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('Check the display name and email.');

            return self::FAILURE;
        }
        $password = $this->secret('Password', false);
        $confirmation = $this->secret('Confirm password', false);
        if (! is_string($password) || strlen($password) < 12 || strlen($password) > 72 || $password !== $confirmation) {
            $this->error('Passwords must match and contain 12 to 72 bytes.');

            return self::FAILURE;
        }
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        unset($password, $confirmation);
        try {
            $id = DB::transaction(function () use ($name, $email, $hash, $history, $operator): string {
                DB::table('users')->insert([
                    'public_id' => (string) Str::ulid(), 'name' => $name,
                    'email' => $email, 'email_key' => $email, 'password_hash' => $hash,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
                $id = DB::connection()->getPdo()->lastInsertId();
                $history->identityCreated($id, $operator);

                return $id;
            });
        } catch (QueryException) {
            $this->error('Identity creation failed; check the login and database availability.');

            return self::FAILURE;
        }
        $this->info('Identity created: '.$id);

        return self::SUCCESS;
    }
}

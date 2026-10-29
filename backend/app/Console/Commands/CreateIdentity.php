<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Modules\AccessChapterAdministration\IdentityAdministration;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;

final class CreateIdentity extends Command
{
    protected $signature = 'identity:create';

    protected $description = 'Create only an identity in a restricted account-holder terminal session';

    public function handle(IdentityAdministration $identities): int
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
        $cost = (int) env('BCRYPT_ROUNDS', app()->environment('production') ? 12 : 4);
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => $cost]);
        unset($password, $confirmation);
        try {
            $id = $identities->createIdentity($name, $email, $hash, $operator);
        } catch (QueryException) {
            $this->error('Identity creation failed; check the login and database availability.');

            return self::FAILURE;
        }
        $this->info('Identity created: '.$id);

        return self::SUCCESS;
    }
}

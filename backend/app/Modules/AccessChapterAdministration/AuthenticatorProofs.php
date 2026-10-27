<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use OTPHP\InternalClock;
use OTPHP\TOTP;

final class AuthenticatorProofs
{
    public function accepts(string $ciphertext, string $code, CarbonImmutable $now, ?int $lastStep = null): bool
    {
        $step = intdiv($now->getTimestamp(), 30);

        return ($lastStep === null || $step > $lastStep)
            && TOTP::createFromSecret(Crypt::decryptString($ciphertext), new InternalClock)
                ->verify($code, $now->getTimestamp());
    }

    /** @return list<string> */
    public function issueCodes(string $userId, CarbonImmutable $now): array
    {
        $codes = [];
        for ($i = 0; $i < 10; $i++) {
            do {
                $code = '';
                for ($j = 0; $j < 16; $j++) {
                    // random_int uses uniform CSPRNG range sampling, without modulo bias.
                    $code .= 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[random_int(0, 35)];
                }
                $code = implode('-', str_split($code, 4));
            } while (in_array($code, $codes, true));
            $codes[] = $code;
            // High-entropy verifiers match the schema's individually hashed BINARY(32) contract.
            DB::table('user_recovery_codes')->insert(['user_id' => $userId,
                'code_hash' => hash('sha256', $code, true), 'issued_at' => $now]);
        }

        return $codes;
    }
}

<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Modules\AccessChapterAdministration\MembershipCandidates;
use Illuminate\Console\Command;
use Throwable;

final class AuthorizeMembershipCandidate extends Command
{
    protected $signature = 'candidate:authorize-membership';

    protected $description = 'Record independently verified chapter/purpose membership candidate approval';

    public function handle(MembershipCandidates $candidates): int
    {
        if (! $this->input->isInteractive() || ! stream_isatty(STDIN)) {
            $this->error('An interactive terminal is required.');

            return self::FAILURE;
        }
        $path = (string) $this->ask('Approval document path');
        $executor = (string) $this->ask('Technical executor identity ID');
        $operator = (string) $this->ask('Operator audit reference');
        if ($this->ask('Approval independently verified (yes/no)') !== 'yes') {
            $this->error('Verified independent approval is required.');

            return self::FAILURE;
        }
        try {
            $candidates->authorize($path, $executor, $operator);
        } catch (Throwable) {
            $this->error('Candidate authorization rejected; check approval and attribution.');

            return self::FAILURE;
        }
        $this->info('Membership candidate authorized.');

        return self::SUCCESS;
    }
}

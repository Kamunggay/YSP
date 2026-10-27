<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Modules\AccessChapterAdministration\InitialHeadApproval;
use Illuminate\Console\Command;
use Throwable;

final class AuthorizeInitialHeadCandidate extends Command
{
    protected $signature = 'candidate:authorize-initial-head';

    protected $description = 'Record verified organization/purpose approval for an initial Head candidate';

    public function handle(InitialHeadApproval $approvals): int
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
            $approval = $approvals->read($path, 'initial_head_appointment', $executor, $operator);
            $approvals->authorizeCandidate($approval, $executor, $operator);
        } catch (Throwable) {
            $this->error('Candidate authorization rejected; check approval and attribution.');

            return self::FAILURE;
        }
        $this->info('Initial Head candidate authorized.');

        return self::SUCCESS;
    }
}

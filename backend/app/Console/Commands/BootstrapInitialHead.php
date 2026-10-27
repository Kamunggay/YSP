<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Modules\AccessChapterAdministration\InitialHeadApproval;
use App\Modules\AccessChapterAdministration\InitialHeadBootstrap;
use Illuminate\Console\Command;
use Throwable;

final class BootstrapInitialHead extends Command
{
    protected $signature = 'chapter:bootstrap-initial-head';

    protected $description = 'Record separately approved first Chapter Head membership and duty once';

    public function handle(InitialHeadApproval $approvals, InitialHeadBootstrap $bootstrap): int
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
            $approval = $approvals->read($path, 'initial_head_membership', $executor, $operator);
            $result = $bootstrap->install($approval, $executor, $operator);
        } catch (Throwable) {
            $this->error('Initial Head bootstrap rejected; check designation, eligibility, approval and prior bootstrap.');

            return self::FAILURE;
        }
        $this->info('Bootstrap result: '.json_encode($result, JSON_THROW_ON_ERROR));

        return self::SUCCESS;
    }
}

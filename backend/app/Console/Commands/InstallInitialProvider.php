<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Modules\AccessChapterAdministration\InitialProviderAuthority;
use Illuminate\Console\Command;
use Throwable;

final class InstallInitialProvider extends Command
{
    protected $signature = 'provider:install-initial';

    protected $description = 'Record independently approved initial provisioner authority from a restricted terminal';

    public function handle(InitialProviderAuthority $authority): int
    {
        if (! $this->input->isInteractive() || ! stream_isatty(STDIN)) {
            $this->error('An interactive terminal is required.');

            return self::FAILURE;
        }
        $operator = (string) $this->ask('Operator audit reference');
        $provider = (string) $this->ask('Provider identity ID');
        $organization = (string) $this->ask('Organization ID');
        $approver = (string) $this->ask('Independent approver identity ID');
        $approval = (string) $this->ask('Approval evidence reference');
        foreach ([$provider, $organization, $approver] as $id) {
            if (! preg_match('/^[1-9][0-9]{0,19}$/D', $id) || (strlen($id) === 20 && strcmp($id, '18446744073709551615') > 0)) {
                $this->error('Check the installation references.');

                return self::FAILURE;
            }
        }
        if (trim($operator) === '' || mb_strlen($operator) > 160 || trim($approval) === '' || mb_strlen($approval) > 500
            || preg_match('/[\x00-\x1F\x7F]/', $operator.$approval)) {
            $this->error('Operator and independent approval evidence references are required.');

            return self::FAILURE;
        }
        try {
            $authority->install($provider, $organization, $approver, $operator, $approval);
        } catch (Throwable) {
            $this->error('Initial authority cannot be installed; check approval, identity, organization and prior installation.');

            return self::FAILURE;
        }
        $this->info('Initial provider authority installed.');

        return self::SUCCESS;
    }
}

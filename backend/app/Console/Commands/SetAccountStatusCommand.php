<?php

namespace App\Console\Commands;

class SetAccountStatusCommand extends BaseControlledCommand
{
    protected const PROCEDURE = 'setAccountStatus';

    protected $signature = 'app:set-account-status {--payload= : Setup intent JSON} {--file= : Path to setup intent JSON}';
}

<?php

namespace App\Console\Commands;

class ResetMfaCommand extends BaseControlledCommand
{
    protected const PROCEDURE = 'resetMfa';

    protected $signature = 'app:reset-mfa {--payload= : Setup intent JSON} {--file= : Path to setup intent JSON}';
}

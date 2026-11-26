<?php

namespace App\Console\Commands;

class PrepareAccountCommand extends BaseControlledCommand
{
    protected const PROCEDURE = 'prepareAccount';

    protected $signature = 'app:prepare-account {--payload= : Setup intent JSON} {--file= : Path to setup intent JSON}';
}

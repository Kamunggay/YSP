<?php

namespace App\Console\Commands;

class SetAlternateCommand extends BaseControlledCommand
{
    protected const PROCEDURE = 'setAlternate';

    protected $signature = 'app:set-alternate {--payload= : Setup intent JSON} {--file= : Path to setup intent JSON}';
}

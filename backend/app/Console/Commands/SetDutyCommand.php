<?php

namespace App\Console\Commands;

class SetDutyCommand extends BaseControlledCommand
{
    protected const PROCEDURE = 'setDuty';

    protected $signature = 'app:set-duty {--payload= : Setup intent JSON} {--file= : Path to setup intent JSON}';
}

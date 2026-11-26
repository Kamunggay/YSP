<?php

namespace App\Console\Commands;

class RecordPolicyCommand extends BaseControlledCommand
{
    protected const PROCEDURE = 'recordPolicy';

    protected $signature = 'app:record-policy {--payload= : Setup intent JSON} {--file= : Path to setup intent JSON}';
}

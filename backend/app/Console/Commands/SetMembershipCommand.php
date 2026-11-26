<?php

namespace App\Console\Commands;

class SetMembershipCommand extends BaseControlledCommand
{
    protected const PROCEDURE = 'setMembership';

    protected $signature = 'app:set-membership {--payload= : Setup intent JSON} {--file= : Path to setup intent JSON}';
}

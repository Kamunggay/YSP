<?php

namespace App\Console\Commands;

class PrepareChapterCommand extends BaseControlledCommand
{
    protected const PROCEDURE = 'prepareChapter';

    protected $signature = 'app:prepare-chapter {--payload= : Setup intent JSON} {--file= : Path to setup intent JSON}';
}

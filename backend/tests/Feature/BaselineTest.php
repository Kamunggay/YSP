<?php

declare(strict_types=1);

namespace Tests\Feature;

use Symfony\Component\Process\Process;
use Tests\TestCase;

final class BaselineTest extends TestCase
{
    public function test_unsupported_database_configuration_fails_without_internal_detail(): void
    {
        $verify = new Process(
            [PHP_BINARY, 'artisan', 'baseline:verify', '--no-ansi'],
            base_path(),
            ['DB_CONNECTION' => 'sqlite'],
        );
        $verify->run();

        $this->assertSame(1, $verify->getExitCode());
        $this->assertSame(
            'Baseline verification failed; check local configuration and migrations.',
            trim($verify->getOutput()),
        );
        $this->assertSame('', $verify->getErrorOutput());
    }

    public function test_baseline_reports_the_migrated_mysql_checkpoint(): void
    {
        $migrate = new Process([PHP_BINARY, 'artisan', 'migrate', '--force'], base_path());
        $migrate->mustRun();
        $verify = new Process([PHP_BINARY, 'artisan', 'baseline:verify'], base_path());
        $verify->run();

        $this->assertSame(0, $verify->getExitCode(), $verify->getOutput());
        $identity = json_decode($verify->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame('MySQL', $identity['database']);
        $this->assertSame('InnoDB', $identity['engine']);
        $this->assertSame('2026_10_28_000015_create_chapter_membership_operations', $identity['migration']);
        $this->assertCount(16, $identity['migrations']);
        $this->assertCount(29, $identity['tables']);
        $this->assertStringStartsWith('8.4.', $identity['version']);
    }
}

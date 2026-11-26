<?php

namespace App\Console\Commands;

use App\Http\Requests\AuthInput;
use App\Services\Authority\ControlledSetup;
use Illuminate\Console\Command;
use Illuminate\Http\Request;
use JsonException;

abstract class BaseControlledCommand extends Command
{
    protected const PROCEDURE = '';

    public function handle(ControlledSetup $setup): int
    {
        $file = $this->option('file');
        $payload = $this->option('payload');
        $body = null;
        try {
            if ($file === null || $payload === null) {
                $json = $file !== null && is_file($file) && is_readable($file) ? @file_get_contents($file) : $payload;
                if (is_string($json)) {
                    $body = AuthInput::decode(new Request(content: $json));
                }
            }
        } catch (JsonException) {
            // The procedure returns its normal invalid-input receipt.
        }

        $token = $this->input->isInteractive() ? $this->secret('Authenticated browser session token', false) : null;
        $result = $setup->execute(static::PROCEDURE, $body, $token);
        $this->line(json_encode($result, JSON_THROW_ON_ERROR));

        return $result['outcome'] === 'rejected' ? self::FAILURE : self::SUCCESS;
    }
}

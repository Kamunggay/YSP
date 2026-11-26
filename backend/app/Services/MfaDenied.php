<?php

namespace App\Services;

use RuntimeException;

class MfaDenied extends RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $error, string $message)
    {
        parent::__construct($message);
    }
}

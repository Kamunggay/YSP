<?php

namespace App\Exceptions;

use RuntimeException;

class ContractException extends RuntimeException
{
    /**
     * @param  array<string, mixed>  $extra
     */
    public function __construct(
        public readonly int $statusCode,
        public readonly string $errorCode,
        string $message,
        public readonly array $extra = [],
    ) {
        parent::__construct($message);
    }

    public function toArray(?string $requestId = null): array
    {
        $payload = [
            'error' => [
                'code' => $this->errorCode,
                'message' => $this->getMessage(),
            ],
        ];

        if ($requestId !== null) {
            $payload['request_id'] = $requestId;
        }

        foreach ($this->extra as $k => $v) {
            $payload[$k] = $v;
        }

        return $payload;
    }
}

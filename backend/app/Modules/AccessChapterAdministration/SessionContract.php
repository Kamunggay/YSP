<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Illuminate\Http\JsonResponse;

final class SessionContract
{
    /** @var array<string, mixed> */
    private array $metadata;

    public function __construct()
    {
        $this->metadata = json_decode((string) file_get_contents(resource_path('contracts/session-runtime.json')), true, flags: JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> */
    public function metadata(): array
    {
        return $this->metadata;
    }

    public function failure(string $definition, int $status, ?string $code = null): JsonResponse
    {
        $properties = $this->metadata['$defs'][$definition]['properties'];

        return response()->json([
            'code' => $code ?? $properties['code']['const'],
            'message' => $properties['message']['const'],
        ], $status);
    }
}

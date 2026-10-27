<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use App\Modules\DocumentsReporting\CanonicalRequest;
use RuntimeException;
use stdClass;

final class CanonicalApprovalDecoder
{
    /** @return array<string, mixed> */
    public function decode(string $json): array
    {
        $value = app(CanonicalRequest::class)->decode($json);
        if (! $value instanceof stdClass) {
            throw new RuntimeException('Approval must be an object.');
        }

        return get_object_vars($value);
    }
}

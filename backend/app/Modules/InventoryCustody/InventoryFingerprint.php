<?php

declare(strict_types=1);

namespace App\Modules\InventoryCustody;

use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) encoder, SHA-256 helpers, and Crockford ULID generator.
 */
final class InventoryFingerprint
{
    public static function canonicalJson(mixed $value): string
    {
        if (is_float($value) && ! is_finite($value)) {
            throw new InvalidArgumentException('Non-finite numbers cannot be serialized to JCS.');
        }
        if ($value === null || is_scalar($value)) {
            return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        $arr = is_object($value) ? get_object_vars($value) : (is_array($value) ? $value : throw new InvalidArgumentException('Unsupported type for JCS canonicalization.'));
        if (array_is_list($arr)) {
            return '['.implode(',', array_map(self::canonicalJson(...), $arr)).']';
        }
        uksort($arr, static fn (string|int $a, string|int $b): int => strcmp(
            mb_convert_encoding((string) $a, 'UTF-16BE', 'UTF-8'),
            mb_convert_encoding((string) $b, 'UTF-16BE', 'UTF-8')
        ));
        $pairs = [];
        foreach ($arr as $k => $v) {
            $pairs[] = json_encode((string) $k, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE).':'.self::canonicalJson($v);
        }

        return '{'.implode(',', $pairs).'}';
    }

    public static function sha256Hex(mixed $value): string
    {
        return hash('sha256', self::canonicalJson($value));
    }

    public static function sha256Binary(mixed $value): string
    {
        return hash('sha256', self::canonicalJson($value), true);
    }

    public static function newPublicId(): string
    {
        return (string) Str::ulid();
    }
}

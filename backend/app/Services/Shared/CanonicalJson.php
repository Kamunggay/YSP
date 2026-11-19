<?php

namespace App\Services\Shared;

class CanonicalJson
{
    /**
     * Deterministic RFC8785-style canonical JSON serialization.
     * Recursively sorts associative array keys while preserving sequential list order.
     */
    public static function encode(mixed $value): string
    {
        $normalized = self::normalize($value);

        return json_encode($normalized, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /**
     * Compute deterministic SHA-256 hex digest of a canonical JSON payload.
     */
    public static function sha256(mixed $value): string
    {
        return hash('sha256', self::encode($value));
    }

    private static function normalize(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        if (array_is_list($value)) {
            return array_map(fn (mixed $item) => self::normalize($item), $value);
        }

        ksort($value, SORT_STRING);
        foreach ($value as $key => $item) {
            $value[$key] = self::normalize($item);
        }

        return $value;
    }
}

<?php

declare(strict_types=1);

namespace App\Modules\DocumentsReporting;

use JsonException;
use stdClass;

final class CanonicalRequest
{
    public function decode(string $json): mixed
    {
        $value = json_decode($json, false, 32, JSON_THROW_ON_ERROR);
        // JSON is already syntactically valid. Inspect decoded member names,
        // including escaped spellings, before json_decode can hide duplicates.
        $tokens = preg_match_all('/"(?:[^"\\\\]|\\\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/us', $json, $matches);
        if ($tokens === false) {
            throw new JsonException('JSON member validation failed.');
        }
        $stack = [];
        foreach ($matches[0] as $index => $token) {
            if ($token === '{') {
                $stack[] = [];
            } elseif ($token === '}') {
                array_pop($stack);
            } elseif (str_starts_with($token, '"') && ($matches[0][$index + 1] ?? '') === ':') {
                $key = json_decode($token, true, flags: JSON_THROW_ON_ERROR);
                $last = count($stack) - 1;
                if (isset($stack[$last][$key])) {
                    throw new JsonException('Duplicate JSON member.');
                }
                $stack[$last][$key] = true;
            }
        }

        return $value;
    }

    public function fingerprint(stdClass $scope, stdClass $body): string
    {
        // The owning schema allows only objects, strings and bounded integers:
        // this is the JCS subset with no floating-point or array normalization.
        return hash('sha256', $this->encode((object) [
            'scope' => $scope, 'action_code' => 'provider.chapters.create', 'provisioning_id' => null,
            'input_schema' => 'CreateProvisionedChapterRequest@p02.09-review.1', 'body' => $body,
        ]));
    }

    private function encode(mixed $value): string
    {
        if ($value instanceof stdClass) {
            $members = get_object_vars($value);
            ksort($members, SORT_STRING);
            $pairs = [];
            foreach ($members as $key => $member) {
                $pairs[] = $this->encode((string) $key).':'.$this->encode($member);
            }

            return '{'.implode(',', $pairs).'}';
        }

        return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR);
    }
}

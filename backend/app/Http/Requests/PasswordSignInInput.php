<?php

namespace App\Http\Requests;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use JsonException;
use stdClass;

class PasswordSignInInput
{
    public static function decode(Request $request): mixed
    {
        $json = $request->getContent();
        $body = json_decode($json, flags: JSON_THROW_ON_ERROR);

        // JSON decoding silently drops duplicate properties.
        if (preg_match_all('/("(?:[^"\\\\]++|\\\\.)*+")(\s*:)?|([{}])/s', $json, $tokens, PREG_SET_ORDER | PREG_UNMATCHED_AS_NULL) === false) {
            throw new JsonException('Could not validate JSON properties.');
        }
        $objects = [];
        foreach ($tokens as [, $string, $colon, $brace]) {
            if ($brace === '{') {
                $objects[] = [];
            } elseif ($brace === '}') {
                array_pop($objects);
            } elseif ($colon !== null) {
                $key = json_decode($string, flags: JSON_THROW_ON_ERROR);
                $index = array_key_last($objects);
                if (isset($objects[$index][$key])) {
                    throw new JsonException('Duplicate JSON property.');
                }
                $objects[$index][$key] = true;
            }
        }

        return $body;
    }

    public static function errors(mixed $body): array
    {
        if (! $body instanceof stdClass) {
            return [['pointer' => '', 'code' => 'invalid_type', 'message' => 'Request must be a JSON object.']];
        }

        $values = (array) $body;
        $fields = [];
        $limits = ['login' => 254, 'password' => 1024];
        foreach ($limits as $key => $limit) {
            $code = match (true) {
                ! array_key_exists($key, $values) => 'required',
                ! is_string($values[$key]) => 'invalid_type',
                $values[$key] === '' || ($key === 'login' && trim($values[$key]) === '') => 'invalid_format',
                mb_strlen($values[$key]) > $limit => 'too_long',
                $key === 'login' && Validator::make(['login' => $values[$key]], ['login' => 'email:rfc'])->fails() => 'invalid_format',
                default => null,
            };
            if ($code !== null) {
                $fields[] = ['pointer' => '/'.$key, 'code' => $code, 'message' => 'Supply a valid '.$key.'.'];
            }
        }
        foreach (array_diff_key($values, $limits) as $key => $unused) {
            $fields[] = [
                'pointer' => '/'.str_replace(['~', '/'], ['~0', '~1'], (string) $key),
                'code' => 'unexpected_field',
                'message' => 'This field is not accepted.',
            ];
        }

        return $fields;
    }
}

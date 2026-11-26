<?php

namespace App\Http\Requests;

use App\Exceptions\ContractException;
use Illuminate\Http\Request;

final class PaperEvidenceUpload
{
    public const FILE_LIMIT = 10 * 1024 * 1024;

    private const BODY_LIMIT = 64 * 1024 * 1024;

    private const MAX_ATTACHMENTS = 256;

    /** @param list<array{media_type: string, bytes: string}> $files */
    private function __construct(
        public readonly string $key,
        public readonly string $purpose,
        public readonly string $recordId,
        public readonly array $files,
    ) {}

    public static function parse(Request $request): self
    {
        $keys = $request->headers->all('X-Action-Key');
        if (count($keys) !== 1 || ! preg_match(AuthInput::UUID, $keys[0]) || $request->server('QUERY_STRING', '') !== '') {
            throw self::malformed();
        }

        $type = $request->header('Content-Type', '');
        if (strtolower(trim(explode(';', $type, 2)[0])) !== 'multipart/form-data') {
            throw new ContractException(415, 'unsupported_media_type', 'Use multipart/form-data.');
        }
        if (! preg_match('~\Amultipart/form-data\s*;\s*boundary=(?:"([^"\r\n]{1,70})"|([A-Za-z0-9\'()+_,./:=?-]{1,70}))\s*\z~i', $type, $match)) {
            throw self::malformed();
        }

        $input = $request->getContent(true);
        try {
            $body = stream_get_contents($input, self::BODY_LIMIT + 1);
        } finally {
            fclose($input);
        }
        if ($body === false) {
            throw new ContractException(503, 'evidence_unavailable', 'Evidence input is temporarily unavailable.');
        }
        if (strlen($body) > self::BODY_LIMIT) {
            throw self::tooLarge();
        }

        $boundary = '--'.($match[2] ?? $match[1]);
        $separator = '~\r\n'.preg_quote($boundary, '~').'(?=\r\n|--(?:\r\n|\z))~';
        if (! str_starts_with($body, $boundary)) {
            throw self::malformed();
        }
        $metadata = [];
        $files = [];
        $offset = strlen($boundary);
        while (substr($body, $offset, 2) !== '--') {
            if (substr($body, $offset, 2) !== "\r\n"
                || ! preg_match($separator, $body, $next, PREG_OFFSET_CAPTURE, $offset + 2)) {
                throw self::malformed();
            }
            $end = $next[0][1];
            $headerStart = $offset + 2;
            $headerEnd = strpos($body, "\r\n\r\n", $headerStart);
            if ($headerEnd === false || $headerEnd - $headerStart > 8192 || $headerEnd + 4 > $end) {
                throw self::malformed();
            }
            [$name, $filename, $mediaType] = self::partHeaders(substr($body, $headerStart, $headerEnd - $headerStart));
            $start = $headerEnd + 4;
            $length = $end - $start;
            $offset = $end + 2 + strlen($boundary);
            $pointer = '/'.str_replace(['~', '/'], ['~0', '~1'], $name);

            if ($name === 'attachments') {
                $pointer .= '/'.count($files);
                if ($filename === null || $filename === '' || $mediaType === null) {
                    throw self::invalid($pointer, 'invalid_field', 'Supply a file with a filename and media type.');
                }
                if ($length > self::FILE_LIMIT || count($files) >= self::MAX_ATTACHMENTS) {
                    throw self::tooLarge();
                }
                if ($length === 0) {
                    throw self::invalid($pointer, 'empty_file', 'Supply a nonempty file.');
                }
                $files[] = ['media_type' => $mediaType, 'bytes' => substr($body, $start, $length)];
            } else {
                if (! in_array($name, ['purpose', 'record_id'], true) || isset($metadata[$name])
                    || $filename !== null || ($mediaType !== null && ! preg_match('~\Atext/plain(?:\s*;\s*charset="?utf-8"?)?\z~i', $mediaType))) {
                    throw self::invalid($pointer, 'invalid_field', 'Supply this text field once using its contracted name.');
                }
                if ($length > 36) {
                    throw self::invalid($pointer, 'invalid_target', 'Select a valid evidence target.');
                }
                $metadata[$name] = substr($body, $start, $length);
            }
        }
        if (! in_array(substr($body, $offset), ['--', "--\r\n"], true)) {
            throw self::malformed();
        }
        foreach (['purpose', 'record_id', 'attachments'] as $name) {
            if (! isset($metadata[$name]) && ($name !== 'attachments' || $files === [])) {
                throw self::invalid('/'.$name, 'required', 'Supply the required field.');
            }
        }
        if (! in_array($metadata['purpose'], ['opening_receipt', 'hold_clearance', 'actual_issue'], true)) {
            throw self::invalid('/purpose', 'invalid_target', 'Select a valid evidence purpose.');
        }
        if (! preg_match(AuthInput::UUID, $metadata['record_id'])) {
            throw self::invalid('/record_id', 'invalid_target', 'Select a valid evidence target.');
        }

        return new self($keys[0], $metadata['purpose'], $metadata['record_id'], $files);
    }

    /** @return array{string, ?string, ?string} */
    private static function partHeaders(string $input): array
    {
        $headers = [];
        foreach (explode("\r\n", $input) as $line) {
            if (! preg_match('/\A(Content-Disposition|Content-Type):[ \t]*([^\r\n]+)\z/i', $line, $header)
                || isset($headers[strtolower($header[1])])) {
                throw self::malformed();
            }
            $headers[strtolower($header[1])] = trim($header[2]);
        }
        if (! preg_match('/\Aform-data\s*;\s*name="([^"\x00-\x1f]+)"(?:\s*;\s*filename="([^"\x00-\x1f]*)")?\z/iu', $headers['content-disposition'] ?? '', $part)) {
            throw self::malformed();
        }

        return [$part[1], $part[2] ?? null, isset($headers['content-type']) ? strtolower($headers['content-type']) : null];
    }

    public static function invalid(string $pointer, string $code, string $message): ContractException
    {
        return new ContractException(422, 'invalid_evidence', 'Correct the evidence submission.', [
            'error' => [
                'code' => 'invalid_evidence',
                'message' => 'Correct the evidence submission.',
                'fields' => [compact('pointer', 'code', 'message')],
            ],
        ]);
    }

    public static function malformed(): ContractException
    {
        return new ContractException(400, 'malformed_request', 'Invalid request syntax.');
    }

    public static function tooLarge(): ContractException
    {
        return new ContractException(413, 'evidence_too_large', 'The evidence upload exceeds its size limit.');
    }
}

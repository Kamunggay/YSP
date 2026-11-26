<?php

namespace App\Services\Evidence;

use App\Exceptions\ContractException;
use App\Http\Requests\PaperEvidenceUpload;
use JsonException;
use Symfony\Component\Process\Exception\RuntimeException;
use Symfony\Component\Process\Process;

final class PaperEvidenceContent
{
    public const EXTENSIONS = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'application/pdf' => 'pdf'];

    /** @return array{media_type: string, byte_length: int, sha256: string} */
    public function validate(string $bytes, string $declaredType, int $index): array
    {
        $type = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        $code = match (true) {
            $bytes === '' => 'empty_file',
            ! isset(self::EXTENSIONS[$declaredType]) => 'unsupported_type',
            $type !== $declaredType => 'content_mismatch',
            default => $this->invalidReason($bytes, $declaredType),
        };
        if ($code !== null) {
            throw PaperEvidenceUpload::invalid('/attachments/'.$index, $code, 'Supply a valid JPEG, PNG or PDF.');
        }

        return ['media_type' => $declaredType, 'byte_length' => strlen($bytes), 'sha256' => hash('sha256', $bytes)];
    }

    public function invalidReason(string $bytes, string $type): ?string
    {
        if ($type === 'application/pdf') {
            return $this->pdfError($bytes);
        }
        if (! match ($type) {
            'image/png' => $this->completePng($bytes),
            'image/jpeg' => $this->completeJpeg($bytes),
            default => false,
        }) {
            return 'malformed_content';
        }

        $size = @getimagesizefromstring($bytes);
        if ($size === false) {
            return 'malformed_content';
        }
        if (! function_exists('imagecreatefromstring') || $size[0] * $size[1] > 40_000_000) {
            throw self::unavailable();
        }
        $warning = false;
        set_error_handler(function () use (&$warning): bool {
            $warning = true;

            return true;
        }, E_WARNING);
        try {
            $image = imagecreatefromstring($bytes);
        } finally {
            restore_error_handler();
        }

        return $image !== false && ! $warning ? null : 'malformed_content';
    }

    private function completePng(string $bytes): bool
    {
        if (! str_starts_with($bytes, "\x89PNG\r\n\x1a\n")) {
            return false;
        }
        $size = strlen($bytes);
        for ($offset = 8; $offset + 12 <= $size;) {
            $length = unpack('N', substr($bytes, $offset, 4))[1];
            $type = substr($bytes, $offset + 4, 4);
            $offset += $length + 12;
            if ($type === 'IEND') {
                return $length === 0 && $offset === $size;
            }
        }

        return false;
    }

    private function completeJpeg(string $bytes): bool
    {
        if (! str_starts_with($bytes, "\xff\xd8")) {
            return false;
        }
        $size = strlen($bytes);
        $scanning = false;
        for ($offset = 2; $offset < $size;) {
            if ($scanning) {
                $offset = strpos($bytes, "\xff", $offset);
            }
            if ($offset === false || $bytes[$offset] !== "\xff") {
                return false;
            }
            $offset += strspn($bytes, "\xff", $offset);
            if ($offset >= $size) {
                return false;
            }
            $marker = ord($bytes[$offset++]);
            if ($marker === 0xD9) {
                return $offset === $size;
            }
            if ($scanning && ($marker === 0 || ($marker >= 0xD0 && $marker <= 0xD7))) {
                continue;
            }
            if ($offset + 2 > $size || $marker < 0xC0 || ($marker >= 0xD0 && $marker <= 0xD8)) {
                return false;
            }
            $length = unpack('n', substr($bytes, $offset, 2))[1];
            if ($length < 2) {
                return false;
            }
            $offset += $length;
            $scanning = $marker === 0xDA;
        }

        return false;
    }

    private function pdfError(string $bytes): ?string
    {
        if (! str_starts_with($bytes, '%PDF-') || ! str_ends_with(rtrim($bytes, "\t\n\f\r "), '%%EOF')) {
            return 'malformed_content';
        }
        $file = @tmpfile();
        if ($file === false) {
            throw self::unavailable();
        }
        try {
            if (@fwrite($file, $bytes) !== strlen($bytes) || ! @fflush($file)) {
                throw self::unavailable();
            }
            $path = stream_get_meta_data($file)['uri'];
            if ($this->qpdf(['--check', $path]) === null) {
                return 'malformed_content';
            }
            $json = $this->qpdf(['--json=2', '--json-key=qpdf', '--json-key=pages', '--json-key=encrypt', $path]);
            if ($json === null) {
                return 'malformed_content';
            }
            $document = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
            if ($document['encrypt']['encrypted'] || $this->hasActiveContent($document['qpdf'])) {
                return 'unsafe_content';
            }

            return $document['pages'] === [] ? 'malformed_content' : null;
        } catch (RuntimeException|JsonException) {
            throw self::unavailable();
        } finally {
            fclose($file);
        }
    }

    private function qpdf(array $arguments): ?string
    {
        $process = new Process(['qpdf', ...$arguments], timeout: 10);
        $size = 0;
        $status = $process->run(function (string $stream, string $chunk) use (&$size): void {
            $size += strlen($chunk);
            if ($size > 16 * 1024 * 1024) {
                throw self::unavailable();
            }
        });

        return match ($status) {
            0 => $process->getOutput(),
            2, 3 => null,
            default => throw self::unavailable(),
        };
    }

    private function hasActiveContent(array $objects): bool
    {
        $blocked = [
            '/AA', '/OpenAction', '/JS', '/JavaScript', '/Launch', '/EmbeddedFiles', '/EmbeddedFile',
            '/Filespec', '/FileAttachment', '/RichMedia', '/XFA', '/Movie', '/Sound', '/Screen', '/3D',
            '/SubmitForm', '/ImportData', '/GoToE', '/GoToR', '/Rendition', '/URI', '/Action',
        ];
        foreach ($objects as $key => $value) {
            if (in_array($key, $blocked, true) || in_array($value, $blocked, true)
                || (is_array($value) && $this->hasActiveContent($value))) {
                return true;
            }
        }

        return false;
    }

    public static function unavailable(): ContractException
    {
        return new ContractException(503, 'evidence_unavailable', 'Evidence is temporarily unavailable.');
    }
}

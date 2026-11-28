<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Exceptions\ContractException;
use App\Http\Requests\AuthInput;
use App\Services\Shared\CanonicalJson;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;

final class AllocationSnapshotPage
{
    public function paginate(array $entries, ?string $cursor, int $limit, string $kind, string $userId,
        string $chapterId, int $authorityVersion, int $snapshotVersion, array $filters, array $snapshot): array
    {
        $filterHash = substr(CanonicalJson::sha256($filters), 0, 32);
        $snapshotHash = substr(CanonicalJson::sha256($snapshot), 0, 32);
        [$offset, $expiresAt] = $this->resolveCursor(
            $cursor, $kind, $userId, $chapterId, $limit, $filterHash, $authorityVersion, $snapshotVersion, $snapshotHash,
        );
        $next = $offset + $limit;

        return [
            'entries' => array_slice($entries, $offset, $limit),
            'next_cursor' => $next < count($entries)
                ? $this->encodeCursor($kind, $userId, $chapterId, $limit, $filterHash, $authorityVersion,
                    $snapshotVersion, $snapshotHash, $next, $expiresAt)
                : null,
        ];
    }

    /** @return array<string, string> */
    public function parseSelectors(Request $request, array $allowed): array
    {
        $content = $request->getContent();
        if ($content !== '' || $request->hasHeader('X-Action-Key')) {
            throw new ContractException(400, 'invalid_selector', 'GET requests must not include a request body.');
        }

        $query = (string) $request->server('QUERY_STRING', '');
        $selectors = [];
        foreach ($query === '' ? [] : explode('&', $query) as $part) {
            [$key, $value] = array_pad(explode('=', $part, 2), 2, '');
            $key = urldecode($key);
            if (! in_array($key, $allowed, true) || isset($selectors[$key]) || $value === '') {
                throw new ContractException(400, 'invalid_selector', 'Unsupported or duplicate query selector.');
            }
            $decoded = urldecode($value);
            if ($key === 'cursor' && strlen($decoded) > 1024) {
                throw new ContractException(400, 'invalid_selector', 'Cursor selector exceeds maximum length.');
            }
            $selectors[$key] = $decoded;
        }

        return $selectors;
    }

    public function parseLimit(?string $raw): int
    {
        if ($raw === null) {
            return 25;
        }
        $limit = filter_var($raw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);
        if ($limit === false) {
            throw new ContractException(400, 'invalid_selector', 'limit must be an integer between 1 and 100.');
        }

        return $limit;
    }

    public function requireUuidSelector(string $value, string $name): string
    {
        if (preg_match(AuthInput::UUID, $value) !== 1) {
            throw new ContractException(400, 'invalid_selector', "{$name} must be a valid UUID.");
        }

        return $value;
    }

    /**
     * @return array{0: int, 1: int}
     */
    private function resolveCursor(
        ?string $rawCursor,
        string $kind,
        string $userId,
        string $chapterId,
        int $limit,
        string $filterHash,
        int $authorityVersion,
        int $snapshotVersion,
        string $snapshotHash
    ): array {
        if ($rawCursor === null) {
            return [0, now()->addMinutes(5)->timestamp];
        }

        try {
            $cursor = json_decode(Crypt::decryptString($rawCursor), true, flags: JSON_THROW_ON_ERROR);
        } catch (DecryptException|\JsonException) {
            if ($kind === 'replenishment_needs') {
                throw new ContractException(400, 'invalid_selector', 'Invalid pagination cursor.');
            }
            throw new ContractException(409, 'snapshot_stale', 'Allocation snapshot is no longer available.');
        }

        if (! is_array($cursor)
            || ($cursor['k'] ?? null) !== $kind
            || ($cursor['u'] ?? null) !== $userId
            || ($cursor['c'] ?? null) !== $chapterId
            || ($cursor['l'] ?? null) !== $limit
            || ($cursor['f'] ?? null) !== $filterHash
            || ! is_int($cursor['o'] ?? null)
            || ($cursor['o'] ?? -1) < 0) {
            throw new ContractException(400, 'invalid_selector', 'Pagination cursor does not match request parameters.');
        }

        if (($cursor['e'] ?? 0) <= now()->timestamp
            || ($cursor['av'] ?? null) !== $authorityVersion
            || ($cursor['sv'] ?? null) !== $snapshotVersion
            || ($cursor['sh'] ?? null) !== $snapshotHash) {
            throw new ContractException(409, 'snapshot_stale', 'Live inventory snapshot has changed; restart pagination from page 1.');
        }

        return [(int) $cursor['o'], (int) $cursor['e']];
    }

    private function encodeCursor(
        string $kind,
        string $userId,
        string $chapterId,
        int $limit,
        string $filterHash,
        int $authorityVersion,
        int $snapshotVersion,
        string $snapshotHash,
        int $nextOffset,
        int $expiresAt
    ): string {
        return Crypt::encryptString(json_encode([
            'k' => $kind,
            'u' => $userId,
            'c' => $chapterId,
            'l' => $limit,
            'f' => $filterHash,
            'av' => $authorityVersion,
            'sv' => $snapshotVersion,
            'sh' => $snapshotHash,
            'o' => $nextOffset,
            'e' => $expiresAt,
        ], JSON_THROW_ON_ERROR));
    }
}

<?php

namespace App\Services\Shared;

use App\Exceptions\ContractException;
use App\Services\Authority\ChapterAuthority;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;

final class SnapshotPage
{
    public static function response(
        Request $request,
        string $chapterId,
        string $scope,
        array $filters,
        int $limit,
        ?string $rawCursor,
        array $items,
        int $snapshotVersion,
    ): JsonResponse {
        return response()->json(self::paginate($request, $chapterId, $scope, $filters, $limit, $rawCursor, ['data' => $items], $snapshotVersion));
    }

    public static function sections(
        Request $request,
        string $chapterId,
        string $scope,
        array $filters,
        int $limit,
        ?string $rawCursor,
        array $sections,
        array $snapshotContext = [],
    ): array {
        $digest = CanonicalJson::sha256([$sections, $snapshotContext]);
        $version = 1 + ((int) hexdec(substr($digest, 0, 8)) % 2147483647);

        return self::paginate($request, $chapterId, $scope, [CanonicalJson::sha256($filters)], $limit, $rawCursor, $sections, $version, $digest);
    }

    private static function paginate(
        Request $request,
        string $chapterId,
        string $scope,
        array $filters,
        int $limit,
        ?string $rawCursor,
        array $sections,
        int $snapshotVersion,
        ?string $snapshotHash = null,
    ): array {

        $authority = $request->attributes->get(ChapterAuthority::class);
        $userId = $request->user()->id;
        $grantsHash = hash('sha256', CanonicalJson::encode($authority->grants->map(fn ($grant) => [
            $grant->id, $grant->duty_code, (int) $grant->version, $grant->scope,
        ])->all()));
        $snapshotHash ??= CanonicalJson::sha256([$snapshotVersion, $sections['data']]);
        $offset = 0;
        $expires = now('UTC')->addMinutes(5)->timestamp;

        if ($rawCursor !== null) {
            if (strlen($rawCursor) > 1024) {
                throw new ContractException(400, 'invalid_selector', 'Invalid cursor.');
            }
            try {
                $decoded = json_decode(Crypt::decryptString($rawCursor), true, flags: JSON_THROW_ON_ERROR);
            } catch (DecryptException|\JsonException) {
                throw new ContractException(400, 'invalid_selector', 'Invalid cursor.');
            }
            if (($decoded['scope'] ?? null) !== $scope
                || ($decoded['user'] ?? null) !== $userId
                || ($decoded['chapter'] ?? null) !== $chapterId
                || ($decoded['limit'] ?? null) !== $limit
                || ($decoded['filters'] ?? null) !== $filters) {
                throw new ContractException(400, 'invalid_selector', 'Cursor does not match request selectors.');
            }
            if (($decoded['expires'] ?? 0) <= now('UTC')->timestamp
                || ($decoded['authority_version'] ?? null) !== $authority->version
                || ($decoded['grants'] ?? null) !== $grantsHash
                || ($decoded['snapshot'] ?? null) !== $snapshotHash) {
                throw new ContractException(409, 'snapshot_stale', 'List snapshot is stale; restart pagination.');
            }
            $offset = (int) $decoded['offset'];
            $expires = (int) $decoded['expires'];
        }

        $slice = array_map(fn (array $items) => array_slice($items, $offset, $limit), $sections);
        $nextCursor = $offset + $limit < max(array_map(count(...), $sections))
            ? Crypt::encryptString(json_encode([
                'scope' => $scope,
                'user' => $userId,
                'chapter' => $chapterId,
                'authority_version' => $authority->version,
                'grants' => $grantsHash,
                'filters' => $filters,
                'limit' => $limit,
                'snapshot' => $snapshotHash,
                'offset' => $offset + $limit,
                'expires' => $expires,
            ], JSON_THROW_ON_ERROR))
            : null;

        return $slice + [
            'page' => [
                'next_cursor' => $nextCursor,
                'snapshot_version' => max(1, $snapshotVersion),
            ],
        ];
    }
}

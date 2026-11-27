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
        $authority = $request->attributes->get(ChapterAuthority::class);
        $userId = $request->user()->id;
        $grants = $authority->grants->map(fn ($grant) => [
            'id' => $grant->id, 'duty' => $grant->duty_code, 'version' => (int) $grant->version, 'scope' => $grant->scope,
        ])->all();
        $snapshotHash = hash('sha256', CanonicalJson::encode([$snapshotVersion, $grants, $items]));
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
                || ($decoded['snapshot'] ?? null) !== $snapshotHash) {
                throw new ContractException(409, 'snapshot_stale', 'List snapshot is stale; restart pagination.');
            }
            $offset = (int) $decoded['offset'];
            $expires = (int) $decoded['expires'];
        }

        $slice = array_slice($items, $offset, $limit);
        $nextCursor = $offset + $limit < count($items)
            ? Crypt::encryptString(json_encode([
                'scope' => $scope,
                'user' => $userId,
                'chapter' => $chapterId,
                'authority_version' => $authority->version,
                'filters' => $filters,
                'limit' => $limit,
                'snapshot' => $snapshotHash,
                'offset' => $offset + $limit,
                'expires' => $expires,
            ], JSON_THROW_ON_ERROR))
            : null;

        return response()->json([
            'data' => $slice,
            'page' => [
                'next_cursor' => $nextCursor,
                'snapshot_version' => max(1, $snapshotVersion),
            ],
        ]);
    }
}

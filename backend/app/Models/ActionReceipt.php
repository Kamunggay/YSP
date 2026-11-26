<?php

namespace App\Models;

use App\Exceptions\ContractException;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\UniqueConstraintViolationException;

class ActionReceipt extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $casts = ['result' => 'array', 'status' => 'integer'];

    /** @param array{chapter_id: string, user_id: string, operation: string, key: string, evidence_scope?: string} $scope */
    public static function record(array $scope, string $fingerprint, int $status, array $result, ?string $id = null): self
    {
        try {
            $attributes = $scope + compact('fingerprint', 'status', 'result');
            if ($id !== null) {
                $attributes['id'] = $id;
            }

            return self::create($attributes);
        } catch (UniqueConstraintViolationException $exception) {
            // Use a current read when another connection just committed this receipt.
            $receipt = self::where($scope)->sharedLock()->first();
            if (! $receipt) {
                throw $exception;
            }
            if (! hash_equals($receipt->fingerprint, $fingerprint)) {
                throw new ContractException(409, 'action_key_conflict', 'Use a new action key for changed input.');
            }

            return $receipt;
        }
    }
}

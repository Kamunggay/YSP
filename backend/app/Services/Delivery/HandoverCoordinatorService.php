<?php

namespace App\Services\Delivery;

use App\Models\IdempotencyRecord;
use Symfony\Component\HttpKernel\Exception\HttpException;

class HandoverCoordinatorService
{
    public function __construct(
        protected ?RequisitionIssueService $requisitionIssueService = null,
        protected ?SalesReleaseService $salesReleaseService = null,
        protected ?BoothHandoverService $boothHandoverService = null,
        protected ?AdjustmentHandoverService $adjustmentHandoverService = null,
    ) {
        $this->requisitionIssueService = $requisitionIssueService ?? app(RequisitionIssueService::class);
        $this->salesReleaseService = $salesReleaseService ?? app(SalesReleaseService::class);
        $this->boothHandoverService = $boothHandoverService ?? app(BoothHandoverService::class);
        $this->adjustmentHandoverService = $adjustmentHandoverService ?? app(AdjustmentHandoverService::class);
    }

    /**
     * Coordinate a handover across domain boundaries.
     * INVARIANT: The coordinator does NOT begin or commit an outer transaction.
     * The transaction is strictly owned by the dispatched source service.
     */
    public function coordinateHandover(
        array $data,
        ?string $idempotencyKey = null,
        ?string $chapterId = null,
        ?string $userId = null,
        ?string $rawContent = null
    ): array {
        // Compute payload fingerprint
        $payloadHash = $rawContent !== null
            ? hash('sha256', $rawContent)
            : $this->computePayloadFingerprint($data);

        // Idempotency check if key is provided
        if ($idempotencyKey) {
            $existing = IdempotencyRecord::where('key', $idempotencyKey)->first();
            if ($existing) {
                if ($existing->payload_hash !== $payloadHash) {
                    throw new HttpException(
                        409,
                        'An operation with this idempotency key already exists with a different payload.'
                    );
                }

                $decoded = json_decode($existing->response_body, true);

                return [
                    'status' => $existing->response_code,
                    'body' => $decoded !== null ? $decoded : $existing->response_body,
                    'replayed' => true,
                ];
            }
        }

        // Dispatch based on source.kind
        $sourceKind = $data['source']['kind'] ?? null;
        if (! $sourceKind) {
            throw new \InvalidArgumentException('Missing source.kind in handover payload.');
        }

        $result = match ($sourceKind) {
            'requisition' => $this->requisitionIssueService->postActualIssue($data, $chapterId, $userId),
            'sales_order' => $this->salesReleaseService->postCustomerRelease($data, $chapterId, $userId),
            'booth_checkout', 'booth_return' => $this->boothHandoverService->postBoothCustodyHandover($data, $chapterId, $userId),
            'adjustment' => $this->adjustmentHandoverService->postReplacementHandover($data, $chapterId, $userId),
            default => throw new \InvalidArgumentException("Unsupported source kind: {$sourceKind}"),
        };

        // Persist idempotency record after successful dispatch
        if ($idempotencyKey) {
            IdempotencyRecord::create([
                'key' => $idempotencyKey,
                'chapter_id' => $chapterId,
                'user_id' => $userId,
                'payload_hash' => $payloadHash,
                'response_code' => 201,
                'response_body' => json_encode($result),
                'expires_at' => now()->addDays(7),
            ]);
        }

        return [
            'status' => 201,
            'body' => $result,
            'replayed' => false,
        ];
    }

    public function computePayloadFingerprint(mixed $payload): string
    {
        if (is_string($payload)) {
            return hash('sha256', $payload);
        }
        $normalized = $this->recursiveKsort($payload);

        return hash('sha256', json_encode($normalized));
    }

    private function recursiveKsort(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        ksort($value);
        foreach ($value as $k => $v) {
            $value[$k] = $this->recursiveKsort($v);
        }

        return $value;
    }
}

<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use App\Modules\DocumentsReporting\CanonicalRequest;
use App\Modules\DocumentsReporting\ProviderOutcomes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use JsonException;
use stdClass;

final class ChapterProvisioning
{
    public function __construct(private BrowserSessions $sessions, private SessionContract $contract, private CanonicalRequest $canonical, private ProviderOutcomes $outcomes) {}

    public function context(Request $request): JsonResponse
    {
        return DB::transaction(function () use ($request): JsonResponse {
            $authority = $this->authorize($request);
            if ($authority instanceof JsonResponse) {
                return $authority;
            }
            [$user, $grant, $scope] = $authority;

            return response()->json(['scope' => $scope, 'authority_version' => $grant->authority_version,
                'available_actions' => ['provider.chapters.prepare', 'provider.chapters.create']]);
        }, 3);
    }

    public function createProvisionedChapter(Request $request): JsonResponse
    {
        try {
            $body = $this->canonical->decode($request->getContent());
        } catch (JsonException) {
            $body = null;
        }
        $errors = $this->invalidFields($body);
        if (! $request->isJson() || $errors !== []) {
            return response()->json(['code' => 'validation_failed', 'message' => 'Check the submitted fields.',
                'field_feedback' => array_map(fn (string $path): array => ['path' => $path, 'code' => 'INVALID', 'message' => 'Check this field.'], $errors ?: ['']),
                'next_action' => 'correct_fields'], 422);
        }
        $operationId = (string) Str::ulid();

        return DB::transaction(function () use ($request, $body, $operationId): JsonResponse {
            $authority = $this->authorize($request);
            if ($authority instanceof JsonResponse) {
                return $authority;
            }
            [$user, $grant, $scope] = $authority;
            $fingerprint = $this->canonical->fingerprint((object) $scope, $body);
            $replay = $this->outcomes->replay($scope, 'provider.chapters.create', $body->idempotency_key, $fingerprint);
            if ($replay !== null) {
                return $replay;
            }
            if ($grant->authority_version !== $body->expected_provider_authority_version) {
                return response()->json(['code' => 'provider_authority_stale', 'message' => 'Review the original immutable attempt.',
                    'next_action' => 'review_original_attempt'], 409);
            }
            $time = now();
            if (DB::table('chapters')->where('organization_id', $scope['organization_id'])->where('code', $body->chapter->code)->lockForUpdate()->first() !== null) {
                $result = ['resource_type' => 'provisioning', 'action_result' => 'blocked', 'scope' => $scope,
                    'provisioning_id' => null, 'code' => 'chapter_code_unavailable',
                    'message' => 'Provisioning cannot accept this action.', 'next_action' => 'review_original_attempt',
                    'operation' => ['identity' => ['operation_id' => $operationId, 'action_code' => 'provider.chapters.create',
                        'idempotency_key' => $body->idempotency_key], 'outcome' => 'rejected',
                        'committed_at' => $time->format('Y-m-d\TH:i:s.u\Z'), 'replayed' => false]];
                $this->outcomes->record($scope, 'provider.chapters.create', $body->idempotency_key,
                    $fingerprint, $operationId, $grant, ['user_id' => (string) $user->id, 'display_name' => $user->name],
                    $result, $time->format('Y-m-d H:i:s.u'), 409);

                return response()->json($result, 409);
            }
            DB::table('chapters')->insert([
                'organization_id' => $scope['organization_id'], 'code' => $body->chapter->code,
                'name' => $body->chapter->name, 'provisioned_by_user_id' => $user->id,
            ]);
            $chapter = DB::connection()->getPdo()->lastInsertId();
            DB::table('chapter_provisionings')->insert([
                'organization_id' => $scope['organization_id'], 'provider_user_id' => $user->id,
                'chapter_id' => $chapter, 'created_at' => $time,
            ]);
            $provisioning = DB::connection()->getPdo()->lastInsertId();
            $actor = ['user_id' => (string) $user->id, 'display_name' => $user->name];
            $instant = $time->format('Y-m-d\TH:i:s.u\Z');
            $result = ['resource_type' => 'provisioning', 'action_result' => 'success', 'scope' => $scope,
                'provisioning' => ['id' => (string) $provisioning, 'scope' => $scope,
                    'chapter' => ['id' => (string) $chapter, 'code' => $body->chapter->code, 'name' => $body->chapter->name],
                    'version' => 1, 'created_by' => $actor, 'created_at' => $instant,
                    'status' => 'awaiting_initial_head', 'initial_head' => null, 'initial_head_membership_authorization' => 'not_applicable'],
                'operation' => ['identity' => ['operation_id' => $operationId, 'action_code' => 'provider.chapters.create',
                    'idempotency_key' => $body->idempotency_key], 'outcome' => 'committed', 'committed_at' => $instant, 'replayed' => false]];
            $this->outcomes->record($scope, 'provider.chapters.create', $body->idempotency_key,
                $fingerprint, $operationId, $grant, $actor, $result, $time->format('Y-m-d H:i:s.u'), 200);

            return response()->json($result);
        }, 3);
    }

    /** @return array{object, object, array<string, string>}|JsonResponse */
    private function authorize(Request $request): array|JsonResponse
    {
        $user = DB::table('users')->where('id', $request->session()->get('identity_id'))->lockForUpdate()->first();
        $snapshot = $this->sessions->snapshot($request);
        if ($user === null || $snapshot['state'] === 'signed_out') {
            return $this->contract->failure('EnrollmentUnauthorized', 401);
        }
        if ($request->hasHeader('X-Chapter-Context') || $request->getQueryString() !== null
            || $snapshot['state'] !== 'authenticated' || ($snapshot['mfa']['status'] ?? '') !== 'verified') {
            return $this->contract->failure('SessionForbidden', 403, 'forbidden');
        }
        $grants = DB::table('provider_role_grants')->where('user_id', $user->id)->where('role_code', 'provisioner')
            ->whereNull('revoked_at')->where('starts_at', '<=', now())
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', now()))
            ->orderBy('id')->lockForUpdate()->get();
        if ($grants->count() !== 1) {
            return $this->contract->failure('SessionForbidden', 403, 'forbidden');
        }
        $grant = $grants->first();
        // Organization lock also serializes competing chapter codes across actors.
        DB::table('organizations')->where('id', $grant->organization_id)->lockForUpdate()->first();

        return [$user, $grant, ['kind' => 'provisioner', 'organization_id' => (string) $grant->organization_id, 'provider_user_id' => (string) $user->id]];
    }

    /** @return list<string> */
    private function invalidFields(mixed $body): array
    {
        if (! $body instanceof stdClass || array_diff(array_keys(get_object_vars($body)), ['idempotency_key', 'expected_provider_authority_version', 'chapter']) !== []) {
            return [''];
        }
        $errors = [];
        if (! isset($body->idempotency_key) || ! is_string($body->idempotency_key) || ! preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $body->idempotency_key)) {
            $errors[] = '/idempotency_key';
        }
        if (! isset($body->expected_provider_authority_version) || ! is_int($body->expected_provider_authority_version)
            || $body->expected_provider_authority_version < 1 || $body->expected_provider_authority_version > 2147483647) {
            $errors[] = '/expected_provider_authority_version';
        }
        if (! isset($body->chapter) || ! $body->chapter instanceof stdClass || array_diff(array_keys(get_object_vars($body->chapter)), ['code', 'name']) !== []) {
            $errors[] = '/chapter';
        } else {
            if (! isset($body->chapter->code) || ! is_string($body->chapter->code) || ! preg_match('/^[A-Z][A-Z0-9_-]{0,31}$/D', $body->chapter->code)) {
                $errors[] = '/chapter/code';
            }
            if (! isset($body->chapter->name) || ! is_string($body->chapter->name) || mb_strlen($body->chapter->name) > 160 || ! preg_match('/(*UCP)\S/u', $body->chapter->name)) {
                $errors[] = '/chapter/name';
            }
        }

        return $errors;
    }
}

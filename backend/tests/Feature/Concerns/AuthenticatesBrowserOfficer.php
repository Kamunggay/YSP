<?php

namespace Tests\Feature\Concerns;

use App\Models\AuditLog;
use App\Models\BrowserSession;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Models\PolicyRecord;
use App\Models\User;
use App\Services\Shared\CanonicalJson;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

trait AuthenticatesBrowserOfficer
{
    protected string $browserOrigin = 'https://stage1.example.invalid';

    /** @param array<string, string> $extraHeaders */
    protected function asBrowserOfficer(string $userId, ?string $actionKey = null, array $extraHeaders = []): static
    {
        $session = $this->browserSessionFor($userId);
        $headers = array_merge([
            'Accept' => 'application/json',
            'Origin' => $this->browserOrigin,
            'X-XSRF-TOKEN' => $session['csrf'],
        ], $extraHeaders);

        if ($actionKey !== null) {
            $headers['X-Action-Key'] = $actionKey;
        }

        return $this->flushHeaders()
            ->withCredentials()
            ->withUnencryptedCookie('ysp_session', $session['token'])
            ->withHeaders($headers);
    }

    /** @return array{token: string, csrf: string} */
    protected function browserSessionFor(string $userId): array
    {
        config(['app.url' => $this->browserOrigin]);
        app('url')->useOrigin($this->browserOrigin);
        app('url')->forceScheme('https');

        $session = new BrowserSession([
            'user_id' => $userId,
            'user_version' => User::findOrFail($userId)->version,
            'authentication_method' => 'authenticator',
            'authenticated_at' => now(),
            'expires_at' => now()->addHour(),
        ]);
        $token = $session->rotateToken();
        $session->save();

        return ['token' => $token, 'csrf' => $session->csrf_token];
    }

    protected function validPaperPdf(string $label = 'Signed Paper'): string
    {
        $safe = str_replace(['(', ')', '\\'], '', $label);
        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ([
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>',
            "<< /Title ({$safe}) >>",
        ] as $i => $object) {
            $offsets[] = sprintf("%010d 00000 n \n", strlen($pdf));
            $pdf .= ($i + 1)." 0 obj\n{$object}\nendobj\n";
        }
        $xref = strlen($pdf);

        return $pdf."xref\n0 5\n0000000000 65535 f \n".implode('', $offsets)
            ."trailer\n<< /Size 5 /Root 1 0 R /Info 4 0 R >>\nstartxref\n{$xref}\n%%EOF\n";
    }

    /**
     * Store a ready paper evidence record + intact PDF blob on the fake 'evidence' disk.
     *
     * @return array{0: EvidenceRecord, 1: EvidenceBlob, 2: array<string, mixed>}
     */
    protected function storeReadyPaperEvidence(
        string $chapterId,
        string $actorId,
        string $purpose,
        string $recordId,
        string $label = 'Signed Paper',
    ): array {
        $bytes = $this->validPaperPdf($label);
        $sha = hash('sha256', $bytes);
        $evidenceId = (string) Str::uuid();
        $versionId = (string) Str::uuid();
        $blobId = (string) Str::uuid();
        $path = "uploads/{$actorId}/{$blobId}";

        Storage::disk('evidence')->put($path, $bytes);

        $record = EvidenceRecord::create([
            'id' => $evidenceId,
            'chapter_id' => $chapterId,
            'evidence_type' => 'paper',
            'purpose' => $purpose,
            'record_id' => $recordId,
            'technical_state' => 'ready',
            'created_by' => $actorId,
        ]);

        $blob = EvidenceBlob::create([
            'id' => $blobId,
            'evidence_id' => $record->id,
            'version_id' => $versionId,
            'version' => 1,
            'position' => 1,
            'sha256_hash' => $sha,
            'mime_type' => 'application/pdf',
            'file_size' => strlen($bytes),
            'payload_path' => $path,
            'created_by' => $actorId,
        ]);

        $byteBinding = [
            'evidence_id' => $record->id,
            'version_id' => $versionId,
            'attachments' => [['attachment_id' => $blob->id, 'sha256' => $sha]],
        ];

        return [$record, $blob, $byteBinding];
    }

    /**
     * @param  array<string, string>  $fields
     * @param  list<array{filename: string, media_type: string, bytes: string}>  $files
     */
    protected function sendRawMultipartPaper(
        string $uri,
        string $userId,
        string $actionKey,
        array $fields,
        array $files,
    ): TestResponse {
        $boundary = 'ysp-stage1-boundary-'.substr(str_replace('-', '', (string) Str::uuid()), 0, 12);
        $raw = '';
        foreach ($fields as $name => $value) {
            $raw .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"{$name}\"\r\n\r\n{$value}\r\n";
        }
        foreach ($files as $file) {
            $raw .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"attachments\"; filename=\"{$file['filename']}\"\r\n"
                ."Content-Type: {$file['media_type']}\r\n\r\n{$file['bytes']}\r\n";
        }
        $raw .= "--{$boundary}--\r\n";

        $this->asBrowserOfficer($userId, $actionKey);

        return $this->call(
            'POST',
            $uri,
            cookies: $this->prepareCookiesForRequest(),
            server: $this->transformHeadersToServerVars(['Accept' => 'application/json'])
                + ['CONTENT_TYPE' => "multipart/form-data; boundary={$boundary}"],
            content: $raw,
        );
    }

    /**
     * @return list<array{setting_key: string, policy_id: string, version: int}>
     */
    protected function seedEffectiveStage1Policies(
        string $chapterId,
        string $headId,
        string $financeId,
        ?string $requestingUnitId = null,
        ?string $approverGrantId = null,
        string $cutoffAt = '2026-11-01T00:00:00.000000Z',
    ): array {
        $openingPolicies = [
            ['ipc_authorization', 'CHAPTER_HEAD', 'IpcAuthorizationPolicyValue', [
                'cutoff_at' => $cutoffAt,
                'informal_movements_suspended' => true,
                'required_duties' => ['CHAPTER_HEAD', 'FINANCE'],
                'require_independent_counter' => true,
            ], $headId],
            ['reference_series', 'CHAPTER_HEAD', 'OpeningReferencePolicyValue', [
                'ipc_prefix' => 'SYN-IPC',
                'rm_prefix' => 'SYN-RM',
                'minimum_digits' => 6,
            ], $headId],
            ['valuation_rounding', 'FINANCE', 'OpeningValuationPolicyValue', [
                'currency' => 'PHP',
                'decimal_places' => 2,
                'rounding_mode' => 'half_up',
            ], $financeId],
        ];

        $extraPolicies = [
            ['reference_series', 'CHAPTER_HEAD', 'RfReferenceSeriesPolicyValue', ['prefix' => 'SYN-RF', 'minimum_digits' => 6], $headId],
            ['reference_series', 'CHAPTER_HEAD', 'IssueReferenceSeriesPolicyValue', ['prefix' => 'SYN-ISAR', 'minimum_digits' => 6], $headId],
        ];

        if ($requestingUnitId !== null && $approverGrantId !== null) {
            $extraPolicies[] = ['rf_approval_route', 'CHAPTER_HEAD', 'RfApprovalRoutePolicyValue', ['routes' => [[
                'requesting_unit_id' => $requestingUnitId,
                'primary_approver_grant_id' => $approverGrantId,
                'alternate_authorization_ids' => [],
            ]]], $headId];
        }

        $bindings = [];
        foreach (array_merge($openingPolicies, $extraPolicies) as $index => [$key, $owner, $schema, $value, $approverId]) {
            $id = (string) Str::uuid();
            PolicyRecord::create([
                'id' => $id,
                'aggregate_id' => $id,
                'chapter_id' => $chapterId,
                'policy_code' => $key,
                'policy_version' => 1,
                'rules_json' => $value,
                'effective_from' => now()->subDay(),
                'effective_until' => null,
            ]);
            AuditLog::create([
                'chapter_id' => $chapterId,
                'user_id' => $approverId,
                'action' => 'controlled:recordPolicy',
                'entity_type' => 'policy',
                'entity_id' => $id,
                'details' => [
                    'version' => 1,
                    'subject_id' => null,
                    'value_schema_reference' => '#/components/schemas/'.$schema,
                    'value_sha256' => CanonicalJson::sha256($value),
                    'approvals' => [['authority' => $owner, 'approver_id' => $approverId]],
                ],
            ]);
            if ($index < count($openingPolicies)) {
                $bindings[] = ['setting_key' => $key, 'policy_id' => $id, 'version' => 1];
            }
        }

        return $bindings;
    }
}

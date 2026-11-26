<?php

namespace App\Services\Authority;

use App\Http\Requests\AuthInput;
use Illuminate\Support\Facades\Validator;
use stdClass;

final class ControlledSetupInput
{
    public const UUID = 'regex:'.AuthInput::UUID;

    public const MONEY = 'regex:/\A(0|[1-9][0-9]{0,11})\.[0-9]{2}\z/';

    public const INSTANT = 'date_format:Y-m-d\TH:i:s.u\Z';

    public const ALTERNATE_DUTIES = ['RF_APPROVER', 'CHAPTER_HEAD', 'FINANCE', 'BUDGET_APPROVER', 'INDEPENDENT_REVIEWER'];

    public static function validate(string $procedure, mixed $body): array
    {
        $text = 'required|string|min:1|max:200';
        $id = ['required', 'string', self::UUID];
        $time = ['required', 'string', self::INSTANT];
        $provider = in_array($procedure, ['prepareAccount', 'prepareChapter', 'setAccountStatus', 'resetMfa'], true);
        $input = match ($procedure) {
            'prepareAccount' => [
                'login' => 'required|string|email:rfc|max:254',
                'display_name' => $text,
                'credential_delivery_reference' => $text,
            ],
            'prepareChapter' => [
                'reference' => 'required|string|regex:/\A[A-Z][A-Z0-9-]{1,19}\z/',
                'display_name' => $text,
                'initial_head_user_id' => $id,
            ],
            'setAccountStatus' => ['status' => 'required|in:enabled,disabled'],
            'setMembership' => [
                'user_id' => $id,
                'status' => 'required|in:active,revoked',
                'effective_from' => $time,
            ],
            'setDuty', 'setAlternate' => [
                'membership_id' => $id,
                'duty' => 'required|in:'.implode(',', $procedure === 'setDuty' ? ChapterAuthority::DUTIES : self::ALTERNATE_DUTIES),
                'status' => 'required|in:active,revoked',
                'effective_from' => $time,
                'effective_until' => $procedure === 'setDuty' ? ['present', 'nullable', 'string', self::INSTANT] : $time,
                'scope' => 'required|array:unit_id,limit_php|required_array_keys:unit_id,limit_php',
                'scope.unit_id' => ['nullable', 'string', self::UUID],
                'scope.limit_php' => ['nullable', 'string', self::MONEY],
            ] + ($procedure === 'setAlternate' ? [
                'replaces_user_id' => $id,
                'decision_scope_reference' => $text,
            ] : []),
            'recordPolicy' => [
                'setting_key' => 'required|in:'.implode(',', array_keys(SetupPolicy::SCHEMAS)),
                'subject_id' => ['present', 'nullable', 'string', self::UUID],
                'ownership' => 'required|in:operational,financial',
                'value' => 'required|string|min:1|max:2000',
                'value_schema_reference' => $text,
                'effective_from' => $time,
                'effective_until' => ['present', 'nullable', 'string', self::INSTANT],
            ],
            'resetMfa' => [
                'identity_verification_reference' => $text,
                'verified_by_user_id' => $id,
                'verified_at' => $time,
                'lost_factor_reason' => $text,
            ],
        };
        $rules = [
            'payload' => 'required|array:procedure_id,action_key,operator_id,chapter_id,target_id,expected_version,reason,approvals,input',
            'payload.procedure_id' => 'required|in:'.$procedure,
            'payload.action_key' => $id,
            'payload.operator_id' => $id,
            'payload.chapter_id' => $provider ? ['present', fn ($field, $value, $fail) => $value === null ?: $fail('invalid_input')] : $id,
            'payload.target_id' => $id,
            'payload.expected_version' => ['required', 'integer:strict', match ($procedure) {
                'prepareAccount', 'prepareChapter' => 'in:0',
                'resetMfa', 'setAccountStatus' => 'between:1,2147483647',
                default => 'between:0,2147483647',
            }],
            'payload.reason' => 'required|string|min:1|max:500',
            'payload.approvals' => 'required|array|list|min:1',
            'payload.approvals.*' => 'required|array:id,approver_id,authority,approved_at,evidence_reference',
            'payload.approvals.*.id' => [...$id, 'distinct:strict'],
            'payload.approvals.*.approver_id' => $id,
            'payload.approvals.*.authority' => 'required|in:PROVIDER_PROVISIONING,PROVIDER_RECOVERY,CHAPTER_HEAD,FINANCE',
            'payload.approvals.*.approved_at' => $time,
            'payload.approvals.*.evidence_reference' => $text,
            'payload.input' => 'required|array:'.implode(',', array_filter(array_keys($input), fn ($key) => ! str_contains($key, '.'))),
        ];
        foreach ($input as $key => $rule) {
            $rules['payload.input.'.$key] = $rule;
        }

        if (! $body instanceof stdClass || ! ($body->input ?? null) instanceof stdClass
            || ! is_array($body->approvals ?? null)) {
            throw new \DomainException('invalid_input');
        }

        $data = json_decode(json_encode($body, JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);
        if (Validator::make(['payload' => $data], $rules)->fails()) {
            throw new \DomainException('invalid_input');
        }

        return $data;
    }
}

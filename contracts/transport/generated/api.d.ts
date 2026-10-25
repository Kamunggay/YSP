export interface paths {
    "/chapters/{chapter_id}/memberships": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * listMemberships
         * @description Chapter Head only; current authorization and MFA required. See x-membership-contract for guards, visibility, pagination and immutable original-scope recovery.
         */
        get: operations["listMemberships"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/chapters/{chapter_id}/memberships/{membership_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * readMembership
         * @description Chapter Head only; current authorization and MFA required. See x-membership-contract for guards, visibility, pagination and immutable original-scope recovery.
         */
        get: operations["readMembership"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/chapters/{chapter_id}/memberships/{membership_id}/disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * disableMembership
         * @description Chapter Head only; current authorization and MFA required. See x-membership-contract for guards, visibility, pagination and immutable original-scope recovery.
         */
        post: operations["disableMembership"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/chapters/{chapter_id}/memberships/{membership_id}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * revokeMembership
         * @description Chapter Head only; current authorization and MFA required. See x-membership-contract for guards, visibility, pagination and immutable original-scope recovery.
         */
        post: operations["revokeMembership"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/chapters/{chapter_id}/memberships/authorize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * authorizeMembership
         * @description Chapter Head only; current authorization and MFA required. See x-membership-contract for guards, visibility, pagination and immutable original-scope recovery.
         */
        post: operations["authorizeMembership"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/chapters/{chapter_id}/memberships/identity-reference": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * lookupMembershipIdentity
         * @description Chapter Head only; current authorization and MFA required. See x-membership-contract for guards, visibility, pagination and immutable original-scope recovery.
         */
        post: operations["lookupMembershipIdentity"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/chapters/{chapter_id}/operations/by-id/{operation_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Look up a known operation ID in an authorized chapter
         * @description Read only. Reject query selectors. Resolve only inside the authorized chapter/record scope. A nonvisible ID does not prove absence or disclose an operation in another chapter.
         */
        get: operations["lookupOperationById"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/chapters/{chapter_id}/operations/by-key": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Look up the original action and key in an authorized chapter
         * @description Read only. Reject missing action/key, unknown or mixed query selectors. No chapter/action/key uniqueness is widened. No visible result means uncertain, including an in-flight or not-yet-visible terminal transaction.
         */
        get: operations["lookupOperationByKey"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/csrf-cookie": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Initialize or refresh the framework CSRF cookie
         * @description Contract candidate only; adapter/policy review gates are in x-session-contract. All responses are no-store. Accept application/json; never redirect to HTML. No request body.
         */
        get: operations["initializeCsrf"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Find the current authentication state
         * @description Contract candidate only; adapter/policy review gates are in x-session-contract. All responses are no-store. Accept application/json; never redirect to HTML. No request body.
         */
        get: operations["getSession"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session/chapter-context": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read authenticated chapter selection and checked current authority
         * @description Proposed exact wire; see x-chapter-context-contract. Restricted MFA states return safe 403 with no chapter/provider/authority disclosure. Every result no-store. Reject duplicate/unknown query selectors; X-Chapter-Context is the only selection-guard header. Header names are case insensitive. Missing/malformed guard is 400.
         */
        get: operations["getChapterContext"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session/chapter-memberships": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List only current authorized membership choices
         * @description Proposed exact wire; see x-chapter-context-contract. Restricted MFA states return safe 403 with no chapter/provider/authority disclosure. Every result no-store. Reject duplicate/unknown query selectors; X-Chapter-Context is the only selection-guard header. Header names are case insensitive. Missing/malformed guard is 400. Read choices with deterministic numeric ID order, limit 1..100 default 25, opaque user/epoch/limit-bound cursor; next_cursor null ends paging; no other filters.
         */
        get: operations["listChapterMemberships"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session/chapter-selection": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Select an authorized chapter using the session selection guard
         * @description Proposed exact wire; see x-chapter-context-contract. Restricted MFA states return safe 403 with no chapter/provider/authority disclosure. Every result no-store. Reject duplicate/unknown query selectors; X-Chapter-Context is the only selection-guard header. Header names are case insensitive. Missing/malformed guard is 400.
         */
        post: operations["selectChapter"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session/mfa/assisted-recovery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read safe blocked assisted-recovery availability and approved navigation
         * @description Review candidate; see x-mfa-recovery-contract. All results no-store. No caller identity, Idempotency-Key, durable operation lookup or code readback.
         */
        get: operations["getAssistedRecoveryGuidance"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session/mfa/challenge/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify exactly one existing MFA factor for the current restricted challenge
         * @description Review candidate; see x-mfa-recovery-contract. All results no-store. No caller identity, Idempotency-Key, durable operation lookup or code readback.
         */
        post: operations["verifyMfaChallenge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session/mfa/enrollment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Prepare or explicitly replace an unconfirmed authenticator
         * @description Contract candidate; see x-enrollment-contract. Requires current password-verified mfa_enrollment_required session and mandatory token AND origin guards. No caller user ID, Idempotency-Key, durable operation or replay readback. All responses no-store.
         */
        post: operations["prepareAuthenticatorEnrollment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session/mfa/enrollment/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirm the matching live authenticator and issue recovery codes once
         * @description Contract candidate; see x-enrollment-contract. Requires current password-verified mfa_enrollment_required session and mandatory token AND origin guards. No caller user ID, Idempotency-Key, durable operation or replay readback. All responses no-store.
         */
        post: operations["confirmAuthenticatorEnrollment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session/mfa/recovery-codes/regenerate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Explicitly replace the entire recovery-code set using fresh password and authenticator proof
         * @description Review candidate; see x-mfa-recovery-contract. All results no-store. No caller identity, Idempotency-Key, durable operation lookup or code readback.
         */
        post: operations["regenerateRecoveryCodes"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session/sign-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Exchange individual email and password
         * @description Contract candidate only; adapter/policy review gates are in x-session-contract. All responses are no-store. Accept application/json; never redirect to HTML. No Idempotency-Key or durable ActionResult envelope.
         */
        post: operations["signIn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/session/sign-out": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Invalidate the current session
         * @description Contract candidate only; adapter/policy review gates are in x-session-contract. All responses are no-store. Accept application/json; never redirect to HTML. No request body.
         */
        post: operations["signOut"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description Stable action identity, not a route or an authority grant. Endpoint providers assign action codes; the server rejects a mismatched action. Example names are illustrative until their owning contracts are accepted. */
        ActionCode: string;
        /** @description Shared v1 result envelope, no identity/evidence/business payload. Human-readable messages/labels accompany stable codes (UX-01/UX-04); color alone is insufficient. Correctable/stale/forbidden/uncertain results preserve the local draft and original attempt separately; no error response replaces the draft. A transport failure or malformed response is handled locally as uncertain even when no server envelope exists. Null record or operation means unavailable/unauthorized metadata, not a claim that no business effect exists. */
        ActionResult: {
            /** @enum {unknown} */
            action_result: "success" | "blocked" | "stale" | "forbidden" | "uncertain";
            blocking_reason: components["schemas"]["BlockingReason"] | null;
            chapter_id: components["schemas"]["Id"] | null;
            /** @description Optional extension slot only. Endpoint owners MUST constrain/require it with their domain payload schema; this shared slice defines no domain properties. Forbidden and uncertain responses carry no data. Do not use this slot to bypass the owning source operation. */
            data?: Record<string, never> | null;
            field_feedback: components["schemas"]["FieldFeedback"][];
            /** @enum {unknown} */
            input_policy: "preserve" | "may_clear";
            /** @enum {unknown} */
            lookup_state: null | "not_attempted" | "pending_or_not_visible" | "unavailable";
            operation: components["schemas"]["Operation"] | null;
            permitted_next_actions: components["schemas"]["NextAction"][];
            record: components["schemas"]["RecordState"] | null;
            /** @constant */
            schema_version: "1.0";
        } & (unknown & unknown & unknown & unknown & unknown);
        /** @description One closed projection for scoped read, list and mutation result. Stable membership identity survives disable/revoke and reauthorization; history_reference is opaque and is not an unguarded audit endpoint. Current epoch authorization plus retained historical attribution. version is resource concurrency; authority_version is target membership authority revision. */
        AdminMembership: {
            authority_version: components["schemas"]["Version"];
            authorized: components["schemas"]["MembershipAttribution"];
            chapter_id: components["schemas"]["Id"];
            disabled: null;
            history_reference: string;
            identity: components["schemas"]["ExistingIdentityReference"];
            membership_id: components["schemas"]["Id"];
            revoked: null;
            /** @constant */
            status: "authorized";
            version: components["schemas"]["Version"];
        } | {
            authority_version: components["schemas"]["Version"];
            authorized: components["schemas"]["MembershipAttribution"];
            chapter_id: components["schemas"]["Id"];
            disabled: components["schemas"]["MembershipAttribution"];
            history_reference: string;
            identity: components["schemas"]["ExistingIdentityReference"];
            membership_id: components["schemas"]["Id"];
            revoked: null;
            /** @constant */
            status: "disabled";
            version: components["schemas"]["Version"];
        } | {
            authority_version: components["schemas"]["Version"];
            authorized: components["schemas"]["MembershipAttribution"];
            chapter_id: components["schemas"]["Id"];
            disabled: null;
            history_reference: string;
            identity: components["schemas"]["ExistingIdentityReference"];
            membership_id: components["schemas"]["Id"];
            revoked: components["schemas"]["MembershipAttribution"];
            /** @constant */
            status: "revoked";
            version: components["schemas"]["Version"];
        };
        AdminMembershipPage: {
            items: components["schemas"]["AdminMembership"][];
            next_cursor: components["schemas"]["MembershipCursor"] | null;
        };
        AssistedRecoveryGuidance: {
            /** @constant */
            availability: "unavailable";
            /** @constant */
            blocker: "assisted_recovery_not_approved";
            /** @constant */
            message: "Assisted recovery is unavailable until an authorized proof and reset procedure is approved.";
            next_actions: ("bootstrap_session" | "sign_out")[];
        };
        /** @description P02 authenticated session core. The chapter-context slice extends this same schema with chapter choices/current authority. Absence of chapter fields here grants no chapter access. Required MFA is derived from current server authority, never client input. */
        AuthenticatedSession: {
            mfa: components["schemas"]["SessionMfa"];
            provider_destinations: components["schemas"]["ProviderDestination"][];
            /** @constant */
            state: "authenticated";
            user: components["schemas"]["SessionUser"];
        };
        /** @description Transient authenticator proof, never a recovery code or browser draft. */
        AuthenticatorCode: string;
        /** @description expected_membership_version is required: null asserts no membership ever existed; otherwise exact retained membership version. Reauthorization updates the stable existing membership, never inserts a second identity/chapter association. No duties are implicitly granted. */
        AuthorizeMembershipRequest: {
            expected_authority_version: components["schemas"]["Version"];
            expected_membership_version: components["schemas"]["Version"] | null;
            idempotency_key: components["schemas"]["IdempotencyKey"];
            identity: {
                user_id: components["schemas"]["Id"];
            };
        };
        /** @description Stable machine reason and scoped human explanation of why the action cannot proceed. Separate from field feedback and from a server-permitted next action. Domain-specific reason codes extend this shape; never disclose another chapter or unauthorized record. */
        BlockingReason: {
            code: string;
            message: string;
        };
        /** @description Reusable meanings only. Endpoint payload owners choose which times apply; null means unestablished/not applicable, never fabricated equality. Posting/verification/deadline truth remains server-owned. UTC instants are displayed in Asia/Manila without changing elapsed-time comparisons. */
        BusinessTimes: {
            /** @description Server time the information was entered; delayed entry does not replace actual occurrence. */
            entered_at: components["schemas"]["UtcInstant"] | null;
            /** @description Actual physical/commercial occurrence, retained separately from entry; client assertion is subject to domain verification. */
            occurred_at: components["schemas"]["UtcInstant"] | null;
            /** @description Server commit instant when the business posting became durable, null until a posting is established. A rejection result can commit without a business posting. */
            posted_at: components["schemas"]["UtcInstant"] | null;
            /** @description Actual server-accepted verification instant, not inferred from upload time or backdated to gain timely protection. */
            verified_at: components["schemas"]["UtcInstant"] | null;
        };
        /** @description Opaque current identity AND server-session binding, distinct from operation IDs; never an account selector or authority token. */
        ChallengeId: string;
        ChallengeRequiredSession: {
            challenge: components["schemas"]["MfaChallenge"];
            /** @constant */
            state: "mfa_challenge_required";
        };
        ChallengeUnavailable: {
            /** @constant */
            code: "challenge_unavailable";
            /** @constant */
            message: "Bootstrap the current session before a reviewed next action.";
        };
        /** @description Opaque server-issued session selection revision. Changes on selection or selected-membership invalidation; never an authority token. Compare atomically using X-Chapter-Context. */
        ChapterContextRevision: string;
        ChapterContextStale: {
            /** @constant */
            code: "chapter_context_stale";
            /** @constant */
            message: "Refresh current context and review the original scope before another attempt.";
            /** @constant */
            next_action: "refresh_context";
        };
        /** @description P02 wire projection of the unchanged Stage 0 CurrentContext. Finite P02 actions only; effective grants and checked user/chapter/membership tuple retain internal meaning. This is current action availability, never permission to execute. */
        ChapterCurrentContext: {
            authority_version: components["schemas"]["Version"];
            available_actions: components["schemas"]["P02ChapterAction"][];
            chapter_id: components["schemas"]["Id"];
            chapter_name: string;
            checked_at: components["schemas"]["UtcInstant"];
            duty_grants: components["schemas"]["ChapterDutyGrant"][];
            membership_id: components["schemas"]["Id"];
            /** @constant */
            mfa_satisfied: true;
            provider_roles: ("provisioner" | "billing_admin" | "recovery_operator")[];
            /** @constant */
            schema_version: "1.0";
            user_id: components["schemas"]["Id"];
        };
        /** @enum {unknown} */
        ChapterDuty: "COMMITTEE_REQUESTER" | "RF_APPROVER" | "SALES_OFFICER" | "SALES_REVIEWER" | "FINANCE" | "INVENTORY" | "PURCHASING" | "BUDGET_APPROVER" | "RECEIVING" | "DISPATCH" | "BOOTH_CUSTODIAN" | "BOOTH_CASHIER" | "INDEPENDENT_REVIEWER" | "CHAPTER_HEAD";
        /** @description Current effective grant read model. Expiry/revocation and contextual independence are checked by Access, not inferred by clients. */
        ChapterDutyGrant: {
            duty_code: components["schemas"]["ChapterDuty"];
            ends_at: components["schemas"]["UtcInstant"] | null;
            id: components["schemas"]["Id"];
            requesting_unit_id: components["schemas"]["Id"] | null;
            revoked_at: components["schemas"]["UtcInstant"] | null;
            /** @enum {unknown} */
            scope_kind: "chapter" | "unit";
            starts_at: components["schemas"]["UtcInstant"];
        } & unknown;
        ChapterMembershipChoice: {
            chapter_id: components["schemas"]["Id"];
            chapter_name: string;
            membership_id: components["schemas"]["Id"];
            membership_version: components["schemas"]["Version"];
        };
        ChapterMembershipPage: {
            items: components["schemas"]["ChapterMembershipChoice"][];
            limit: number;
            next_cursor: components["schemas"]["MembershipCursor"] | null;
            session: components["schemas"]["AuthenticatedSession"];
        };
        ChapterQueryInvalid: {
            /** @constant */
            code: "invalid_selector";
            /** @constant */
            message: "Use only the documented single-valued selectors.";
        };
        ChapterSelectionInvalid: {
            /** @constant */
            code: "invalid_input";
            field_errors: {
                /** @constant */
                code: "invalid";
                /** @constant */
                message: "Check this field.";
                /** @enum {string} */
                pointer: "/chapter_id" | "/membership_id" | "/expected_membership_version";
            }[];
            /** @constant */
            message: "Check the submitted fields.";
        };
        ChapterSelectionRequired: {
            /** @constant */
            chapter_state: "selection_required";
            selection_revision: components["schemas"]["ChapterContextRevision"];
            session: components["schemas"]["AuthenticatedSession"];
        };
        ChapterSnapshot: components["schemas"]["NoChapterMemberships"] | components["schemas"]["ChapterSelectionRequired"] | components["schemas"]["SelectedChapterContext"];
        /** @description Normalized transport metadata, NOT a public generic command or HTTP body. Adapter derives chapter/action from the authorized route and key from Idempotency-Key; body contributes record reference and explicit expected versions. A body chapter/action/key override is rejected. Domain input is separately validated by the identity/evidence, IPC/RM and stock-hold schemas. Existing-record commands require the exact expected_row_version; creation explicitly uses null record and null row version. Approval/evidence-bound operations additionally REQUIRE expected_material_version in their own schema and check both versions at commit. No expected_version alias. Never accept actor authority, balances, approval state, allocation choices or payment verification as trusted client values. */
        CommandContext: {
            action_code: components["schemas"]["ActionCode"];
            chapter_id: components["schemas"]["Id"];
            expected_material_version?: components["schemas"]["Version"];
            expected_row_version: components["schemas"]["Version"] | null;
            idempotency_key: components["schemas"]["IdempotencyKey"];
            record: components["schemas"]["RecordReference"] | null;
        } & unknown;
        ConfirmedEnrollment: {
            recovery_codes: components["schemas"]["RecoveryCodeIssuance"];
            session: components["schemas"]["VerifiedSession"];
        };
        ConfirmEnrollmentInvalid: {
            /** @constant */
            code: "invalid_input";
            field_errors: {
                /** @constant */
                code: "invalid";
                /** @constant */
                message: "Check this field.";
                /** @enum {string} */
                pointer: "/enrollment_id" | "/authenticator_code";
            }[];
            /** @constant */
            message: "Check the submitted fields.";
        };
        ConfirmEnrollmentRequest: {
            authenticator_code: components["schemas"]["AuthenticatorCode"];
            enrollment_id: components["schemas"]["EnrollmentId"];
        };
        EndMembershipRequest: {
            expected_authority_version: components["schemas"]["Version"];
            expected_membership_version: components["schemas"]["Version"];
            idempotency_key: components["schemas"]["IdempotencyKey"];
        };
        EnrollmentConflict: {
            /** @constant */
            code: "enrollment_unavailable";
            /** @constant */
            message: "Bootstrap the current session before a reviewed next action.";
        };
        /** @description Opaque, bounded, case-sensitive identity AND current-session binding. Distinct from durable operation IDs. Never an authority token or user selector. */
        EnrollmentId: string;
        EnrollmentProofRejected: {
            /** @constant */
            code: "invalid_authenticator_proof";
            /** @constant */
            message: "The authenticator proof was not accepted.";
        };
        EnrollmentRequiredSession: {
            /** @constant */
            state: "mfa_enrollment_required";
        };
        EnrollmentUnauthorized: {
            /** @constant */
            code: "authentication_required";
            /** @constant */
            message: "Sign in to continue.";
        };
        /** @description Minimal authorized existing individual reference; no credentials, email, account status, provider duties or memberships. Reused by later administration contracts, never a global directory. */
        ExistingIdentityReference: {
            display_name: string;
            user_id: components["schemas"]["Id"];
        };
        /** @description Correctable field feedback. path is an RFC 6901 pointer relative to the endpoint request JSON body (not CommandContext or a translated label). Empty pointer targets the body as a whole. Do not echo sensitive submitted data. */
        FieldFeedback: {
            code: string;
            message: string;
            /** Format: json-pointer */
            path: string;
        };
        ForbiddenResult: components["schemas"]["ActionResult"] & {
            /** @constant */
            action_result?: "forbidden";
        };
        /** @description Positive BIGINT UNSIGNED ID as exact base-10 text, range 1?18446744073709551615, without leading zeros. Never convert to JavaScript Number or PHP float. Pattern enforces the storage range; the server also enforces scoped reference existence and authorization. Human document references and public operation IDs are distinct types. */
        Id: string;
        /** @description Case-sensitive opaque client key, scoped by server-authorized chapter AND action. No trimming or case folding. Generate once before sending and retain with the original attempt and immutable payload. */
        IdempotencyKey: string;
        InvalidLookup: components["schemas"]["ActionResult"] & {
            /** @constant */
            action_result?: "blocked";
            operation?: null;
            record?: null;
        };
        /** @description No terminal result visible after current authorization. Not a negative acknowledgment and not permission to repeat a business or physical action. */
        LookupPending: components["schemas"]["ActionResult"] & {
            /** @constant */
            action_result?: "uncertain";
            /** @constant */
            lookup_state?: "pending_or_not_visible";
        };
        /** @description Authorized durable committed/rejected result returned by lookup. The original terminal identity/time is retained and replayed is true; redact/filter using current authorization. */
        LookupTerminal: components["schemas"]["ActionResult"] & {
            /** @enum {unknown} */
            action_result?: "success" | "blocked" | "stale";
            operation?: {
                /** @constant */
                replayed?: true;
            };
        };
        LookupUnavailable: components["schemas"]["ActionResult"] & {
            /** @constant */
            action_result?: "uncertain";
            /** @constant */
            lookup_state?: "unavailable";
        };
        MembershipAttribution: {
            at: components["schemas"]["UtcInstant"];
            user_id: components["schemas"]["Id"];
        };
        MembershipCommittedOperation: {
            committed_at: components["schemas"]["UtcInstant"];
            identity: {
                /** @enum {unknown} */
                action_code: "memberships.authorize" | "memberships.disable" | "memberships.revoke";
                idempotency_key: components["schemas"]["IdempotencyKey"];
                operation_id: components["schemas"]["OperationId"];
            };
            /** @constant */
            outcome: "committed";
            replayed: boolean;
        };
        MembershipConflict: {
            /** @enum {unknown} */
            code: "idempotency_conflict" | "chapter_context_stale" | "authority_stale" | "membership_stale";
            message: string;
            /** @constant */
            next_action: "review_original_attempt";
        };
        MembershipCursor: string;
        MembershipIdentityLookupRequest: {
            user_id: components["schemas"]["Id"];
        };
        MembershipIdentityLookupResult: {
            identity: components["schemas"]["ExistingIdentityReference"] | null;
        };
        MembershipInvalid: {
            /** @constant */
            code: "validation_failed";
            field_feedback: components["schemas"]["FieldFeedback"][];
            message: string;
            /** @constant */
            next_action: "correct_fields";
        };
        MembershipLookupRejected: {
            /** @constant */
            action_result: "blocked";
            chapter_id: components["schemas"]["Id"];
            /** @constant */
            code: "membership_state_conflict";
            message: string;
            /** @constant */
            next_action: "review_original_attempt";
            operation: {
                committed_at: components["schemas"]["UtcInstant"];
                identity: {
                    /** @enum {unknown} */
                    action_code: "memberships.authorize" | "memberships.disable" | "memberships.revoke";
                    idempotency_key: components["schemas"]["IdempotencyKey"];
                    operation_id: components["schemas"]["OperationId"];
                };
                /** @constant */
                outcome: "rejected";
                /** @constant */
                replayed: true;
            };
            /** @constant */
            resource_type: "membership";
        };
        MembershipLookupTerminal: {
            /** @constant */
            action_result: "success";
            chapter_id: components["schemas"]["Id"];
            membership: components["schemas"]["AdminMembership"];
            operation: {
                committed_at: components["schemas"]["UtcInstant"];
                identity: {
                    /** @enum {unknown} */
                    action_code: "memberships.authorize" | "memberships.disable" | "memberships.revoke";
                    idempotency_key: components["schemas"]["IdempotencyKey"];
                    operation_id: components["schemas"]["OperationId"];
                };
                /** @constant */
                outcome: "committed";
                /** @constant */
                replayed: true;
            };
            /** @constant */
            resource_type: "membership";
        };
        MembershipNotVisible: {
            /** @constant */
            code: "membership_not_visible";
            message: string;
        };
        MembershipRejected: {
            /** @constant */
            action_result: "blocked";
            chapter_id: components["schemas"]["Id"];
            /** @constant */
            code: "membership_state_conflict";
            message: string;
            /** @constant */
            next_action: "review_original_attempt";
            operation: components["schemas"]["MembershipRejectedOperation"];
            /** @constant */
            resource_type: "membership";
        };
        MembershipRejectedOperation: {
            committed_at: components["schemas"]["UtcInstant"];
            identity: {
                /** @enum {unknown} */
                action_code: "memberships.authorize" | "memberships.disable" | "memberships.revoke";
                idempotency_key: components["schemas"]["IdempotencyKey"];
                operation_id: components["schemas"]["OperationId"];
            };
            /** @constant */
            outcome: "rejected";
            replayed: boolean;
        };
        MembershipSuccess: {
            /** @constant */
            action_result: "success";
            chapter_id: components["schemas"]["Id"];
            membership: components["schemas"]["AdminMembership"];
            operation: components["schemas"]["MembershipCommittedOperation"];
            /** @constant */
            resource_type: "membership";
        };
        MfaChallenge: {
            expires_at: components["schemas"]["UtcInstant"];
            id: components["schemas"]["ChallengeId"];
        };
        MfaProofRejected: {
            /** @constant */
            code: "invalid_factor_proof";
            /** @constant */
            message: "The factor proof was not accepted.";
        };
        /** @description Server-permitted next step and readable label; not an authorization token. Recheck current authority when used. No transport outcome authorizes repeating a physical handover; reconciliation is separate from database retry. */
        NextAction: {
            /** @enum {unknown} */
            code: "correct_input" | "refresh_record" | "lookup_operation" | "reconcile_activity" | "request_access" | "review_record";
            label: string;
        };
        NoChapterMemberships: {
            /** @constant */
            chapter_state: "no_authorized_memberships";
            selection_revision: components["schemas"]["ChapterContextRevision"];
            session: components["schemas"]["AuthenticatedSession"];
        };
        /** @description Only a durable, authorized terminal result uses committed/rejected. committed_at is the terminal-result transaction commit time, including a recorded rejection; it is not the physical occurrence or posting time. Unknown has no terminal time and cannot be a replay. Pre-operation validation/permission failures may have no operation at all. */
        Operation: {
            committed_at: components["schemas"]["UtcInstant"] | null;
            identity: components["schemas"]["OperationIdentity"];
            /** @enum {unknown} */
            outcome: "committed" | "rejected" | "unknown";
            replayed: boolean;
        } & unknown;
        /** @description Opaque case-sensitive server public ULID, not the numeric operations table ID. Possession confers no access. */
        OperationId: string;
        /** @description Known attempt identity. Action/key are either both known or both null; ID-only lookup may have no visible action/key. Unknown operation ID stays null. The ID is never fabricated for a request that may not have reached the server. */
        OperationIdentity: {
            action_code: components["schemas"]["ActionCode"] | null;
            idempotency_key: components["schemas"]["IdempotencyKey"] | null;
            operation_id: components["schemas"]["OperationId"] | null;
        } & ({
            action_code?: components["schemas"]["ActionCode"];
            idempotency_key?: components["schemas"]["IdempotencyKey"];
        } | {
            action_code?: null;
            idempotency_key?: null;
            operation_id?: components["schemas"]["OperationId"];
        });
        /** @description Exactly one lookup selector: action+key within the authorized chapter, or a known public operation ID within that same chapter. No key-only, unscoped-ID or mixed selector. Current membership/duty and record visibility are rechecked before reading or returning any saved result. An absent terminal row is not proof of failure. */
        OperationLookup: {
            action_code: components["schemas"]["ActionCode"];
            chapter_id: components["schemas"]["Id"];
            idempotency_key: components["schemas"]["IdempotencyKey"];
        } | {
            chapter_id: components["schemas"]["Id"];
            operation_id: components["schemas"]["OperationId"];
        };
        /** @enum {string} */
        P02Action: "memberships.read" | "memberships.prepare" | "memberships.authorize" | "memberships.revoke" | "duty_grants.read" | "duty_grants.prepare" | "duty_grants.authorize" | "duty_grants.revoke" | "alternates.read" | "alternates.prepare" | "alternates.authorize" | "alternates.revoke" | "memberships.disable" | "policy.status.read" | "policy.operational.read" | "policy.operational.prepare" | "policy.operational.approve" | "policy.financial.read" | "policy.financial.prepare" | "policy.financial.approve" | "identities.reference.read" | "provider.identities.reference.read" | "provider.chapters.prepare" | "provider.chapters.create" | "provider.initial_head.appoint" | "identity.disable";
        /** @enum {string} */
        P02ChapterAction: "memberships.read" | "memberships.prepare" | "memberships.authorize" | "memberships.revoke" | "duty_grants.read" | "duty_grants.prepare" | "duty_grants.authorize" | "duty_grants.revoke" | "alternates.read" | "alternates.prepare" | "alternates.authorize" | "alternates.revoke" | "memberships.disable" | "policy.status.read" | "policy.operational.read" | "policy.operational.prepare" | "policy.operational.approve" | "policy.financial.read" | "policy.financial.prepare" | "policy.financial.approve" | "identities.reference.read";
        /** @description Nonnegative DECIMAL(20,2) posted PHP magnitude with exactly two fractional places. Unit costs/intermediate valuations may use Quantity's DECIMAL(20,6) precision; they are NOT posted money. Approved Finance rounding/valuation policy governs final amounts and residual cents across batches. This contract chooses no rounding policy; missing required policy blocks posting. Never round through binary float. */
        PostedMoney: {
            amount: string;
            /** @constant */
            currency: "PHP";
        };
        PreparedEnrollment: {
            enrollment: {
                expires_at: components["schemas"]["UtcInstant"];
                id: components["schemas"]["EnrollmentId"];
                manual_key: string;
                /** Format: uri */
                setup_uri: string;
            };
            /** @constant */
            state: "mfa_enrollment_required";
        };
        PrepareEnrollmentInvalid: {
            /** @constant */
            code: "invalid_input";
            field_errors: {
                /** @constant */
                code: "invalid";
                /** @constant */
                message: "Check this field.";
                /** @enum {string} */
                pointer: "/intent" | "/enrollment_id";
            }[];
            /** @constant */
            message: "Check the submitted fields.";
        };
        PrepareEnrollmentRequest: {
            /** @constant */
            intent: "begin";
        } | {
            enrollment_id: components["schemas"]["EnrollmentId"];
            /** @constant */
            intent: "replace_unconfirmed";
        };
        /** @description Independently authorized provisioning destination, not a chapter membership, duty or permission. No operational access follows from it. Other provider surfaces await their owning contracts. */
        ProviderDestination: {
            /** @constant */
            kind: "chapter_provisioning";
            scope: {
                /** @constant */
                kind: "organization";
                organization_id: components["schemas"]["Id"];
            };
        };
        /** @description Nonnegative DECIMAL(20,6) magnitude: at most fourteen integral and six fractional digits. No exponent, sign, separators or binary floating point. Zero is a transport value; a domain operation may require a positive amount. Fractional trailing zeros are accepted. Canonical fingerprint representation uses six places, so 2 and 2.000000 denote the same exact quantity. Signed ledger deltas require a later explicit domain schema. */
        Quantity: string;
        RecentProofRequired: {
            /** @constant */
            code: "recent_proof_required";
            /** @constant */
            message: "Provide current password and authenticator proof in an explicit new request.";
        };
        /** @description Chapter-relative record identity. The enclosing authorized chapter and server checks establish scope; identifiers alone prove neither existence nor access. Line/evidence references and payloads belong to the identity, record and evidence contract. */
        RecordReference: {
            id: components["schemas"]["Id"];
            kind: string;
        };
        /** @description Authorized resulting/current record metadata, not a domain record payload. row_version changes with relevant progress/concurrent writes; material_version pins immutable approved/evidence-bound content. Partial progress can move row 7 to 8 while material remains 3. A material edit increments both and invalidates affected approval with history. Domain schemas enumerate independent approval/fulfillment/payment/exception axes in states; a generic status must not replace them. Returned current state never silently rebases a draft or expected version. */
        RecordState: {
            material_version: components["schemas"]["Version"];
            reference: components["schemas"]["RecordReference"];
            row_version: components["schemas"]["Version"];
            states: {
                [key: string]: string;
            };
        };
        RecoveryCode: string;
        /** @description One-time plaintext issuance only in successful confirmation (or separately protected existing-factor challenge/recovery regeneration). Never returned by bootstrap, normal reads, errors or replay. Array bounds and sample count constrain wire size, not approved security configuration. */
        RecoveryCodeIssuance: {
            codes: components["schemas"]["RecoveryCode"][];
            issued_at: components["schemas"]["UtcInstant"];
        };
        RegeneratedRecoveryCodes: {
            recovery_codes: components["schemas"]["RecoveryCodeIssuance"];
            session: components["schemas"]["VerifiedSession"];
        };
        RegenerateRecoveryCodesInvalid: {
            /** @constant */
            code: "invalid_input";
            field_errors: {
                /** @constant */
                code: "invalid";
                /** @constant */
                message: "Check this field.";
                /** @enum {string} */
                pointer: "/password" | "/authenticator_code";
            }[];
            /** @constant */
            message: "Check the submitted fields.";
        };
        RegenerateRecoveryCodesRequest: {
            authenticator_code: components["schemas"]["AuthenticatorCode"];
            password: string;
        };
        SelectChapterRequest: {
            chapter_id: components["schemas"]["Id"];
            expected_membership_version: components["schemas"]["Version"];
            membership_id: components["schemas"]["Id"];
        };
        SelectedChapterContext: {
            /** @constant */
            chapter_state: "selected";
            context: components["schemas"]["ChapterCurrentContext"];
            membership: components["schemas"]["ChapterMembershipChoice"];
            selection_revision: components["schemas"]["ChapterContextRevision"];
            /** @enum {string} */
            selection_source: "sole_membership" | "restored" | "explicit";
            session: components["schemas"]["AuthenticatedSession"];
        };
        SessionCsrfFailure: {
            /** @constant */
            code: "csrf_mismatch";
            /** @constant */
            message: "Refresh CSRF before a reviewed new attempt.";
        };
        SessionForbidden: {
            /** @enum {string} */
            code: "forbidden" | "origin_forbidden";
            /** @constant */
            message: "This request is not permitted.";
        };
        SessionMfa: {
            /** @constant */
            status: "not_required";
        } | {
            /** @constant */
            status: "verified";
            verified_at: components["schemas"]["UtcInstant"];
        };
        /** @description Closed state union. Restricted states disclose no user/chapter choices/context, duties, permissions, provider destinations or operation data. Disabled, expired and revoked sessions bootstrap as signed_out; reasons are deliberately indistinguishable. */
        SessionSnapshot: components["schemas"]["SignedOutSession"] | components["schemas"]["EnrollmentRequiredSession"] | components["schemas"]["ChallengeRequiredSession"] | components["schemas"]["AuthenticatedSession"];
        SessionThrottled: {
            /** @constant */
            code: "throttled";
            /** @constant */
            message: "Try again after the indicated delay.";
        };
        SessionUnauthorized: {
            /** @constant */
            code: "invalid_credentials";
            /** @constant */
            message: "Unable to sign in.";
        };
        SessionUnavailable: {
            /** @constant */
            code: "unavailable";
            /** @constant */
            message: "The session service is unavailable.";
        };
        SessionUser: {
            display_name: string;
            id: components["schemas"]["Id"];
        };
        SignedOutSession: {
            /** @constant */
            state: "signed_out";
        };
        SignInInvalid: {
            /** @constant */
            code: "invalid_input";
            field_errors: {
                /** @constant */
                code: "invalid";
                /** @constant */
                message: "Check this field.";
                /** @enum {string} */
                pointer: "/email" | "/password";
            }[];
            /** @constant */
            message: "Check the submitted fields.";
        };
        /** @description Individual credentials only. Never log/echo/store the password in client persistence. Successful exchange creates no business record, operation ID, replay key or chapter context before required MFA. */
        SignInRequest: {
            /** Format: email */
            email: string;
            password: string;
        };
        /** @description A validating quantity example/read value with server-approved unit metadata. quantity_scale is NOT client authority: operations retrieve the current approved unit scale and recheck before SQL binding. Allowed scales 0–6 follow DATABASE-SCHEMA §2.1/§2.3. Pieces/kits use zero; fractional trailing zeros do not create fractional units. */
        UnitQuantity: {
            quantity_scale: number;
            value: components["schemas"]["Quantity"];
        } & (unknown & unknown & unknown & unknown & unknown & unknown);
        /**
         * Format: date-time
         * @description UTC DATETIME(6) wire instant, six fractional digits and Z. Enable date-time format assertion in validators. Display in Asia/Manila while retaining the UTC value; deadlines use elapsed time (48 hours is 172800 seconds), never a local calendar-day substitution. JavaScript Date is only millisecond-precise: it may format a display, but retain the original six-place string for identity, exact comparison and fingerprinting.
         */
        UtcInstant: string;
        VerifiedSession: components["schemas"]["AuthenticatedSession"] & {
            mfa?: {
                /** @constant */
                status?: "verified";
            };
        };
        VerifyMfaChallengeInvalid: {
            /** @constant */
            code: "invalid_input";
            field_errors: {
                /** @constant */
                code: "invalid";
                /** @constant */
                message: "Check this field.";
                /** @enum {string} */
                pointer: "/challenge_id" | "/method" | "/authenticator_code" | "/recovery_code";
            }[];
            /** @constant */
            message: "Check the submitted fields.";
        };
        VerifyMfaChallengeRequest: {
            authenticator_code: components["schemas"]["AuthenticatorCode"];
            challenge_id: components["schemas"]["ChallengeId"];
            /** @constant */
            method: "authenticator";
            recovery_code?: never;
        } | {
            authenticator_code?: never;
            challenge_id: components["schemas"]["ChallengeId"];
            /** @constant */
            method: "recovery_code";
            recovery_code: components["schemas"]["RecoveryCode"];
        };
        /** @description INT UNSIGNED positive version, exactly representable as a JSON integer. A counter reaching the storage maximum must fail rather than wrap. */
        Version: number;
    };
    responses: {
        /** @description Current authentication required. No stored operation or record details are returned. */
        AuthenticationRequired: {
            headers: {
                "Cache-Control": components["headers"]["OperationCacheControl"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ForbiddenResult"];
            };
        };
        /** @description Current chapter/duty/record authority does not permit lookup. No details are disclosed, including whether a supplied other-chapter ID exists. */
        ForbiddenLookup: {
            headers: {
                "Cache-Control": components["headers"]["OperationCacheControl"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ForbiddenResult"];
            };
        };
        /** @description Invalid lookup selector after chapter authorization; no operation is executed. */
        InvalidLookup: {
            headers: {
                "Cache-Control": components["headers"]["OperationCacheControl"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["InvalidLookup"];
            };
        };
        /** @description Authorized lookup could not establish a terminal result. Proxies/network failures may provide no JSON at all; the client retains uncertainty locally. */
        UnavailableLookup: {
            headers: {
                "Cache-Control": components["headers"]["OperationCacheControl"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["LookupUnavailable"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: {
        /** @description Do not cache scoped operation results or uncertainty. */
        OperationCacheControl: "no-store";
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    listMemberships: {
        parameters: {
            query?: {
                cursor?: components["schemas"]["MembershipCursor"];
                limit?: number;
                status?: "authorized" | "disabled" | "revoked";
            };
            header: {
                "X-Chapter-Context": components["schemas"]["ChapterContextRevision"];
            };
            path: {
                chapter_id: components["schemas"]["Id"];
            };
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Authorized scoped result; mutation success requires durable committed operation. */
            200: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminMembershipPage"];
                };
            };
            /** @description Invalid selectors/headers. */
            400: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterQueryInvalid"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            401: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            403: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Context, authority or membership stale; or changed immutable payload. */
            409: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipConflict"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            429: {
                headers: {
                    "Cache-Control": "no-store";
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            503: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    readMembership: {
        parameters: {
            query?: never;
            header: {
                "X-Chapter-Context": components["schemas"]["ChapterContextRevision"];
            };
            path: {
                chapter_id: components["schemas"]["Id"];
                membership_id: components["schemas"]["Id"];
            };
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Authorized scoped result; mutation success requires durable committed operation. */
            200: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminMembership"];
                };
            };
            /** @description Invalid selectors/headers. */
            400: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterQueryInvalid"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            401: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            403: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Identical for absent, other-chapter or nonvisible membership. */
            404: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipNotVisible"];
                };
            };
            /** @description Context, authority or membership stale; or changed immutable payload. */
            409: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipConflict"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            429: {
                headers: {
                    "Cache-Control": "no-store";
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            503: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    disableMembership: {
        parameters: {
            query?: never;
            header: {
                "X-Chapter-Context": components["schemas"]["ChapterContextRevision"];
                "X-XSRF-TOKEN": string;
            };
            path: {
                chapter_id: components["schemas"]["Id"];
                membership_id: components["schemas"]["Id"];
            };
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EndMembershipRequest"];
            };
        };
        responses: {
            /** @description Authorized scoped result; mutation success requires durable committed operation. */
            200: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipSuccess"];
                };
            };
            /** @description Invalid selectors/headers. */
            400: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterQueryInvalid"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            401: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            403: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Context, authority or membership stale; or changed immutable payload. */
            409: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipConflict"] | components["schemas"]["MembershipRejected"];
                };
            };
            /** @description CSRF failure; no automatic unsafe retry. */
            419: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCsrfFailure"];
                };
            };
            /** @description Invalid closed body; endpoint-relative field feedback. */
            422: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipInvalid"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            429: {
                headers: {
                    "Cache-Control": "no-store";
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            503: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    revokeMembership: {
        parameters: {
            query?: never;
            header: {
                "X-Chapter-Context": components["schemas"]["ChapterContextRevision"];
                "X-XSRF-TOKEN": string;
            };
            path: {
                chapter_id: components["schemas"]["Id"];
                membership_id: components["schemas"]["Id"];
            };
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EndMembershipRequest"];
            };
        };
        responses: {
            /** @description Authorized scoped result; mutation success requires durable committed operation. */
            200: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipSuccess"];
                };
            };
            /** @description Invalid selectors/headers. */
            400: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterQueryInvalid"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            401: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            403: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Context, authority or membership stale; or changed immutable payload. */
            409: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipConflict"] | components["schemas"]["MembershipRejected"];
                };
            };
            /** @description CSRF failure; no automatic unsafe retry. */
            419: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCsrfFailure"];
                };
            };
            /** @description Invalid closed body; endpoint-relative field feedback. */
            422: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipInvalid"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            429: {
                headers: {
                    "Cache-Control": "no-store";
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            503: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    authorizeMembership: {
        parameters: {
            query?: never;
            header: {
                "X-Chapter-Context": components["schemas"]["ChapterContextRevision"];
                "X-XSRF-TOKEN": string;
            };
            path: {
                chapter_id: components["schemas"]["Id"];
            };
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AuthorizeMembershipRequest"];
            };
        };
        responses: {
            /** @description Authorized scoped result; mutation success requires durable committed operation. */
            200: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipSuccess"];
                };
            };
            /** @description Invalid selectors/headers. */
            400: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterQueryInvalid"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            401: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            403: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Context, authority or membership stale; or changed immutable payload. */
            409: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipConflict"] | components["schemas"]["MembershipRejected"];
                };
            };
            /** @description CSRF failure; no automatic unsafe retry. */
            419: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCsrfFailure"];
                };
            };
            /** @description Invalid closed body; endpoint-relative field feedback. */
            422: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipInvalid"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            429: {
                headers: {
                    "Cache-Control": "no-store";
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            503: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    lookupMembershipIdentity: {
        parameters: {
            query?: never;
            header: {
                "X-Chapter-Context": components["schemas"]["ChapterContextRevision"];
                "X-XSRF-TOKEN": string;
            };
            path: {
                chapter_id: components["schemas"]["Id"];
            };
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MembershipIdentityLookupRequest"];
            };
        };
        responses: {
            /** @description Authorized scoped result; mutation success requires durable committed operation. */
            200: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipIdentityLookupResult"];
                };
            };
            /** @description Invalid selectors/headers. */
            400: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterQueryInvalid"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            401: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            403: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Context, authority or membership stale; or changed immutable payload. */
            409: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipConflict"];
                };
            };
            /** @description CSRF failure; no automatic unsafe retry. */
            419: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCsrfFailure"];
                };
            };
            /** @description Invalid closed body; endpoint-relative field feedback. */
            422: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipInvalid"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            429: {
                headers: {
                    "Cache-Control": "no-store";
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Current access/transport failure; never proves earlier mutation failure. */
            503: {
                headers: {
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    lookupOperationById: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Selected chapter subject to current server membership/duty authorization, never an authority grant. */
                chapter_id: components["schemas"]["Id"];
                /** @description Known public operation ID; always restricted to the authorized chapter and record scope. */
                operation_id: components["schemas"]["OperationId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized terminal result, or uncertain when no terminal result is visible. An absent terminal result is never reported as confirmed failure. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["OperationCacheControl"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LookupTerminal"] | components["schemas"]["LookupPending"] | components["schemas"]["MembershipLookupTerminal"] | components["schemas"]["MembershipLookupRejected"];
                };
            };
            400: components["responses"]["InvalidLookup"];
            401: components["responses"]["AuthenticationRequired"];
            403: components["responses"]["ForbiddenLookup"];
            /** @description Authorized lookup could not establish a terminal result. Proxies/network failures may provide no JSON at all; the client retains uncertainty locally. */
            503: {
                headers: {
                    "Cache-Control": components["headers"]["OperationCacheControl"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LookupUnavailable"];
                };
            };
        };
    };
    lookupOperationByKey: {
        parameters: {
            query: {
                action_code: components["schemas"]["ActionCode"];
                idempotency_key: components["schemas"]["IdempotencyKey"];
            };
            header?: never;
            path: {
                /** @description Selected chapter subject to current server membership/duty authorization, never an authority grant. */
                chapter_id: components["schemas"]["Id"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authorized terminal result, or uncertain when no terminal result is visible. An absent terminal result is never reported as confirmed failure. */
            200: {
                headers: {
                    "Cache-Control": components["headers"]["OperationCacheControl"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LookupTerminal"] | components["schemas"]["LookupPending"] | components["schemas"]["MembershipLookupTerminal"] | components["schemas"]["MembershipLookupRejected"];
                };
            };
            400: components["responses"]["InvalidLookup"];
            401: components["responses"]["AuthenticationRequired"];
            403: components["responses"]["ForbiddenLookup"];
            /** @description Authorized lookup could not establish a terminal result. Proxies/network failures may provide no JSON at all; the client retains uncertainty locally. */
            503: {
                headers: {
                    "Cache-Control": components["headers"]["OperationCacheControl"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LookupUnavailable"];
                };
            };
        };
    };
    initializeCsrf: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Bodyless. Framework session/CSRF initialization, available before sign-in. Reissue current token; does not rotate on every GET or invalidate another tab. */
            204: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Separate Set-Cookie fields: host-only ysp_session (Secure; HttpOnly; Path=/; SameSite=Lax), XSRF-TOKEN (Secure; Path=/; SameSite=Lax; readable by JavaScript). No Domain. Values opaque; actual lifetime requires later security approval. Browser JavaScript cannot inspect Set-Cookie. */
                    "Set-Cookie": string[];
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Origin rejected or current session state disallows the exchange. No credential or authority information disclosed. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Throttled; no unsafe retry. Respect Retry-After. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Unavailable. A lost/invalid response never establishes whether a prior unsafe exchange completed. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    getSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Current state. Missing/expired/revoked/disabled session returns signed_out, not a login redirect. */
            200: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionSnapshot"];
                };
            };
            /** @description Origin rejected or current session state disallows the exchange. No credential or authority information disclosed. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Throttled; no unsafe retry. Respect Retry-After. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Unavailable. A lost/invalid response never establishes whether a prior unsafe exchange completed. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    getChapterContext: {
        parameters: {
            query?: {
                /** @description Optional asserted selected scope; mismatch is safe 409, never a lookup of arbitrary chapter identity. */
                chapter_id?: components["schemas"]["Id"];
            };
            header?: never;
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Authenticated current result; no automatic authority follows from selection. */
            200: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterSnapshot"];
                };
            };
            /** @description Malformed/duplicate/unknown query selector; no scoped disclosure. */
            400: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterQueryInvalid"];
                };
            };
            /** @description Session expired, revoked, disabled or missing; sign in. */
            401: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Origin forbidden or current authentication state disallows this operation; no disclosure. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Selection revision, requested selected chapter, membership version or current selection is stale; no latest chapter identity or current revision disclosed here. */
            409: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterContextStale"];
                };
            };
            /** @description Throttled, respect server Retry-After; no automatic attempt. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Service unavailable; uncertainty remains for any earlier mutation. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    listChapterMemberships: {
        parameters: {
            query?: {
                cursor?: components["schemas"]["MembershipCursor"];
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Authenticated current result; no automatic authority follows from selection. */
            200: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterMembershipPage"];
                };
            };
            /** @description Malformed/duplicate/unknown query selector; no scoped disclosure. */
            400: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterQueryInvalid"];
                };
            };
            /** @description Session expired, revoked, disabled or missing; sign in. */
            401: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Origin forbidden or current authentication state disallows this operation; no disclosure. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Throttled, respect server Retry-After; no automatic attempt. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Service unavailable; uncertainty remains for any earlier mutation. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    selectChapter: {
        parameters: {
            query?: never;
            header: {
                "X-Chapter-Context": components["schemas"]["ChapterContextRevision"];
                "X-XSRF-TOKEN": string;
            };
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SelectChapterRequest"];
            };
        };
        responses: {
            /** @description Authenticated current result; no automatic authority follows from selection. */
            200: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SelectedChapterContext"];
                };
            };
            /** @description Malformed/duplicate/unknown query selector; no scoped disclosure. */
            400: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterQueryInvalid"];
                };
            };
            /** @description Session expired, revoked, disabled or missing; sign in. */
            401: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Origin forbidden or current authentication state disallows this operation; no disclosure. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Selection revision, requested selected chapter, membership version or current selection is stale; no latest chapter identity or current revision disclosed here. */
            409: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterContextStale"];
                };
            };
            /** @description Missing/stale/malformed token, even when Sec-Fetch-Site is same-origin. Reject before credential validation or state change. Refresh only; no automatic unsafe retry. */
            419: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCsrfFailure"];
                };
            };
            /** @description Closed body validation failure; pointers identify actual submitted fields. Invalid transport headers are rejected as 400 before execution. */
            422: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChapterSelectionInvalid"];
                };
            };
            /** @description Throttled, respect server Retry-After; no automatic attempt. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Service unavailable; uncertainty remains for any earlier mutation. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    getAssistedRecoveryGuidance: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Stable safe unavailable result for current password-verified challenge/enrollment or authenticated session. No identity reset or side effects. */
            200: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssistedRecoveryGuidance"];
                };
            };
            /** @description Session expired, revoked, disabled or missing; sign in. */
            401: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Origin forbidden or current authentication state disallows this operation; no disclosure. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Throttled, respect server Retry-After; no automatic attempt. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Service unavailable; uncertainty remains for any earlier mutation. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    verifyMfaChallenge: {
        parameters: {
            query?: never;
            header?: {
                /** @description Mandatory for success; optional here only to represent missing-token 419 examples. Same-origin does not bypass validation. */
                "X-XSRF-TOKEN"?: string;
            };
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifyMfaChallengeRequest"];
            };
        };
        responses: {
            /** @description Atomically consume proof/challenge, rotate session/CSRF and recompute current authority. No recovery-code issuance. */
            200: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Separate Set-Cookie fields: host-only ysp_session (Secure; HttpOnly; Path=/; SameSite=Lax), XSRF-TOKEN (Secure; Path=/; SameSite=Lax; readable by JavaScript). No Domain. Values opaque; actual lifetime requires later security approval. Browser JavaScript cannot inspect Set-Cookie. */
                    "Set-Cookie": string[];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerifiedSession"];
                };
            };
            /** @description Well-shaped invalid/expired authenticator proof or invalid/already consumed recovery code. Same safe result, no code existence disclosure. */
            400: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MfaProofRejected"];
                };
            };
            /** @description Session expired, revoked, disabled or missing; sign in. */
            401: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Origin forbidden or current authentication state disallows this operation; no disclosure. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Same safe result for wrong-session, stale, expired or consumed challenge. Bootstrap before a reviewed next step. */
            409: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChallengeUnavailable"];
                };
            };
            /** @description CSRF failure, refresh before a reviewed attempt; never automatically repeat. */
            419: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCsrfFailure"];
                };
            };
            /** @description Malformed, mixed or extra proof/identity fields rejected, no secrets echoed. */
            422: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerifyMfaChallengeInvalid"];
                };
            };
            /** @description Throttled, respect server Retry-After; no automatic attempt. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Service unavailable; uncertainty remains for any earlier mutation. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    prepareAuthenticatorEnrollment: {
        parameters: {
            query?: never;
            header?: {
                /** @description Mandatory for success; optional here only to represent missing-token 419 examples. Same-origin does not bypass validation. */
                "X-XSRF-TOKEN"?: string;
            };
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PrepareEnrollmentRequest"];
            };
        };
        responses: {
            /** @description Preparation alone never verifies MFA. */
            200: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PreparedEnrollment"];
                };
            };
            /** @description Missing, expired, revoked or disabled session; no identity details. */
            401: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Origin rejected or current session state disallows the exchange. No credential or authority information disclosed. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Same safe response for stale, expired, wrong-session or consumed enrollment; begin with an existing pending enrollment conflicts. Bootstrap first; never implicitly replace. */
            409: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentConflict"];
                };
            };
            /** @description Missing/stale/malformed token, even when Sec-Fetch-Site is same-origin. Reject before credential validation or state change. Refresh only; no automatic unsafe retry. */
            419: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCsrfFailure"];
                };
            };
            /** @description Invalid request shape; field pointers refer only to this request and never echo secrets. */
            422: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PrepareEnrollmentInvalid"];
                };
            };
            /** @description Throttled; no unsafe retry. Respect Retry-After. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Unavailable. A lost/invalid response never establishes whether a prior unsafe exchange completed. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    confirmAuthenticatorEnrollment: {
        parameters: {
            query?: never;
            header?: {
                /** @description Mandatory for success; optional here only to represent missing-token 419 examples. Same-origin does not bypass validation. */
                "X-XSRF-TOKEN"?: string;
            };
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfirmEnrollmentRequest"];
            };
        };
        responses: {
            /** @description Atomically verify live matching proof, consume enrollment, rotate session/CSRF and issue codes once. No repeat readback. */
            200: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Separate Set-Cookie fields: host-only ysp_session (Secure; HttpOnly; Path=/; SameSite=Lax), XSRF-TOKEN (Secure; Path=/; SameSite=Lax; readable by JavaScript). No Domain. Values opaque; actual lifetime requires later security approval. Browser JavaScript cannot inspect Set-Cookie. */
                    "Set-Cookie": string[];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfirmedEnrollment"];
                };
            };
            /** @description Well-shaped but invalid or expired authenticator proof; no MFA verification or codes. Expired enrollment instead uses 409. */
            400: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentProofRejected"];
                };
            };
            /** @description Missing, expired, revoked or disabled session; no identity details. */
            401: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Origin rejected or current session state disallows the exchange. No credential or authority information disclosed. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Same safe response for stale, expired, wrong-session or consumed enrollment; begin with an existing pending enrollment conflicts. Bootstrap first; never implicitly replace. */
            409: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentConflict"];
                };
            };
            /** @description Missing/stale/malformed token, even when Sec-Fetch-Site is same-origin. Reject before credential validation or state change. Refresh only; no automatic unsafe retry. */
            419: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCsrfFailure"];
                };
            };
            /** @description Invalid request shape; field pointers refer only to this request and never echo secrets. */
            422: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfirmEnrollmentInvalid"];
                };
            };
            /** @description Throttled; no unsafe retry. Respect Retry-After. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Unavailable. A lost/invalid response never establishes whether a prior unsafe exchange completed. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    regenerateRecoveryCodes: {
        parameters: {
            query?: never;
            header?: {
                /** @description Mandatory for success; optional here only to represent missing-token 419 examples. Same-origin does not bypass validation. */
                "X-XSRF-TOKEN"?: string;
            };
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegenerateRecoveryCodesRequest"];
            };
        };
        responses: {
            /** @description Require authenticated verified-MFA session plus both live proofs. Atomically replace all old codes and rotate session/CSRF; new plaintext appears only here. */
            200: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Separate Set-Cookie fields: host-only ysp_session (Secure; HttpOnly; Path=/; SameSite=Lax), XSRF-TOKEN (Secure; Path=/; SameSite=Lax; readable by JavaScript). No Domain. Values opaque; actual lifetime requires later security approval. Browser JavaScript cannot inspect Set-Cookie. */
                    "Set-Cookie": string[];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegeneratedRecoveryCodes"];
                };
            };
            /** @description Well-shaped incorrect password or invalid/expired authenticator proof; same safe result with no factor/account disclosure. */
            400: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MfaProofRejected"];
                };
            };
            /** @description Session expired, revoked, disabled or missing; sign in. */
            401: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentUnauthorized"];
                };
            };
            /** @description Origin forbidden or current authentication state disallows this operation; no disclosure. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Proof no longer recent under server-owned window at commit; no regeneration. Never substitute cached verification or recovery proof. */
            409: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecentProofRequired"];
                };
            };
            /** @description CSRF failure, refresh before a reviewed attempt; never automatically repeat. */
            419: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCsrfFailure"];
                };
            };
            /** @description Missing, malformed or extra fields; no secrets echoed. */
            422: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RegenerateRecoveryCodesInvalid"];
                };
            };
            /** @description Throttled, respect server Retry-After; no automatic attempt. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Service unavailable; uncertainty remains for any earlier mutation. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    signIn: {
        parameters: {
            query?: never;
            header?: {
                /** @description Mandatory for success; optional here only to represent missing-token 419 examples. Same-origin does not bypass validation. */
                "X-XSRF-TOKEN"?: string;
            };
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SignInRequest"];
            };
        };
        responses: {
            /** @description Password accepted. Current server authority selects restricted or authenticated state. Regenerate session ID and CSRF token. */
            200: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Separate Set-Cookie fields: host-only ysp_session (Secure; HttpOnly; Path=/; SameSite=Lax), XSRF-TOKEN (Secure; Path=/; SameSite=Lax; readable by JavaScript). No Domain. Values opaque; actual lifetime requires later security approval. Browser JavaScript cannot inspect Set-Cookie. */
                    "Set-Cookie": string[];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnrollmentRequiredSession"] | components["schemas"]["ChallengeRequiredSession"] | components["schemas"]["AuthenticatedSession"];
                };
            };
            /** @description Identical status/body for wrong password, unknown email or disabled identity. Disabled identities cannot reauthenticate. Apply equivalent verification work and throttling without account enumeration. */
            401: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnauthorized"];
                };
            };
            /** @description Origin rejected or current session state disallows the exchange. No credential or authority information disclosed. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Missing/stale/malformed token, even when Sec-Fetch-Site is same-origin. Reject before credential validation or state change. Refresh only; no automatic unsafe retry. */
            419: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCsrfFailure"];
                };
            };
            /** @description Invalid credential shape. Field feedback never echoes secrets or discloses account existence. */
            422: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SignInInvalid"];
                };
            };
            /** @description Throttled; no unsafe retry. Respect Retry-After. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Unavailable. A lost/invalid response never establishes whether a prior unsafe exchange completed. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
    signOut: {
        parameters: {
            query?: never;
            header?: {
                /** @description Mandatory for success; optional here only to represent missing-token 419 examples. Same-origin does not bypass validation. */
                "X-XSRF-TOKEN"?: string;
            };
            path?: never;
            cookie?: {
                ysp_session?: string;
            };
        };
        requestBody?: never;
        responses: {
            /** @description Bodyless. Invalidate the old session and regenerate CSRF; repeat logout on an anonymous session also succeeds after CSRF verification. */
            204: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Separate Set-Cookie fields: host-only ysp_session (Secure; HttpOnly; Path=/; SameSite=Lax), XSRF-TOKEN (Secure; Path=/; SameSite=Lax; readable by JavaScript). No Domain. Values opaque; actual lifetime requires later security approval. Browser JavaScript cannot inspect Set-Cookie. */
                    "Set-Cookie": string[];
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Origin rejected or current session state disallows the exchange. No credential or authority information disclosed. */
            403: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionForbidden"];
                };
            };
            /** @description Missing/stale/malformed token, even when Sec-Fetch-Site is same-origin. Reject before credential validation or state change. Refresh only; no automatic unsafe retry. */
            419: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionCsrfFailure"];
                };
            };
            /** @description Throttled; no unsafe retry. Respect Retry-After. */
            429: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    /** @description Positive decimal delay seconds, server selected. Fixture delay is illustrative, not an approved rate-limit value. */
                    "Retry-After": string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionThrottled"];
                };
            };
            /** @description Unavailable. A lost/invalid response never establishes whether a prior unsafe exchange completed. */
            503: {
                headers: {
                    /** @description Never cache session, credentials or CSRF responses. */
                    "Cache-Control": "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionUnavailable"];
                };
            };
        };
    };
}

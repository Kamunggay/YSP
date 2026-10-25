export interface paths {
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
            blocking_reason: {
                code: string;
                message: string;
            } | null;
            chapter_id: components["schemas"]["CommandContext"]["chapter_id"] | null;
            /** @description Optional extension slot only. Endpoint owners MUST constrain/require it with their domain payload schema; this shared slice defines no domain properties. Forbidden and uncertain responses carry no data. Do not use this slot to bypass the owning source operation. */
            data?: Record<string, never> | null;
            field_feedback: {
                code: string;
                message: string;
                /** Format: json-pointer */
                path: string;
            }[];
            /** @enum {unknown} */
            input_policy: "preserve" | "may_clear";
            /** @enum {unknown} */
            lookup_state: null | "not_attempted" | "pending_or_not_visible" | "unavailable";
            operation: ({
                committed_at: components["schemas"]["BusinessTimes"]["posted_at"]["anyOf"]["0"] | null;
                /** @description Known attempt identity. Action/key are either both known or both null; ID-only lookup may have no visible action/key. Unknown operation ID stays null. The ID is never fabricated for a request that may not have reached the server. */
                identity: {
                    action_code: components["schemas"]["CommandContext"]["action_code"] | null;
                    idempotency_key: components["schemas"]["CommandContext"]["idempotency_key"] | null;
                    operation_id: components["schemas"]["OperationLookup"]["oneOf"]["1"]["operation_id"] | null;
                } & ({
                    action_code?: components["schemas"]["CommandContext"]["action_code"];
                    idempotency_key?: components["schemas"]["CommandContext"]["idempotency_key"];
                } | {
                    action_code?: null;
                    idempotency_key?: null;
                    operation_id?: components["schemas"]["OperationLookup"]["oneOf"]["1"]["operation_id"];
                });
                /** @enum {unknown} */
                outcome: "committed" | "rejected" | "unknown";
                replayed: boolean;
            } & unknown) | null;
            permitted_next_actions: {
                /** @enum {unknown} */
                code: "correct_input" | "refresh_record" | "lookup_operation" | "reconcile_activity" | "request_access" | "review_record";
                label: string;
            }[];
            record: {
                material_version: components["schemas"]["CommandContext"]["expected_material_version"];
                reference: components["schemas"]["CommandContext"]["record"]["anyOf"]["0"];
                row_version: components["schemas"]["CommandContext"]["expected_material_version"];
                states: {
                    [key: string]: string;
                };
            } | null;
            /** @constant */
            schema_version: "1.0";
        } & (unknown & unknown & unknown & unknown & unknown);
        /** @description P02 authenticated session core. The chapter-context slice extends this same schema with chapter choices/current authority. Absence of chapter fields here grants no chapter access. Required MFA is derived from current server authority, never client input. */
        AuthenticatedSession: {
            mfa: {
                /** @constant */
                status: "not_required";
            } | {
                /** @constant */
                status: "verified";
                verified_at: components["schemas"]["BusinessTimes"]["posted_at"]["anyOf"]["0"];
            };
            provider_destinations: {
                /** @constant */
                kind: "chapter_provisioning";
                scope: {
                    /** @constant */
                    kind: "organization";
                    organization_id: components["schemas"]["CommandContext"]["chapter_id"];
                };
            }[];
            /** @constant */
            state: "authenticated";
            user: {
                display_name: string;
                id: components["schemas"]["CommandContext"]["chapter_id"];
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
            entered_at: components["schemas"]["BusinessTimes"]["posted_at"]["anyOf"]["0"] | null;
            /** @description Actual physical/commercial occurrence, retained separately from entry; client assertion is subject to domain verification. */
            occurred_at: components["schemas"]["BusinessTimes"]["posted_at"]["anyOf"]["0"] | null;
            /** @description Server commit instant when the business posting became durable, null until a posting is established. A rejection result can commit without a business posting. */
            posted_at: string | null;
            /** @description Actual server-accepted verification instant, not inferred from upload time or backdated to gain timely protection. */
            verified_at: components["schemas"]["BusinessTimes"]["posted_at"]["anyOf"]["0"] | null;
        };
        ChallengeRequiredSession: {
            /** @constant */
            state: "mfa_challenge_required";
        };
        /** @description Normalized transport metadata, NOT a public generic command or HTTP body. Adapter derives chapter/action from the authorized route and key from Idempotency-Key; body contributes record reference and explicit expected versions. A body chapter/action/key override is rejected. Domain input is separately validated by the identity/evidence, IPC/RM and stock-hold schemas. Existing-record commands require the exact expected_row_version; creation explicitly uses null record and null row version. Approval/evidence-bound operations additionally REQUIRE expected_material_version in their own schema and check both versions at commit. No expected_version alias. Never accept actor authority, balances, approval state, allocation choices or payment verification as trusted client values. */
        CommandContext: {
            /** @description Stable action identity, not a route or an authority grant. Endpoint providers assign action codes; the server rejects a mismatched action. Example names are illustrative until their owning contracts are accepted. */
            action_code: string;
            /** @description Positive BIGINT UNSIGNED ID as exact base-10 text, range 1?18446744073709551615, without leading zeros. Never convert to JavaScript Number or PHP float. Pattern enforces the storage range; the server also enforces scoped reference existence and authorization. Human document references and public operation IDs are distinct types. */
            chapter_id: string;
            /** @description INT UNSIGNED positive version, exactly representable as a JSON integer. A counter reaching the storage maximum must fail rather than wrap. */
            expected_material_version?: number;
            expected_row_version: components["schemas"]["CommandContext"]["expected_material_version"] | null;
            /** @description Case-sensitive opaque client key, scoped by server-authorized chapter AND action. No trimming or case folding. Generate once before sending and retain with the original attempt and immutable payload. */
            idempotency_key: string;
            record: {
                id: components["schemas"]["CommandContext"]["chapter_id"];
                kind: string;
            } | null;
        } & unknown;
        EnrollmentRequiredSession: {
            /** @constant */
            state: "mfa_enrollment_required";
        };
        /** @description Correctable field feedback. path is an RFC 6901 pointer relative to the endpoint request JSON body (not CommandContext or a translated label). Empty pointer targets the body as a whole. Do not echo sensitive submitted data. */
        FieldFeedback: {
            code: string;
            message: string;
            /** Format: json-pointer */
            path: string;
        };
        ForbiddenResult: components["schemas"]["LookupTerminal"]["allOf"]["0"] & {
            /** @constant */
            action_result?: "forbidden";
        };
        /** @description Positive BIGINT UNSIGNED ID as exact base-10 text, range 1?18446744073709551615, without leading zeros. Never convert to JavaScript Number or PHP float. Pattern enforces the storage range; the server also enforces scoped reference existence and authorization. Human document references and public operation IDs are distinct types. */
        Id: string;
        /** @description Case-sensitive opaque client key, scoped by server-authorized chapter AND action. No trimming or case folding. Generate once before sending and retain with the original attempt and immutable payload. */
        IdempotencyKey: string;
        InvalidLookup: components["schemas"]["LookupTerminal"]["allOf"]["0"] & {
            /** @constant */
            action_result?: "blocked";
            operation?: null;
            record?: null;
        };
        /** @description No terminal result visible after current authorization. Not a negative acknowledgment and not permission to repeat a business or physical action. */
        LookupPending: components["schemas"]["LookupTerminal"]["allOf"]["0"] & {
            /** @constant */
            action_result?: "uncertain";
            /** @constant */
            lookup_state?: "pending_or_not_visible";
        };
        /** @description Authorized durable committed/rejected result returned by lookup. The original terminal identity/time is retained and replayed is true; redact/filter using current authorization. */
        LookupTerminal: ({
            /** @enum {unknown} */
            action_result: "success" | "blocked" | "stale" | "forbidden" | "uncertain";
            blocking_reason: {
                code: string;
                message: string;
            } | null;
            chapter_id: components["schemas"]["CommandContext"]["chapter_id"] | null;
            /** @description Optional extension slot only. Endpoint owners MUST constrain/require it with their domain payload schema; this shared slice defines no domain properties. Forbidden and uncertain responses carry no data. Do not use this slot to bypass the owning source operation. */
            data?: Record<string, never> | null;
            field_feedback: {
                code: string;
                message: string;
                /** Format: json-pointer */
                path: string;
            }[];
            /** @enum {unknown} */
            input_policy: "preserve" | "may_clear";
            /** @enum {unknown} */
            lookup_state: null | "not_attempted" | "pending_or_not_visible" | "unavailable";
            operation: ({
                committed_at: components["schemas"]["BusinessTimes"]["posted_at"]["anyOf"]["0"] | null;
                /** @description Known attempt identity. Action/key are either both known or both null; ID-only lookup may have no visible action/key. Unknown operation ID stays null. The ID is never fabricated for a request that may not have reached the server. */
                identity: {
                    action_code: components["schemas"]["CommandContext"]["action_code"] | null;
                    idempotency_key: components["schemas"]["CommandContext"]["idempotency_key"] | null;
                    operation_id: components["schemas"]["OperationLookup"]["oneOf"]["1"]["operation_id"] | null;
                } & ({
                    action_code?: components["schemas"]["CommandContext"]["action_code"];
                    idempotency_key?: components["schemas"]["CommandContext"]["idempotency_key"];
                } | {
                    action_code?: null;
                    idempotency_key?: null;
                    operation_id?: components["schemas"]["OperationLookup"]["oneOf"]["1"]["operation_id"];
                });
                /** @enum {unknown} */
                outcome: "committed" | "rejected" | "unknown";
                replayed: boolean;
            } & unknown) | null;
            permitted_next_actions: {
                /** @enum {unknown} */
                code: "correct_input" | "refresh_record" | "lookup_operation" | "reconcile_activity" | "request_access" | "review_record";
                label: string;
            }[];
            record: {
                material_version: components["schemas"]["CommandContext"]["expected_material_version"];
                reference: components["schemas"]["CommandContext"]["record"]["anyOf"]["0"];
                row_version: components["schemas"]["CommandContext"]["expected_material_version"];
                states: {
                    [key: string]: string;
                };
            } | null;
            /** @constant */
            schema_version: "1.0";
        } & (unknown & unknown & unknown & unknown & unknown)) & {
            /** @enum {unknown} */
            action_result?: "success" | "blocked" | "stale";
            operation?: {
                /** @constant */
                replayed?: true;
            };
        };
        LookupUnavailable: components["schemas"]["LookupTerminal"]["allOf"]["0"] & {
            /** @constant */
            action_result?: "uncertain";
            /** @constant */
            lookup_state?: "unavailable";
        };
        /** @description Server-permitted next step and readable label; not an authorization token. Recheck current authority when used. No transport outcome authorizes repeating a physical handover; reconciliation is separate from database retry. */
        NextAction: {
            /** @enum {unknown} */
            code: "correct_input" | "refresh_record" | "lookup_operation" | "reconcile_activity" | "request_access" | "review_record";
            label: string;
        };
        /** @description Only a durable, authorized terminal result uses committed/rejected. committed_at is the terminal-result transaction commit time, including a recorded rejection; it is not the physical occurrence or posting time. Unknown has no terminal time and cannot be a replay. Pre-operation validation/permission failures may have no operation at all. */
        Operation: {
            committed_at: components["schemas"]["BusinessTimes"]["posted_at"]["anyOf"]["0"] | null;
            /** @description Known attempt identity. Action/key are either both known or both null; ID-only lookup may have no visible action/key. Unknown operation ID stays null. The ID is never fabricated for a request that may not have reached the server. */
            identity: {
                action_code: components["schemas"]["CommandContext"]["action_code"] | null;
                idempotency_key: components["schemas"]["CommandContext"]["idempotency_key"] | null;
                operation_id: components["schemas"]["OperationLookup"]["oneOf"]["1"]["operation_id"] | null;
            } & ({
                action_code?: components["schemas"]["CommandContext"]["action_code"];
                idempotency_key?: components["schemas"]["CommandContext"]["idempotency_key"];
            } | {
                action_code?: null;
                idempotency_key?: null;
                operation_id?: components["schemas"]["OperationLookup"]["oneOf"]["1"]["operation_id"];
            });
            /** @enum {unknown} */
            outcome: "committed" | "rejected" | "unknown";
            replayed: boolean;
        } & unknown;
        /** @description Opaque case-sensitive server public ULID, not the numeric operations table ID. Possession confers no access. */
        OperationId: string;
        /** @description Known attempt identity. Action/key are either both known or both null; ID-only lookup may have no visible action/key. Unknown operation ID stays null. The ID is never fabricated for a request that may not have reached the server. */
        OperationIdentity: {
            action_code: components["schemas"]["CommandContext"]["action_code"] | null;
            idempotency_key: components["schemas"]["CommandContext"]["idempotency_key"] | null;
            operation_id: components["schemas"]["OperationLookup"]["oneOf"]["1"]["operation_id"] | null;
        } & ({
            action_code?: components["schemas"]["CommandContext"]["action_code"];
            idempotency_key?: components["schemas"]["CommandContext"]["idempotency_key"];
        } | {
            action_code?: null;
            idempotency_key?: null;
            operation_id?: components["schemas"]["OperationLookup"]["oneOf"]["1"]["operation_id"];
        });
        /** @description Exactly one lookup selector: action+key within the authorized chapter, or a known public operation ID within that same chapter. No key-only, unscoped-ID or mixed selector. Current membership/duty and record visibility are rechecked before reading or returning any saved result. An absent terminal row is not proof of failure. */
        OperationLookup: {
            action_code: components["schemas"]["CommandContext"]["action_code"];
            chapter_id: components["schemas"]["CommandContext"]["chapter_id"];
            idempotency_key: components["schemas"]["CommandContext"]["idempotency_key"];
        } | {
            chapter_id: components["schemas"]["CommandContext"]["chapter_id"];
            /** @description Opaque case-sensitive server public ULID, not the numeric operations table ID. Possession confers no access. */
            operation_id: string;
        };
        /** @description Nonnegative DECIMAL(20,2) posted PHP magnitude with exactly two fractional places. Unit costs/intermediate valuations may use Quantity's DECIMAL(20,6) precision; they are NOT posted money. Approved Finance rounding/valuation policy governs final amounts and residual cents across batches. This contract chooses no rounding policy; missing required policy blocks posting. Never round through binary float. */
        PostedMoney: {
            amount: string;
            /** @constant */
            currency: "PHP";
        };
        /** @description Independently authorized provisioning destination, not a chapter membership, duty or permission. No operational access follows from it. Other provider surfaces await their owning contracts. */
        ProviderDestination: {
            /** @constant */
            kind: "chapter_provisioning";
            scope: {
                /** @constant */
                kind: "organization";
                organization_id: components["schemas"]["CommandContext"]["chapter_id"];
            };
        };
        /** @description Nonnegative DECIMAL(20,6) magnitude: at most fourteen integral and six fractional digits. No exponent, sign, separators or binary floating point. Zero is a transport value; a domain operation may require a positive amount. Fractional trailing zeros are accepted. Canonical fingerprint representation uses six places, so 2 and 2.000000 denote the same exact quantity. Signed ledger deltas require a later explicit domain schema. */
        Quantity: string;
        /** @description Chapter-relative record identity. The enclosing authorized chapter and server checks establish scope; identifiers alone prove neither existence nor access. Line/evidence references and payloads belong to the identity, record and evidence contract. */
        RecordReference: {
            id: components["schemas"]["CommandContext"]["chapter_id"];
            kind: string;
        };
        /** @description Authorized resulting/current record metadata, not a domain record payload. row_version changes with relevant progress/concurrent writes; material_version pins immutable approved/evidence-bound content. Partial progress can move row 7 to 8 while material remains 3. A material edit increments both and invalidates affected approval with history. Domain schemas enumerate independent approval/fulfillment/payment/exception axes in states; a generic status must not replace them. Returned current state never silently rebases a draft or expected version. */
        RecordState: {
            material_version: components["schemas"]["CommandContext"]["expected_material_version"];
            reference: components["schemas"]["CommandContext"]["record"]["anyOf"]["0"];
            row_version: components["schemas"]["CommandContext"]["expected_material_version"];
            states: {
                [key: string]: string;
            };
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
            verified_at: components["schemas"]["BusinessTimes"]["posted_at"]["anyOf"]["0"];
        };
        /** @description Closed state union. Restricted states disclose no user/chapter choices/context, duties, permissions, provider destinations or operation data. Disabled, expired and revoked sessions bootstrap as signed_out; reasons are deliberately indistinguishable. */
        SessionSnapshot: {
            /** @constant */
            state: "signed_out";
        } | {
            /** @constant */
            state: "mfa_enrollment_required";
        } | {
            /** @constant */
            state: "mfa_challenge_required";
        } | {
            mfa: {
                /** @constant */
                status: "not_required";
            } | {
                /** @constant */
                status: "verified";
                verified_at: components["schemas"]["BusinessTimes"]["posted_at"]["anyOf"]["0"];
            };
            provider_destinations: {
                /** @constant */
                kind: "chapter_provisioning";
                scope: {
                    /** @constant */
                    kind: "organization";
                    organization_id: components["schemas"]["CommandContext"]["chapter_id"];
                };
            }[];
            /** @constant */
            state: "authenticated";
            user: {
                display_name: string;
                id: components["schemas"]["CommandContext"]["chapter_id"];
            };
        };
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
            id: components["schemas"]["CommandContext"]["chapter_id"];
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
            /** @description Nonnegative DECIMAL(20,6) magnitude: at most fourteen integral and six fractional digits. No exponent, sign, separators or binary floating point. Zero is a transport value; a domain operation may require a positive amount. Fractional trailing zeros are accepted. Canonical fingerprint representation uses six places, so 2 and 2.000000 denote the same exact quantity. Signed ledger deltas require a later explicit domain schema. */
            value: string;
        } & (unknown & unknown & unknown & unknown & unknown & unknown);
        /**
         * Format: date-time
         * @description UTC DATETIME(6) wire instant, six fractional digits and Z. Enable date-time format assertion in validators. Display in Asia/Manila while retaining the UTC value; deadlines use elapsed time (48 hours is 172800 seconds), never a local calendar-day substitution. JavaScript Date is only millisecond-precise: it may format a display, but retain the original six-place string for identity, exact comparison and fingerprinting.
         */
        UtcInstant: string;
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
                    "application/json": components["schemas"]["LookupTerminal"] | components["schemas"]["LookupPending"];
                };
            };
            400: components["responses"]["InvalidLookup"];
            401: components["responses"]["AuthenticationRequired"];
            403: components["responses"]["ForbiddenLookup"];
            503: components["responses"]["UnavailableLookup"];
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
                    "application/json": components["schemas"]["LookupTerminal"] | components["schemas"]["LookupPending"];
                };
            };
            400: components["responses"]["InvalidLookup"];
            401: components["responses"]["AuthenticationRequired"];
            403: components["responses"]["ForbiddenLookup"];
            503: components["responses"]["UnavailableLookup"];
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

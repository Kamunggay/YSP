// Generated from the validated operation exchanges; do not edit.
import type { ConsumerExample, ConsumerResponseExample } from "../consumer/session.ts";
export const consumerExamples = [
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "signed_out"
      }
    }
  },
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "signed_out"
      }
    }
  },
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "signed_out"
      }
    }
  },
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "signed_out"
      }
    }
  },
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "mfa_enrollment_required"
      }
    }
  },
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "mfa_challenge_required",
        "challenge": {
          "id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          "expires_at": "2026-10-25T06:05:00.000000Z"
        }
      }
    }
  },
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "authenticated",
        "user": {
          "id": "9007199254740993",
          "display_name": "Synthetic requester"
        },
        "mfa": {
          "status": "not_required"
        },
        "provider_destinations": []
      }
    }
  },
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "authenticated",
        "user": {
          "id": "9007199254740994",
          "display_name": "Synthetic approver"
        },
        "mfa": {
          "status": "verified",
          "verified_at": "2026-10-25T06:00:00.000000Z"
        },
        "provider_destinations": []
      }
    }
  },
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "authenticated",
        "user": {
          "id": "9007199254740995",
          "display_name": "Synthetic provider"
        },
        "mfa": {
          "status": "verified",
          "verified_at": "2026-10-25T06:00:00.000000Z"
        },
        "provider_destinations": [
          {
            "kind": "chapter_provisioning",
            "scope": {
              "kind": "organization",
              "organization_id": "1"
            }
          }
        ]
      }
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "mfa_enrollment_required"
      }
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "mfa_challenge_required",
        "challenge": {
          "id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          "expires_at": "2026-10-25T06:05:00.000000Z"
        }
      }
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "authenticated",
        "user": {
          "id": "9007199254740993",
          "display_name": "Synthetic requester"
        },
        "mfa": {
          "status": "not_required"
        },
        "provider_destinations": []
      }
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "authenticated",
        "user": {
          "id": "9007199254740994",
          "display_name": "Synthetic approver"
        },
        "mfa": {
          "status": "verified",
          "verified_at": "2026-10-25T06:00:00.000000Z"
        },
        "provider_destinations": []
      }
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "authenticated",
        "user": {
          "id": "9007199254740995",
          "display_name": "Synthetic provider"
        },
        "mfa": {
          "status": "verified",
          "verified_at": "2026-10-25T06:00:00.000000Z"
        },
        "provider_destinations": [
          {
            "kind": "chapter_provisioning",
            "scope": {
              "kind": "organization",
              "organization_id": "1"
            }
          }
        ]
      }
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "invalid_credentials",
        "message": "Unable to sign in."
      }
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "invalid_credentials",
        "message": "Unable to sign in."
      }
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "invalid_credentials",
        "message": "Unable to sign in."
      }
    }
  },
  {
    "operationId": "signOut",
    "request": {},
    "response": {
      "kind": "response",
      "status": 204
    }
  },
  {
    "operationId": "signOut",
    "request": {},
    "response": {
      "kind": "response",
      "status": 204
    }
  },
  {
    "operationId": "initializeCsrf",
    "request": {},
    "response": {
      "kind": "response",
      "status": 204
    }
  },
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "origin_forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "getSession",
    "request": {},
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "origin_forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "signIn",
    "request": {
      "body": {
        "email": "officer@example.test",
        "password": "synthetic-only"
      }
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "signOut",
    "request": {},
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "origin_forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "signOut",
    "request": {},
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "signOut",
    "request": {},
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "signOut",
    "request": {},
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "initializeCsrf",
    "request": {},
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "origin_forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "initializeCsrf",
    "request": {},
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "initializeCsrf",
    "request": {},
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "request": {
      "body": {
        "intent": "begin"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "mfa_enrollment_required",
        "enrollment": {
          "id": "enr_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          "expires_at": "2026-10-25T06:05:00.000000Z",
          "setup_uri": "otpauth://totp/YSP:synthetic%40example.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=YSP",
          "manual_key": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
        }
      }
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "request": {
      "body": {
        "intent": "replace_unconfirmed",
        "enrollment_id": "enr_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "mfa_enrollment_required",
        "enrollment": {
          "id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          "expires_at": "2026-10-25T06:05:00.000000Z",
          "setup_uri": "otpauth://totp/YSP:synthetic%40example.test?secret=KRSXG5DSNFXGOIDBKRSXG5DSNFXGOIDB&issuer=YSP",
          "manual_key": "KRSXG5DSNFXGOIDBKRSXG5DSNFXGOIDB"
        }
      }
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "request": {
      "body": {
        "intent": "replace_unconfirmed",
        "enrollment_id": "enr_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "enrollment_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "request": {
      "body": {
        "intent": "replace_unconfirmed",
        "enrollment_id": "enr_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "enrollment_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "request": {
      "body": {
        "intent": "replace_unconfirmed",
        "enrollment_id": "enr_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "enrollment_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "request": {
      "body": {
        "intent": "replace_unconfirmed",
        "enrollment_id": "enr_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "enrollment_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "request": {
      "body": {
        "intent": "begin"
      }
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "request": {
      "body": {
        "intent": "begin"
      }
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "origin_forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "request": {
      "body": {
        "intent": "begin"
      }
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "request": {
      "body": {
        "intent": "begin"
      }
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "request": {
      "body": {
        "intent": "begin"
      }
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:01:00.000000Z"
          },
          "provider_destinations": []
        },
        "recovery_codes": {
          "issued_at": "2026-10-25T06:01:00.000000Z",
          "codes": [
            "DEMO-CODE-0001-AAAA",
            "DEMO-CODE-0002-BBBB"
          ]
        }
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_authenticator_proof",
        "message": "The authenticator proof was not accepted."
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_authenticator_proof",
        "message": "The authenticator proof was not accepted."
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "enrollment_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "enrollment_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "enrollment_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "enrollment_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "origin_forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "request": {
      "body": {
        "enrollment_id": "enr_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "authenticated",
        "user": {
          "id": "9007199254740994",
          "display_name": "Synthetic approver"
        },
        "mfa": {
          "status": "verified",
          "verified_at": "2026-10-25T06:01:00.000000Z"
        },
        "provider_destinations": []
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "recovery_code",
        "recovery_code": "DEMO-CODE-0001-AAAA"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "state": "authenticated",
        "user": {
          "id": "9007199254740994",
          "display_name": "Synthetic approver"
        },
        "mfa": {
          "status": "verified",
          "verified_at": "2026-10-25T06:01:00.000000Z"
        },
        "provider_destinations": []
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "origin_forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_factor_proof",
        "message": "The factor proof was not accepted."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_factor_proof",
        "message": "The factor proof was not accepted."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "method": "recovery_code",
        "recovery_code": "DEMO-CODE-0001-AAAA"
      }
    },
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_factor_proof",
        "message": "The factor proof was not accepted."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
        "method": "recovery_code",
        "recovery_code": "DEMO-CODE-0002-BBBB"
      }
    },
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_factor_proof",
        "message": "The factor proof was not accepted."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "challenge_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "challenge_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "challenge_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "request": {
      "body": {
        "challenge_id": "chl_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "method": "authenticator",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "challenge_unavailable",
        "message": "Bootstrap the current session before a reviewed next action."
      }
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "request": {
      "body": {
        "password": "synthetic-only",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:01:00.000000Z"
          },
          "provider_destinations": []
        },
        "recovery_codes": {
          "issued_at": "2026-10-25T06:01:00.000000Z",
          "codes": [
            "DEMO-NEWC-0001-AAAA",
            "DEMO-NEWC-0002-BBBB"
          ]
        }
      }
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "request": {
      "body": {
        "password": "synthetic-only",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "request": {
      "body": {
        "password": "synthetic-only",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "request": {
      "body": {
        "password": "synthetic-only",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "origin_forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "request": {
      "body": {
        "password": "synthetic-only",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "request": {
      "body": {
        "password": "synthetic-only",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "request": {
      "body": {
        "password": "synthetic-only",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "request": {
      "body": {
        "password": "synthetic-only",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_factor_proof",
        "message": "The factor proof was not accepted."
      }
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "request": {
      "body": {
        "password": "synthetic-only",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_factor_proof",
        "message": "The factor proof was not accepted."
      }
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "request": {
      "body": {
        "password": "synthetic-only",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_factor_proof",
        "message": "The factor proof was not accepted."
      }
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "request": {
      "body": {
        "password": "synthetic-only",
        "authenticator_code": "123456"
      }
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "recent_proof_required",
        "message": "Provide current password and authenticator proof in an explicit new request."
      }
    }
  },
  {
    "operationId": "getAssistedRecoveryGuidance",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "availability": "unavailable",
        "blocker": "assisted_recovery_not_approved",
        "message": "Assisted recovery is unavailable until an authorized proof and reset procedure is approved.",
        "next_actions": [
          "bootstrap_session",
          "sign_out"
        ]
      }
    }
  },
  {
    "operationId": "getAssistedRecoveryGuidance",
    "request": {},
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "getAssistedRecoveryGuidance",
    "request": {},
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "getAssistedRecoveryGuidance",
    "request": {},
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "origin_forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "getAssistedRecoveryGuidance",
    "request": {},
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "getAssistedRecoveryGuidance",
    "request": {},
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "selection_revision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "chapter_state": "no_authorized_memberships"
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740995",
            "display_name": "Synthetic provider"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": [
            {
              "kind": "chapter_provisioning",
              "scope": {
                "kind": "organization",
                "organization_id": "1"
              }
            }
          ]
        },
        "selection_revision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "chapter_state": "no_authorized_memberships"
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "selection_revision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "chapter_state": "selection_required"
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {
      "query": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "selection_revision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "chapter_state": "selected",
        "selection_source": "sole_membership",
        "membership": {
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "membership_version": 3
        },
        "context": {
          "schema_version": "1.0",
          "user_id": "9007199254740994",
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "authority_version": 7,
          "checked_at": "2026-10-25T06:10:00.000000Z",
          "mfa_satisfied": true,
          "duty_grants": [
            {
              "id": "9007199254741010",
              "duty_code": "CHAPTER_HEAD",
              "scope_kind": "chapter",
              "requesting_unit_id": null,
              "starts_at": "2026-10-25T06:00:00.000000Z",
              "ends_at": null,
              "revoked_at": null
            }
          ],
          "available_actions": [
            "memberships.read",
            "memberships.prepare",
            "memberships.authorize",
            "memberships.revoke",
            "duty_grants.read",
            "duty_grants.prepare",
            "duty_grants.authorize",
            "duty_grants.revoke",
            "alternates.read",
            "alternates.prepare",
            "alternates.authorize",
            "alternates.revoke",
            "memberships.disable",
            "policy.status.read",
            "policy.operational.read",
            "policy.operational.prepare",
            "policy.operational.approve",
            "identities.reference.read"
          ],
          "provider_roles": []
        }
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {
      "query": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "selection_revision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "chapter_state": "selected",
        "selection_source": "restored",
        "membership": {
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "membership_version": 3
        },
        "context": {
          "schema_version": "1.0",
          "user_id": "9007199254740994",
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "authority_version": 7,
          "checked_at": "2026-10-25T06:10:00.000000Z",
          "mfa_satisfied": true,
          "duty_grants": [
            {
              "id": "9007199254741010",
              "duty_code": "CHAPTER_HEAD",
              "scope_kind": "chapter",
              "requesting_unit_id": null,
              "starts_at": "2026-10-25T06:00:00.000000Z",
              "ends_at": null,
              "revoked_at": null
            }
          ],
          "available_actions": [
            "memberships.read",
            "memberships.prepare",
            "memberships.authorize",
            "memberships.revoke",
            "duty_grants.read",
            "duty_grants.prepare",
            "duty_grants.authorize",
            "duty_grants.revoke",
            "alternates.read",
            "alternates.prepare",
            "alternates.authorize",
            "alternates.revoke",
            "memberships.disable",
            "policy.status.read",
            "policy.operational.read",
            "policy.operational.prepare",
            "policy.operational.approve",
            "identities.reference.read"
          ],
          "provider_roles": []
        }
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {
      "query": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "selection_revision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "chapter_state": "selected",
        "selection_source": "explicit",
        "membership": {
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "membership_version": 3
        },
        "context": {
          "schema_version": "1.0",
          "user_id": "9007199254740994",
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "authority_version": 7,
          "checked_at": "2026-10-25T06:10:00.000000Z",
          "mfa_satisfied": true,
          "duty_grants": [
            {
              "id": "9007199254741010",
              "duty_code": "CHAPTER_HEAD",
              "scope_kind": "chapter",
              "requesting_unit_id": null,
              "starts_at": "2026-10-25T06:00:00.000000Z",
              "ends_at": null,
              "revoked_at": null
            }
          ],
          "available_actions": [
            "memberships.read",
            "memberships.prepare",
            "memberships.authorize",
            "memberships.revoke",
            "duty_grants.read",
            "duty_grants.prepare",
            "duty_grants.authorize",
            "duty_grants.revoke",
            "alternates.read",
            "alternates.prepare",
            "alternates.authorize",
            "alternates.revoke",
            "memberships.disable",
            "policy.status.read",
            "policy.operational.read",
            "policy.operational.prepare",
            "policy.operational.approve",
            "identities.reference.read"
          ],
          "provider_roles": []
        }
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {
      "query": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740993",
            "display_name": "Synthetic requester"
          },
          "mfa": {
            "status": "not_required"
          },
          "provider_destinations": []
        },
        "selection_revision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "chapter_state": "selected",
        "selection_source": "explicit",
        "membership": {
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "membership_version": 3
        },
        "context": {
          "schema_version": "1.0",
          "user_id": "9007199254740993",
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "authority_version": 7,
          "checked_at": "2026-10-25T06:10:00.000000Z",
          "mfa_satisfied": true,
          "duty_grants": [
            {
              "id": "9007199254741010",
              "duty_code": "COMMITTEE_REQUESTER",
              "scope_kind": "unit",
              "requesting_unit_id": "77",
              "starts_at": "2026-10-25T06:00:00.000000Z",
              "ends_at": null,
              "revoked_at": null
            }
          ],
          "available_actions": [],
          "provider_roles": []
        }
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {
      "query": {
        "chapter_id": "2"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "selection_revision": "ctx_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "chapter_state": "selected",
        "selection_source": "explicit",
        "membership": {
          "chapter_id": "2",
          "chapter_name": "YSP Liloan",
          "membership_id": "9007199254741002",
          "membership_version": 2
        },
        "context": {
          "schema_version": "1.0",
          "user_id": "9007199254740994",
          "chapter_id": "2",
          "chapter_name": "YSP Liloan",
          "membership_id": "9007199254741002",
          "authority_version": 7,
          "checked_at": "2026-10-25T06:10:00.000000Z",
          "mfa_satisfied": true,
          "duty_grants": [
            {
              "id": "9007199254741011",
              "duty_code": "FINANCE",
              "scope_kind": "chapter",
              "requesting_unit_id": null,
              "starts_at": "2026-10-25T06:00:00.000000Z",
              "ends_at": null,
              "revoked_at": null
            }
          ],
          "available_actions": [
            "policy.status.read",
            "policy.financial.read",
            "policy.financial.prepare",
            "policy.financial.approve"
          ],
          "provider_roles": []
        }
      }
    }
  },
  {
    "operationId": "listChapterMemberships",
    "request": {
      "query": {
        "limit": 1
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "items": [],
        "limit": 1,
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "listChapterMemberships",
    "request": {
      "query": {
        "limit": 1
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "items": [
          {
            "chapter_id": "1",
            "chapter_name": "YSP Cebu",
            "membership_id": "9007199254741001",
            "membership_version": 3
          }
        ],
        "limit": 1,
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "listChapterMemberships",
    "request": {
      "query": {
        "limit": 1
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "items": [
          {
            "chapter_id": "1",
            "chapter_name": "YSP Cebu",
            "membership_id": "9007199254741001",
            "membership_version": 3
          }
        ],
        "limit": 1,
        "next_cursor": "cur_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    }
  },
  {
    "operationId": "listChapterMemberships",
    "request": {
      "query": {
        "limit": 1,
        "cursor": "cur_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "items": [
          {
            "chapter_id": "2",
            "chapter_name": "YSP Liloan",
            "membership_id": "9007199254741002",
            "membership_version": 2
          }
        ],
        "limit": 1,
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "1",
        "membership_id": "9007199254741001",
        "expected_membership_version": 3
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "selection_revision": "ctx_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "chapter_state": "selected",
        "selection_source": "explicit",
        "membership": {
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "membership_version": 3
        },
        "context": {
          "schema_version": "1.0",
          "user_id": "9007199254740994",
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "authority_version": 7,
          "checked_at": "2026-10-25T06:10:00.000000Z",
          "mfa_satisfied": true,
          "duty_grants": [
            {
              "id": "9007199254741010",
              "duty_code": "CHAPTER_HEAD",
              "scope_kind": "chapter",
              "requesting_unit_id": null,
              "starts_at": "2026-10-25T06:00:00.000000Z",
              "ends_at": null,
              "revoked_at": null
            }
          ],
          "available_actions": [
            "memberships.read",
            "memberships.prepare",
            "memberships.authorize",
            "memberships.revoke",
            "duty_grants.read",
            "duty_grants.prepare",
            "duty_grants.authorize",
            "duty_grants.revoke",
            "alternates.read",
            "alternates.prepare",
            "alternates.authorize",
            "alternates.revoke",
            "memberships.disable",
            "policy.status.read",
            "policy.operational.read",
            "policy.operational.prepare",
            "policy.operational.approve",
            "identities.reference.read"
          ],
          "provider_roles": []
        }
      }
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "2",
        "membership_id": "9007199254741002",
        "expected_membership_version": 2
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "selection_revision": "ctx_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        "chapter_state": "selected",
        "selection_source": "explicit",
        "membership": {
          "chapter_id": "2",
          "chapter_name": "YSP Liloan",
          "membership_id": "9007199254741002",
          "membership_version": 2
        },
        "context": {
          "schema_version": "1.0",
          "user_id": "9007199254740994",
          "chapter_id": "2",
          "chapter_name": "YSP Liloan",
          "membership_id": "9007199254741002",
          "authority_version": 7,
          "checked_at": "2026-10-25T06:10:00.000000Z",
          "mfa_satisfied": true,
          "duty_grants": [
            {
              "id": "9007199254741011",
              "duty_code": "FINANCE",
              "scope_kind": "chapter",
              "requesting_unit_id": null,
              "starts_at": "2026-10-25T06:00:00.000000Z",
              "ends_at": null,
              "revoked_at": null
            }
          ],
          "available_actions": [
            "policy.status.read",
            "policy.financial.read",
            "policy.financial.prepare",
            "policy.financial.approve"
          ],
          "provider_roles": []
        }
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Refresh current context and review the original scope before another attempt.",
        "next_action": "refresh_context"
      }
    }
  },
  {
    "operationId": "listChapterMemberships",
    "request": {},
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "listChapterMemberships",
    "request": {},
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "listChapterMemberships",
    "request": {},
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "listChapterMemberships",
    "request": {},
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "1",
        "membership_id": "9007199254741001",
        "expected_membership_version": 3
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "1",
        "membership_id": "9007199254741001",
        "expected_membership_version": 3
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "1",
        "membership_id": "9007199254741001",
        "expected_membership_version": 3
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "1",
        "membership_id": "9007199254741001",
        "expected_membership_version": 3
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "1",
        "membership_id": "9007199254741001",
        "expected_membership_version": 3
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Refresh current context and review the original scope before another attempt.",
        "next_action": "refresh_context"
      }
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "1",
        "membership_id": "9007199254741001",
        "expected_membership_version": 3
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "99",
        "membership_id": "99",
        "expected_membership_version": 1
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "99",
        "membership_id": "99",
        "expected_membership_version": 1
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "99",
        "membership_id": "99",
        "expected_membership_version": 1
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "selectChapter",
    "request": {
      "body": {
        "chapter_id": "1",
        "membership_id": "9007199254741001",
        "expected_membership_version": 3
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Refresh current context and review the original scope before another attempt.",
        "next_action": "refresh_context"
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {},
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Refresh current context and review the original scope before another attempt.",
        "next_action": "refresh_context"
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {
      "query": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": [
            {
              "kind": "chapter_provisioning",
              "scope": {
                "kind": "organization",
                "organization_id": "1"
              }
            }
          ]
        },
        "selection_revision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "chapter_state": "selected",
        "selection_source": "explicit",
        "membership": {
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "membership_version": 3
        },
        "context": {
          "schema_version": "1.0",
          "user_id": "9007199254740994",
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "authority_version": 7,
          "checked_at": "2026-10-25T06:10:00.000000Z",
          "mfa_satisfied": true,
          "duty_grants": [
            {
              "id": "9007199254741010",
              "duty_code": "CHAPTER_HEAD",
              "scope_kind": "chapter",
              "requesting_unit_id": null,
              "starts_at": "2026-10-25T06:00:00.000000Z",
              "ends_at": null,
              "revoked_at": null
            }
          ],
          "available_actions": [
            "memberships.read",
            "memberships.prepare",
            "memberships.authorize",
            "memberships.revoke",
            "duty_grants.read",
            "duty_grants.prepare",
            "duty_grants.authorize",
            "duty_grants.revoke",
            "alternates.read",
            "alternates.prepare",
            "alternates.authorize",
            "alternates.revoke",
            "memberships.disable",
            "policy.status.read",
            "policy.operational.read",
            "policy.operational.prepare",
            "policy.operational.approve",
            "identities.reference.read"
          ],
          "provider_roles": [
            "provisioner"
          ]
        }
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "request": {
      "query": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "session": {
          "state": "authenticated",
          "user": {
            "id": "9007199254740994",
            "display_name": "Synthetic approver"
          },
          "mfa": {
            "status": "verified",
            "verified_at": "2026-10-25T06:00:00.000000Z"
          },
          "provider_destinations": []
        },
        "selection_revision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "chapter_state": "selected",
        "selection_source": "explicit",
        "membership": {
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "membership_version": 3
        },
        "context": {
          "schema_version": "1.0",
          "user_id": "9007199254740994",
          "chapter_id": "1",
          "chapter_name": "YSP Cebu",
          "membership_id": "9007199254741001",
          "authority_version": 7,
          "checked_at": "2026-10-25T06:10:00.000000Z",
          "mfa_satisfied": true,
          "duty_grants": [],
          "available_actions": [],
          "provider_roles": []
        }
      }
    }
  },
  {
    "operationId": "listMemberships",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [
          {
            "membership_id": "9007199254740995",
            "chapter_id": "1",
            "identity": {
              "user_id": "9007199254740994",
              "display_name": "Synthetic member"
            },
            "status": "authorized",
            "version": 3,
            "authority_version": 4,
            "authorized": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "disabled": null,
            "revoked": null,
            "history_reference": "mh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
          }
        ],
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "listMemberships",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [],
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "listMemberships",
    "request": {
      "query": {
        "limit": 1,
        "status": "authorized"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [
          {
            "membership_id": "9007199254740995",
            "chapter_id": "1",
            "identity": {
              "user_id": "9007199254740994",
              "display_name": "Synthetic member"
            },
            "status": "authorized",
            "version": 3,
            "authority_version": 4,
            "authorized": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "disabled": null,
            "revoked": null,
            "history_reference": "mh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
          }
        ],
        "next_cursor": "cur_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    }
  },
  {
    "operationId": "listMemberships",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "listMemberships",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "listMemberships",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "listMemberships",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "listMemberships",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "listMemberships",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "listMemberships",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readMembership",
    "request": {
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "membership_id": "9007199254740995",
        "chapter_id": "1",
        "identity": {
          "user_id": "9007199254740994",
          "display_name": "Synthetic member"
        },
        "status": "authorized",
        "version": 3,
        "authority_version": 4,
        "authorized": {
          "user_id": "9007199254740996",
          "at": "2026-10-25T06:00:00.123456Z"
        },
        "disabled": null,
        "revoked": null,
        "history_reference": "mh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    }
  },
  {
    "operationId": "readMembership",
    "request": {
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "readMembership",
    "request": {
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "readMembership",
    "request": {
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "readMembership",
    "request": {
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "readMembership",
    "request": {
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readMembership",
    "request": {
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readMembership",
    "request": {
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readMembership",
    "request": {
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "membership_not_visible",
        "message": "Membership unavailable."
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "identity": {
          "user_id": "9007199254740994",
          "display_name": "Synthetic member"
        }
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "identity": null
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "identity": null
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "identity": null
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "request": {
      "body": {
        "user_id": "9007199254740994"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740994"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "membership",
        "action_result": "success",
        "chapter_id": "1",
        "membership": {
          "membership_id": "9007199254740995",
          "chapter_id": "1",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "status": "authorized",
          "version": 3,
          "authority_version": 4,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "disabled": null,
          "revoked": null,
          "history_reference": "mh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.authorize",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740994"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "membership",
        "action_result": "success",
        "chapter_id": "1",
        "membership": {
          "membership_id": "9007199254740995",
          "chapter_id": "1",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "status": "authorized",
          "version": 3,
          "authority_version": 4,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "disabled": null,
          "revoked": null,
          "history_reference": "mh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.authorize",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740994"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740994"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740994"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740994"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740994"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740994"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740994"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740997"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740994"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "membership",
        "action_result": "success",
        "chapter_id": "1",
        "membership": {
          "membership_id": "9007199254740995",
          "chapter_id": "1",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "status": "disabled",
          "version": 4,
          "authority_version": 5,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "disabled": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "revoked": null,
          "history_reference": "mh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.disable",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "membership",
        "action_result": "success",
        "chapter_id": "1",
        "membership": {
          "membership_id": "9007199254740995",
          "chapter_id": "1",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "status": "disabled",
          "version": 4,
          "authority_version": 5,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "disabled": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "revoked": null,
          "history_reference": "mh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.disable",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 4
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "membership",
        "action_result": "success",
        "chapter_id": "1",
        "membership": {
          "membership_id": "9007199254740995",
          "chapter_id": "1",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "status": "revoked",
          "version": 4,
          "authority_version": 5,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "disabled": null,
          "revoked": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "mh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.revoke",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "membership",
        "action_result": "success",
        "chapter_id": "1",
        "membership": {
          "membership_id": "9007199254740995",
          "chapter_id": "1",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "status": "revoked",
          "version": 4,
          "authority_version": 5,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "disabled": null,
          "revoked": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "mh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.revoke",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 4
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "memberships.authorize",
        "idempotency_key": "membership-attempt-01"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "membership",
        "action_result": "success",
        "chapter_id": "1",
        "membership": {
          "membership_id": "9007199254740995",
          "chapter_id": "1",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "status": "authorized",
          "version": 3,
          "authority_version": 4,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "disabled": null,
          "revoked": null,
          "history_reference": "mh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.authorize",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "membership",
        "action_result": "success",
        "chapter_id": "1",
        "membership": {
          "membership_id": "9007199254740995",
          "chapter_id": "1",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "status": "authorized",
          "version": 3,
          "authority_version": 4,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "disabled": null,
          "revoked": null,
          "history_reference": "mh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.authorize",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "memberships.authorize",
        "idempotency_key": "membership-attempt-01"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "memberships.authorize",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "NO_VISIBLE_TERMINAL_RESULT",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "pending_or_not_visible"
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "memberships.authorize",
        "idempotency_key": "membership-attempt-01"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "memberships.authorize",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "LOOKUP_UNAVAILABLE",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "unavailable"
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "memberships.authorize",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "NO_VISIBLE_TERMINAL_RESULT",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "pending_or_not_visible"
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "memberships.authorize",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "LOOKUP_UNAVAILABLE",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "unavailable"
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "memberships.authorize",
        "idempotency_key": "membership-attempt-01"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "membership",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.authorize",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        },
        "code": "membership_state_conflict",
        "message": "Membership state requires review.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "membership",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.authorize",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        },
        "code": "membership_state_conflict",
        "message": "Membership state requires review.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "identity": {
          "user_id": "9007199254740994"
        },
        "expected_membership_version": null
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "membership",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.authorize",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "membership_state_conflict",
        "message": "Membership state requires review.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "disableMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "membership",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.disable",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "membership_state_conflict",
        "message": "Membership state requires review.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "request": {
      "body": {
        "idempotency_key": "membership-attempt-01",
        "expected_authority_version": 9,
        "expected_membership_version": 3
      },
      "path": {
        "chapter_id": "1",
        "membership_id": "9007199254740995"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "membership",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "memberships.revoke",
            "idempotency_key": "membership-attempt-01"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "membership_state_conflict",
        "message": "Membership state requires review.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readDutyCatalogue",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [
          {
            "duty_code": "BOOTH_CASHIER"
          },
          {
            "duty_code": "BOOTH_CUSTODIAN"
          },
          {
            "duty_code": "BUDGET_APPROVER"
          },
          {
            "duty_code": "CHAPTER_HEAD"
          },
          {
            "duty_code": "COMMITTEE_REQUESTER"
          },
          {
            "duty_code": "DISPATCH"
          },
          {
            "duty_code": "FINANCE"
          },
          {
            "duty_code": "INDEPENDENT_REVIEWER"
          },
          {
            "duty_code": "INVENTORY"
          },
          {
            "duty_code": "PURCHASING"
          },
          {
            "duty_code": "RECEIVING"
          },
          {
            "duty_code": "RF_APPROVER"
          },
          {
            "duty_code": "SALES_OFFICER"
          },
          {
            "duty_code": "SALES_REVIEWER"
          }
        ]
      }
    }
  },
  {
    "operationId": "readDutyCatalogue",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "readDutyCatalogue",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "readDutyCatalogue",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "readDutyCatalogue",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "readDutyCatalogue",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readDutyCatalogue",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readDutyCatalogue",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readDutyCatalogue",
    "request": {
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "grant_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [
          {
            "id": "9007199254741001",
            "chapter_id": "1",
            "membership_id": "9007199254740995",
            "identity": {
              "user_id": "9007199254740994",
              "display_name": "Synthetic member"
            },
            "duty_code": "RF_APPROVER",
            "scope_kind": "chapter",
            "requesting_unit_id": null,
            "starts_at": "2026-10-26T00:00:00.000000Z",
            "ends_at": null,
            "monetary_limit": {
              "currency": "PHP",
              "amount": "1000.00"
            },
            "version": 1,
            "membership_version": 4,
            "authority_version": 5,
            "is_alternate": false,
            "replaces_grant_id": null,
            "revoked_at": null,
            "authorized": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "last_changed": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
          }
        ],
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "duty_grant_not_visible",
        "message": "Reference unavailable."
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "grant_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readDutyGrant",
    "request": {
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "id": "9007199254741001",
        "chapter_id": "1",
        "membership_id": "9007199254740995",
        "identity": {
          "user_id": "9007199254740994",
          "display_name": "Synthetic member"
        },
        "duty_code": "RF_APPROVER",
        "scope_kind": "chapter",
        "requesting_unit_id": null,
        "starts_at": "2026-10-26T00:00:00.000000Z",
        "ends_at": null,
        "monetary_limit": {
          "currency": "PHP",
          "amount": "1000.00"
        },
        "version": 1,
        "membership_version": 4,
        "authority_version": 5,
        "is_alternate": false,
        "replaces_grant_id": null,
        "revoked_at": null,
        "authorized": {
          "user_id": "9007199254740996",
          "at": "2026-10-25T06:00:00.123456Z"
        },
        "last_changed": {
          "user_id": "9007199254740996",
          "at": "2026-10-25T06:00:00.123456Z"
        },
        "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    }
  },
  {
    "operationId": "readDutyGrant",
    "request": {
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "readDutyGrant",
    "request": {
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "readDutyGrant",
    "request": {
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "duty_grant_not_visible",
        "message": "Reference unavailable."
      }
    }
  },
  {
    "operationId": "readDutyGrant",
    "request": {
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "readDutyGrant",
    "request": {
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "readDutyGrant",
    "request": {
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readDutyGrant",
    "request": {
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readDutyGrant",
    "request": {
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readDutyGrant",
    "request": {
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "grant_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 1,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 1,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "duty_grant_not_visible",
        "message": "Reference unavailable."
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "grant_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "duty_grant_state_conflict",
        "message": "Current grant state cannot accept this change.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          },
          "version": 3,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254741025",
            "at": "2026-10-24T06:00:00.000000Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.prepare",
            "idempotency_key": "duty-attempt-amendDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          },
          "version": 3,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254741025",
            "at": "2026-10-24T06:00:00.000000Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.prepare",
            "idempotency_key": "duty-attempt-amendDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "duty_grant_not_visible",
        "message": "Reference unavailable."
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "grant_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "500.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.prepare",
            "idempotency_key": "duty-attempt-amendDutyGrant"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "duty_grant_state_conflict",
        "message": "Current grant state cannot accept this change.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 3,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254741025",
            "at": "2026-10-24T06:00:00.000000Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.revoke",
            "idempotency_key": "duty-attempt-endDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 3,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254741025",
            "at": "2026-10-24T06:00:00.000000Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.revoke",
            "idempotency_key": "duty-attempt-endDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "duty_grant_not_visible",
        "message": "Reference unavailable."
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "grant_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-endDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "ends_at": "2026-11-01T00:00:00.000000Z"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.revoke",
            "idempotency_key": "duty-attempt-endDutyGrant"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "duty_grant_state_conflict",
        "message": "Current grant state cannot accept this change.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 3,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": "2026-10-25T06:00:00.123456Z",
          "authorized": {
            "user_id": "9007199254741025",
            "at": "2026-10-24T06:00:00.000000Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.revoke",
            "idempotency_key": "duty-attempt-revokeDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 3,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": "2026-10-25T06:00:00.123456Z",
          "authorized": {
            "user_id": "9007199254741025",
            "at": "2026-10-24T06:00:00.000000Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.revoke",
            "idempotency_key": "duty-attempt-revokeDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "duty_grant_not_visible",
        "message": "Reference unavailable."
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "grant_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-revokeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization"
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.revoke",
            "idempotency_key": "duty-attempt-revokeDutyGrant"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "duty_grant_state_conflict",
        "message": "Current grant state cannot accept this change.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741011",
          "chapter_id": "1",
          "membership_id": "9007199254741010",
          "identity": {
            "user_id": "9007199254741012",
            "display_name": "Synthetic independent alternate"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 1,
          "membership_version": 3,
          "authority_version": 4,
          "is_alternate": true,
          "replaces_grant_id": "9007199254741001",
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": "2026-10-27T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 3,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254741025",
            "at": "2026-10-24T06:00:00.000000Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "alternates.authorize",
            "idempotency_key": "duty-attempt-substituteDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741011",
          "chapter_id": "1",
          "membership_id": "9007199254741010",
          "identity": {
            "user_id": "9007199254741012",
            "display_name": "Synthetic independent alternate"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 1,
          "membership_version": 3,
          "authority_version": 4,
          "is_alternate": true,
          "replaces_grant_id": "9007199254741001",
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": "2026-10-27T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 3,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254741025",
            "at": "2026-10-24T06:00:00.000000Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "alternates.authorize",
            "idempotency_key": "duty-attempt-substituteDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "duty_grant_not_visible",
        "message": "Reference unavailable."
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "30"
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "membership_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "grant_stale",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt with current access.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741010",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "alternates.authorize",
            "idempotency_key": "duty-attempt-substituteDutyGrant"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "duty_grant_state_conflict",
        "message": "Current grant state cannot accept this change.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "unit",
          "requesting_unit_id": "12",
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "unit",
          "requesting_unit_id": "12",
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 1,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-authorizeDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": null,
        "reason": "Synthetic explicit chapter authorization",
        "membership_id": "9007199254740995",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": null
        }
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": null,
          "version": 1,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [],
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 1,
        "duty_code": "RF_APPROVER"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [
          {
            "id": "9007199254741001",
            "chapter_id": "1",
            "membership_id": "9007199254740995",
            "identity": {
              "user_id": "9007199254740994",
              "display_name": "Synthetic member"
            },
            "duty_code": "RF_APPROVER",
            "scope_kind": "chapter",
            "requesting_unit_id": null,
            "starts_at": "2026-10-26T00:00:00.000000Z",
            "ends_at": null,
            "monetary_limit": {
              "currency": "PHP",
              "amount": "1000.00"
            },
            "version": 1,
            "membership_version": 4,
            "authority_version": 5,
            "is_alternate": false,
            "replaces_grant_id": null,
            "revoked_at": null,
            "authorized": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "last_changed": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
          }
        ],
        "next_cursor": "cur_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "request": {
      "query": {
        "limit": 50
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [
          {
            "id": "9007199254741001",
            "chapter_id": "1",
            "membership_id": "9007199254740995",
            "identity": {
              "user_id": "9007199254740994",
              "display_name": "Synthetic member"
            },
            "duty_code": "RF_APPROVER",
            "scope_kind": "chapter",
            "requesting_unit_id": null,
            "starts_at": "2026-10-26T00:00:00.000000Z",
            "ends_at": null,
            "monetary_limit": {
              "currency": "PHP",
              "amount": "1000.00"
            },
            "version": 1,
            "membership_version": 4,
            "authority_version": 5,
            "is_alternate": false,
            "replaces_grant_id": null,
            "revoked_at": null,
            "authorized": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "last_changed": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
          },
          {
            "id": "9007199254741002",
            "chapter_id": "1",
            "membership_id": "9007199254740995",
            "identity": {
              "user_id": "9007199254740994",
              "display_name": "Synthetic member"
            },
            "duty_code": "RECEIVING",
            "scope_kind": "chapter",
            "requesting_unit_id": null,
            "starts_at": "2026-10-26T00:00:00.000000Z",
            "ends_at": null,
            "monetary_limit": {
              "currency": "PHP",
              "amount": "1000.00"
            },
            "version": 1,
            "membership_version": 4,
            "authority_version": 5,
            "is_alternate": false,
            "replaces_grant_id": null,
            "revoked_at": null,
            "authorized": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "last_changed": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
          }
        ],
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-substituteDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "target_membership_id": "9007199254741020",
        "expected_target_membership_version": 2,
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-27T00:00:00.000000Z",
          "ends_at": "2026-11-01T00:00:00.000000Z",
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "duty_grant_not_visible",
        "message": "Reference unavailable."
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "request": {
      "body": {
        "idempotency_key": "duty-attempt-amendDutyGrant",
        "expected_authority_version": 9,
        "expected_membership_version": 3,
        "expected_grant_version": 2,
        "reason": "Synthetic explicit chapter authorization",
        "grant": {
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "2000.00"
          }
        }
      },
      "path": {
        "chapter_id": "1",
        "grant_id": "9007199254741001"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "duty_grants.authorize",
        "idempotency_key": "duty-attempt-authorizeDutyGrant"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 1,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "duty_grants.authorize",
        "idempotency_key": "duty-attempt-authorizeDutyGrant"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        },
        "code": "duty_grant_state_conflict",
        "message": "Current grant state cannot accept this change.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "duty_grants.authorize",
        "idempotency_key": "duty-attempt-authorizeDutyGrant"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "NO_VISIBLE_TERMINAL_RESULT",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "pending_or_not_visible"
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "duty_grants.authorize",
        "idempotency_key": "duty-attempt-authorizeDutyGrant"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "LOOKUP_UNAVAILABLE",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "unavailable"
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "success",
        "chapter_id": "1",
        "grant": {
          "id": "9007199254741001",
          "chapter_id": "1",
          "membership_id": "9007199254740995",
          "identity": {
            "user_id": "9007199254740994",
            "display_name": "Synthetic member"
          },
          "duty_code": "RF_APPROVER",
          "scope_kind": "chapter",
          "requesting_unit_id": null,
          "starts_at": "2026-10-26T00:00:00.000000Z",
          "ends_at": null,
          "monetary_limit": {
            "currency": "PHP",
            "amount": "1000.00"
          },
          "version": 1,
          "membership_version": 4,
          "authority_version": 5,
          "is_alternate": false,
          "replaces_grant_id": null,
          "revoked_at": null,
          "authorized": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "history_reference": "gh_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        },
        "replaced_grant": null,
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "duty_grant",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        },
        "code": "duty_grant_state_conflict",
        "message": "Current grant state cannot accept this change.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "NO_VISIBLE_TERMINAL_RESULT",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "pending_or_not_visible"
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "LOOKUP_UNAVAILABLE",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "unavailable"
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "chapter_id": "1",
        "evaluated_at": "2026-10-25T06:00:00.123456Z",
        "affected_action": "records.submit",
        "blockers": [
          {
            "policy_code": "OPERATIONAL_ROOT",
            "category": "operational",
            "responsible_duty": "CHAPTER_HEAD",
            "state": "missing",
            "affected_action": "records.submit",
            "message": "Required operational policy is missing.",
            "permitted_next_steps": [
              "prepare_permitted_draft",
              "request_responsible_duty"
            ]
          }
        ]
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "policy_not_visible",
        "message": "Policy reference is not visible."
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_row_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "60"
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "listPolicyRoots",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [
          {
            "id": "9007199254740998",
            "chapter_id": "1",
            "policy_code": "OPERATIONAL_ROOT",
            "category": "operational",
            "responsible_duty": "CHAPTER_HEAD",
            "row_version": 4,
            "latest_version_id": "9007199254740999",
            "created": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "last_changed": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            }
          }
        ],
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "listPolicyRoots",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "listPolicyRoots",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "listPolicyRoots",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "policy_not_visible",
        "message": "Policy reference is not visible."
      }
    }
  },
  {
    "operationId": "listPolicyRoots",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_row_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "listPolicyRoots",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "60"
    }
  },
  {
    "operationId": "listPolicyRoots",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "readPolicyRoot",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "id": "9007199254740998",
        "chapter_id": "1",
        "policy_code": "OPERATIONAL_ROOT",
        "category": "operational",
        "responsible_duty": "CHAPTER_HEAD",
        "row_version": 4,
        "latest_version_id": "9007199254740999",
        "created": {
          "user_id": "9007199254740996",
          "at": "2026-10-25T06:00:00.123456Z"
        },
        "last_changed": {
          "user_id": "9007199254740996",
          "at": "2026-10-25T06:00:00.123456Z"
        }
      }
    }
  },
  {
    "operationId": "readPolicyRoot",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "readPolicyRoot",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "readPolicyRoot",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "policy_not_visible",
        "message": "Policy reference is not visible."
      }
    }
  },
  {
    "operationId": "readPolicyRoot",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_row_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readPolicyRoot",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "60"
    }
  },
  {
    "operationId": "readPolicyRoot",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "listPolicyVersions",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [
          {
            "id": "9007199254740999",
            "chapter_id": "1",
            "policy_id": "9007199254740998",
            "policy_code": "OPERATIONAL_ROOT",
            "category": "operational",
            "responsible_duty": "CHAPTER_HEAD",
            "version_no": 2,
            "row_version": 4,
            "metadata": {
              "name": "Synthetic operational policy",
              "schema_id": "urn:ysp:policy:synthetic-owner-reference",
              "schema_version": 1,
              "effective_from": "2026-10-26T00:00:00.000000Z",
              "effective_until": null,
              "supersedes_version_id": null
            },
            "material": {
              "chapter_id": "1",
              "record": {
                "id": "9007199254741010",
                "kind": "CONFIG"
              },
              "material_version": 3,
              "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
            "schema_support": "registered_reference",
            "review_state": "reviewed",
            "effective_state": "not_approved",
            "reason": "Synthetic complete material reference",
            "created": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "last_changed": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "decisions": [],
            "approved_policy": null
          }
        ],
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "listPolicyVersions",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "listPolicyVersions",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "listPolicyVersions",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "policy_not_visible",
        "message": "Policy reference is not visible."
      }
    }
  },
  {
    "operationId": "listPolicyVersions",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_row_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "listPolicyVersions",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "60"
    }
  },
  {
    "operationId": "listPolicyVersions",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "readPolicyVersion",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "id": "9007199254740999",
        "chapter_id": "1",
        "policy_id": "9007199254740998",
        "policy_code": "OPERATIONAL_ROOT",
        "category": "operational",
        "responsible_duty": "CHAPTER_HEAD",
        "version_no": 2,
        "row_version": 4,
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        },
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "schema_support": "registered_reference",
        "review_state": "reviewed",
        "effective_state": "not_approved",
        "reason": "Synthetic complete material reference",
        "created": {
          "user_id": "9007199254740996",
          "at": "2026-10-25T06:00:00.123456Z"
        },
        "last_changed": {
          "user_id": "9007199254740996",
          "at": "2026-10-25T06:00:00.123456Z"
        },
        "decisions": [],
        "approved_policy": null
      }
    }
  },
  {
    "operationId": "readPolicyVersion",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "readPolicyVersion",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "readPolicyVersion",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "policy_not_visible",
        "message": "Policy reference is not visible."
      }
    }
  },
  {
    "operationId": "readPolicyVersion",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_row_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "readPolicyVersion",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "60"
    }
  },
  {
    "operationId": "readPolicyVersion",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": null,
          "schema_support": "missing",
          "review_state": "draft",
          "effective_state": "not_approved",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [],
          "approved_policy": null
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.prepare",
            "idempotency_key": "policy-attempt-savePolicyDraft"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "policy_not_visible",
        "message": "Policy reference is not visible."
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_row_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "60"
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": {
            "chapter_id": "1",
            "record": {
              "id": "9007199254741010",
              "kind": "CONFIG"
            },
            "material_version": 3,
            "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          },
          "schema_support": "registered_reference",
          "review_state": "submitted",
          "effective_state": "not_approved",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [],
          "approved_policy": null
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.prepare",
            "idempotency_key": "policy-attempt-submitPolicyVersion"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "policy_not_visible",
        "message": "Policy reference is not visible."
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_row_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "60"
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "reviewPolicyVersion",
    "request": {
      "query": {
        "expected_material_version": 3,
        "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "id": "9007199254740999",
        "chapter_id": "1",
        "policy_id": "9007199254740998",
        "policy_code": "OPERATIONAL_ROOT",
        "category": "operational",
        "responsible_duty": "CHAPTER_HEAD",
        "version_no": 2,
        "row_version": 4,
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        },
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "schema_support": "registered_reference",
        "review_state": "reviewed",
        "effective_state": "not_approved",
        "reason": "Synthetic complete material reference",
        "created": {
          "user_id": "9007199254740996",
          "at": "2026-10-25T06:00:00.123456Z"
        },
        "last_changed": {
          "user_id": "9007199254740996",
          "at": "2026-10-25T06:00:00.123456Z"
        },
        "decisions": [],
        "approved_policy": null
      }
    }
  },
  {
    "operationId": "reviewPolicyVersion",
    "request": {
      "query": {
        "expected_material_version": 3,
        "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "reviewPolicyVersion",
    "request": {
      "query": {
        "expected_material_version": 3,
        "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "reviewPolicyVersion",
    "request": {
      "query": {
        "expected_material_version": 3,
        "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "policy_not_visible",
        "message": "Policy reference is not visible."
      }
    }
  },
  {
    "operationId": "reviewPolicyVersion",
    "request": {
      "query": {
        "expected_material_version": 3,
        "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_row_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "reviewPolicyVersion",
    "request": {
      "query": {
        "expected_material_version": 3,
        "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "60"
    }
  },
  {
    "operationId": "reviewPolicyVersion",
    "request": {
      "query": {
        "expected_material_version": 3,
        "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": {
            "chapter_id": "1",
            "record": {
              "id": "9007199254741010",
              "kind": "CONFIG"
            },
            "material_version": 3,
            "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          },
          "schema_support": "registered_reference",
          "review_state": "approved",
          "effective_state": "scheduled",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [
            {
              "decision": "approve",
              "material": {
                "chapter_id": "1",
                "record": {
                  "id": "9007199254741010",
                  "kind": "CONFIG"
                },
                "material_version": 3,
                "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              },
              "authority_version": 9,
              "duty_grant_id": "9007199254741000",
              "duty": "CHAPTER_HEAD",
              "reason": "Synthetic exact material approval",
              "effective_from": "2026-10-26T00:00:00.000000Z",
              "effective_until": null,
              "actor": {
                "user_id": "9007199254740996",
                "at": "2026-10-25T06:00:00.123456Z"
              }
            }
          ],
          "approved_policy": {
            "chapter_id": "1",
            "policy_id": "9007199254740998",
            "policy_version_id": "9007199254740999",
            "version_no": 2,
            "settings_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "approval": {
              "chapter_id": "1",
              "record": {
                "id": "9007199254741010",
                "kind": "CONFIG"
              },
              "material_version": 3,
              "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null
          }
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-attempt-approvePolicyVersion"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "policy_not_visible",
        "message": "Policy reference is not visible."
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_row_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "60"
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": {
            "chapter_id": "1",
            "record": {
              "id": "9007199254741010",
              "kind": "CONFIG"
            },
            "material_version": 3,
            "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          },
          "schema_support": "registered_reference",
          "review_state": "returned",
          "effective_state": "not_approved",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [
            {
              "decision": "return",
              "material": {
                "chapter_id": "1",
                "record": {
                  "id": "9007199254741010",
                  "kind": "CONFIG"
                },
                "material_version": 3,
                "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              },
              "authority_version": 9,
              "duty_grant_id": "9007199254741000",
              "duty": "CHAPTER_HEAD",
              "reason": "Synthetic exact material approval",
              "effective_from": "2026-10-26T00:00:00.000000Z",
              "effective_until": null,
              "actor": {
                "user_id": "9007199254740996",
                "at": "2026-10-25T06:00:00.123456Z"
              }
            }
          ],
          "approved_policy": null
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-attempt-returnPolicyVersion"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 401,
      "body": {
        "code": "authentication_required",
        "message": "Sign in to continue."
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 403,
      "body": {
        "code": "forbidden",
        "message": "This request is not permitted."
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 404,
      "body": {
        "code": "policy_not_visible",
        "message": "Policy reference is not visible."
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_row_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 429,
      "body": {
        "code": "throttled",
        "message": "Try again after the indicated delay."
      },
      "retryAfter": "60"
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "code": "unavailable",
        "message": "The session service is unavailable."
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 419,
      "body": {
        "code": "csrf_mismatch",
        "message": "Refresh CSRF before a reviewed new attempt."
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": null,
          "schema_support": "missing",
          "review_state": "draft",
          "effective_state": "not_approved",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [],
          "approved_policy": null
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.prepare",
            "idempotency_key": "policy-attempt-savePolicyDraft"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_material_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-savePolicyDraft",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": {
            "chapter_id": "1",
            "record": {
              "id": "9007199254741010",
              "kind": "CONFIG"
            },
            "material_version": 3,
            "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          },
          "schema_support": "registered_reference",
          "review_state": "submitted",
          "effective_state": "not_approved",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [],
          "approved_policy": null
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.prepare",
            "idempotency_key": "policy-attempt-submitPolicyVersion"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_material_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-submitPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": {
            "chapter_id": "1",
            "record": {
              "id": "9007199254741010",
              "kind": "CONFIG"
            },
            "material_version": 3,
            "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          },
          "schema_support": "registered_reference",
          "review_state": "approved",
          "effective_state": "scheduled",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [
            {
              "decision": "approve",
              "material": {
                "chapter_id": "1",
                "record": {
                  "id": "9007199254741010",
                  "kind": "CONFIG"
                },
                "material_version": 3,
                "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              },
              "authority_version": 9,
              "duty_grant_id": "9007199254741000",
              "duty": "CHAPTER_HEAD",
              "reason": "Synthetic exact material approval",
              "effective_from": "2026-10-26T00:00:00.000000Z",
              "effective_until": null,
              "actor": {
                "user_id": "9007199254740996",
                "at": "2026-10-25T06:00:00.123456Z"
              }
            }
          ],
          "approved_policy": {
            "chapter_id": "1",
            "policy_id": "9007199254740998",
            "policy_version_id": "9007199254740999",
            "version_no": 2,
            "settings_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "approval": {
              "chapter_id": "1",
              "record": {
                "id": "9007199254741010",
                "kind": "CONFIG"
              },
              "material_version": 3,
              "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null
          }
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-attempt-approvePolicyVersion"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_material_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-approvePolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": {
            "chapter_id": "1",
            "record": {
              "id": "9007199254741010",
              "kind": "CONFIG"
            },
            "material_version": 3,
            "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          },
          "schema_support": "registered_reference",
          "review_state": "returned",
          "effective_state": "not_approved",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [
            {
              "decision": "return",
              "material": {
                "chapter_id": "1",
                "record": {
                  "id": "9007199254741010",
                  "kind": "CONFIG"
                },
                "material_version": 3,
                "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              },
              "authority_version": 9,
              "duty_grant_id": "9007199254741000",
              "duty": "CHAPTER_HEAD",
              "reason": "Synthetic exact material approval",
              "effective_from": "2026-10-26T00:00:00.000000Z",
              "effective_until": null,
              "actor": {
                "user_id": "9007199254740996",
                "at": "2026-10-25T06:00:00.123456Z"
              }
            }
          ],
          "approved_policy": null
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-attempt-returnPolicyVersion"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_material_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "authority_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "chapter_context_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-attempt-returnPolicyVersion",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "idempotency_conflict",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "listPolicyRoots",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [],
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "listPolicyRoots",
    "request": {
      "query": {
        "limit": 1,
        "cursor": "cur_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      },
      "path": {
        "chapter_id": "1",
        "category": "operational"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [
          {
            "id": "9007199254740998",
            "chapter_id": "1",
            "policy_code": "OPERATIONAL_ROOT",
            "category": "operational",
            "responsible_duty": "CHAPTER_HEAD",
            "row_version": 4,
            "latest_version_id": "9007199254740999",
            "created": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "last_changed": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            }
          }
        ],
        "next_cursor": "cur_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
      }
    }
  },
  {
    "operationId": "listPolicyVersions",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [],
        "next_cursor": null
      }
    }
  },
  {
    "operationId": "listPolicyVersions",
    "request": {
      "query": {
        "limit": 1,
        "cursor": "cur_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "items": [
          {
            "id": "9007199254740999",
            "chapter_id": "1",
            "policy_id": "9007199254740998",
            "policy_code": "OPERATIONAL_ROOT",
            "category": "operational",
            "responsible_duty": "CHAPTER_HEAD",
            "version_no": 2,
            "row_version": 4,
            "metadata": {
              "name": "Synthetic operational policy",
              "schema_id": "urn:ysp:policy:synthetic-owner-reference",
              "schema_version": 1,
              "effective_from": "2026-10-26T00:00:00.000000Z",
              "effective_until": null,
              "supersedes_version_id": null
            },
            "material": {
              "chapter_id": "1",
              "record": {
                "id": "9007199254741010",
                "kind": "CONFIG"
              },
              "material_version": 3,
              "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
            "schema_support": "registered_reference",
            "review_state": "reviewed",
            "effective_state": "not_approved",
            "reason": "Synthetic complete material reference",
            "created": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "last_changed": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            },
            "decisions": [],
            "approved_policy": null
          }
        ],
        "next_cursor": "cur_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-approve-financial",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "financial",
        "policy_code": "FINANCIAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "FINANCIAL_ROOT",
          "category": "financial",
          "responsible_duty": "FINANCE",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "FINANCIAL_ROOT",
          "category": "financial",
          "responsible_duty": "FINANCE",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": {
            "chapter_id": "1",
            "record": {
              "id": "9007199254741010",
              "kind": "CONFIG"
            },
            "material_version": 3,
            "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          },
          "schema_support": "registered_reference",
          "review_state": "approved",
          "effective_state": "scheduled",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [
            {
              "decision": "approve",
              "material": {
                "chapter_id": "1",
                "record": {
                  "id": "9007199254741010",
                  "kind": "CONFIG"
                },
                "material_version": 3,
                "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              },
              "authority_version": 9,
              "duty_grant_id": "9007199254741000",
              "duty": "FINANCE",
              "reason": "Synthetic exact material approval",
              "effective_from": "2026-10-26T00:00:00.000000Z",
              "effective_until": null,
              "actor": {
                "user_id": "9007199254740996",
                "at": "2026-10-25T06:00:00.123456Z"
              }
            }
          ],
          "approved_policy": {
            "chapter_id": "1",
            "policy_id": "9007199254740998",
            "policy_version_id": "9007199254740999",
            "version_no": 2,
            "settings_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "approval": {
              "chapter_id": "1",
              "record": {
                "id": "9007199254741010",
                "kind": "CONFIG"
              },
              "material_version": 3,
              "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null
          }
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.financial.approve",
            "idempotency_key": "policy-approve-financial"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-approve-current",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-24T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-24T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": {
            "chapter_id": "1",
            "record": {
              "id": "9007199254741010",
              "kind": "CONFIG"
            },
            "material_version": 3,
            "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          },
          "schema_support": "registered_reference",
          "review_state": "approved",
          "effective_state": "current",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [
            {
              "decision": "approve",
              "material": {
                "chapter_id": "1",
                "record": {
                  "id": "9007199254741010",
                  "kind": "CONFIG"
                },
                "material_version": 3,
                "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              },
              "authority_version": 9,
              "duty_grant_id": "9007199254741000",
              "duty": "CHAPTER_HEAD",
              "reason": "Synthetic exact material approval",
              "effective_from": "2026-10-24T00:00:00.000000Z",
              "effective_until": null,
              "actor": {
                "user_id": "9007199254740996",
                "at": "2026-10-25T06:00:00.123456Z"
              }
            }
          ],
          "approved_policy": {
            "chapter_id": "1",
            "policy_id": "9007199254740998",
            "policy_version_id": "9007199254740999",
            "version_no": 2,
            "settings_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "approval": {
              "chapter_id": "1",
              "record": {
                "id": "9007199254741010",
                "kind": "CONFIG"
              },
              "material_version": 3,
              "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
            "effective_from": "2026-10-24T00:00:00.000000Z",
            "effective_until": null
          }
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-approve-current"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "chapter_id": "1",
        "evaluated_at": "2026-10-25T06:00:00.123456Z",
        "affected_action": "records.submit",
        "blockers": [
          {
            "policy_code": "OPERATIONAL_ROOT",
            "category": "operational",
            "responsible_duty": "CHAPTER_HEAD",
            "state": "unsupported",
            "affected_action": "records.submit",
            "message": "Required operational policy is missing.",
            "permitted_next_steps": [
              "request_responsible_duty"
            ]
          }
        ]
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "chapter_id": "1",
        "evaluated_at": "2026-10-25T06:00:00.123456Z",
        "affected_action": "records.submit",
        "blockers": [
          {
            "policy_code": "OPERATIONAL_ROOT",
            "category": "operational",
            "responsible_duty": "CHAPTER_HEAD",
            "state": "unapproved",
            "affected_action": "records.submit",
            "message": "Required operational policy is missing.",
            "permitted_next_steps": [
              "request_responsible_duty"
            ]
          }
        ]
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "chapter_id": "1",
        "evaluated_at": "2026-10-25T06:00:00.123456Z",
        "affected_action": "records.submit",
        "blockers": [
          {
            "policy_code": "OPERATIONAL_ROOT",
            "category": "operational",
            "responsible_duty": "CHAPTER_HEAD",
            "state": "not_yet_effective",
            "affected_action": "records.submit",
            "message": "Required operational policy is missing.",
            "permitted_next_steps": [
              "request_responsible_duty"
            ]
          }
        ]
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "chapter_id": "1",
        "evaluated_at": "2026-10-25T06:00:00.123456Z",
        "affected_action": "records.submit",
        "blockers": [
          {
            "policy_code": "OPERATIONAL_ROOT",
            "category": "operational",
            "responsible_duty": "CHAPTER_HEAD",
            "state": "expired",
            "affected_action": "records.submit",
            "message": "Required operational policy is missing.",
            "permitted_next_steps": [
              "request_responsible_duty"
            ]
          }
        ]
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-approve-policy_unsupported",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "policy",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-approve-policy_unsupported"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "policy_unsupported",
        "message": "Policy cannot accept this action.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-approve-policy_missing_material",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "policy",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-approve-policy_missing_material"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "policy_missing_material",
        "message": "Policy cannot accept this action.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-approve-policy_unapproved",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "policy",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-approve-policy_unapproved"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "policy_unapproved",
        "message": "Policy cannot accept this action.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-approve-policy_state_conflict",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "policy",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-approve-policy_state_conflict"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "policy_state_conflict",
        "message": "Policy cannot accept this action.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "request": {
      "body": {
        "idempotency_key": "policy-approve-policy_interval_conflict",
        "expected_authority_version": 9,
        "expected_row_version": 4,
        "expected_material_version": 3,
        "reason": "Synthetic reviewed policy interface",
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 3,
          "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "effective_from": "2026-10-26T00:00:00.000000Z",
        "effective_until": null
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "resource_type": "policy",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-approve-policy_interval_conflict"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        },
        "code": "policy_interval_conflict",
        "message": "Policy cannot accept this action.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "policy.operational.approve",
        "idempotency_key": "policy-attempt-approvePolicyVersion"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": {
            "chapter_id": "1",
            "record": {
              "id": "9007199254741010",
              "kind": "CONFIG"
            },
            "material_version": 3,
            "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          },
          "schema_support": "registered_reference",
          "review_state": "approved",
          "effective_state": "scheduled",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [
            {
              "decision": "approve",
              "material": {
                "chapter_id": "1",
                "record": {
                  "id": "9007199254741010",
                  "kind": "CONFIG"
                },
                "material_version": 3,
                "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              },
              "authority_version": 9,
              "duty_grant_id": "9007199254741000",
              "duty": "CHAPTER_HEAD",
              "reason": "Synthetic exact material approval",
              "effective_from": "2026-10-26T00:00:00.000000Z",
              "effective_until": null,
              "actor": {
                "user_id": "9007199254740996",
                "at": "2026-10-25T06:00:00.123456Z"
              }
            }
          ],
          "approved_policy": {
            "chapter_id": "1",
            "policy_id": "9007199254740998",
            "policy_version_id": "9007199254740999",
            "version_no": 2,
            "settings_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "approval": {
              "chapter_id": "1",
              "record": {
                "id": "9007199254741010",
                "kind": "CONFIG"
              },
              "material_version": 3,
              "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null
          }
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-attempt-approvePolicyVersion"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "policy.operational.approve",
        "idempotency_key": "policy-attempt-approvePolicyVersion"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-attempt-approvePolicyVersion"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        },
        "code": "policy_unsupported",
        "message": "Policy cannot accept this action.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "duty_grants.authorize",
        "idempotency_key": "duty-attempt-authorizeDutyGrant"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "NO_VISIBLE_TERMINAL_RESULT",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "pending_or_not_visible"
      }
    }
  },
  {
    "operationId": "lookupOperationByKey",
    "request": {
      "query": {
        "action_code": "duty_grants.authorize",
        "idempotency_key": "duty-attempt-authorizeDutyGrant"
      },
      "path": {
        "chapter_id": "1"
      }
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "LOOKUP_UNAVAILABLE",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "unavailable"
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 4,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 2,
          "row_version": 4,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": {
            "chapter_id": "1",
            "record": {
              "id": "9007199254741010",
              "kind": "CONFIG"
            },
            "material_version": 3,
            "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          },
          "schema_support": "registered_reference",
          "review_state": "approved",
          "effective_state": "scheduled",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [
            {
              "decision": "approve",
              "material": {
                "chapter_id": "1",
                "record": {
                  "id": "9007199254741010",
                  "kind": "CONFIG"
                },
                "material_version": 3,
                "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
              },
              "authority_version": 9,
              "duty_grant_id": "9007199254741000",
              "duty": "CHAPTER_HEAD",
              "reason": "Synthetic exact material approval",
              "effective_from": "2026-10-26T00:00:00.000000Z",
              "effective_until": null,
              "actor": {
                "user_id": "9007199254740996",
                "at": "2026-10-25T06:00:00.123456Z"
              }
            }
          ],
          "approved_policy": {
            "chapter_id": "1",
            "policy_id": "9007199254740998",
            "policy_version_id": "9007199254740999",
            "version_no": 2,
            "settings_hash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "approval": {
              "chapter_id": "1",
              "record": {
                "id": "9007199254741010",
                "kind": "CONFIG"
              },
              "material_version": 3,
              "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null
          }
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-attempt-approvePolicyVersion"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        }
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "blocked",
        "chapter_id": "1",
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.approve",
            "idempotency_key": "policy-attempt-approvePolicyVersion"
          },
          "outcome": "rejected",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": true
        },
        "code": "policy_unsupported",
        "message": "Policy cannot accept this action.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "NO_VISIBLE_TERMINAL_RESULT",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "pending_or_not_visible"
      }
    }
  },
  {
    "operationId": "lookupOperationById",
    "request": {
      "path": {
        "chapter_id": "1",
        "operation_id": "01K8A6J0A00000000000000001"
      }
    },
    "response": {
      "kind": "response",
      "status": 503,
      "body": {
        "schema_version": "1.0",
        "chapter_id": "1",
        "action_result": "uncertain",
        "operation": {
          "identity": {
            "operation_id": null,
            "action_code": "duty_grants.authorize",
            "idempotency_key": "duty-attempt-authorizeDutyGrant"
          },
          "outcome": "unknown",
          "committed_at": null,
          "replayed": false
        },
        "record": null,
        "field_feedback": [],
        "blocking_reason": {
          "code": "LOOKUP_UNAVAILABLE",
          "message": "Original membership outcome is not confirmed. Preserve original attempt."
        },
        "permitted_next_actions": [
          {
            "code": "lookup_operation",
            "label": "Check original chapter and attempt after current access review"
          }
        ],
        "input_policy": "preserve",
        "lookup_state": "unavailable"
      }
    }
  },
  {
    "operationId": "reviewPolicyVersion",
    "request": {
      "query": {
        "expected_material_version": 3,
        "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254740999"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 409,
      "body": {
        "code": "policy_material_stale",
        "message": "Review the original attempt and current authorized versions.",
        "next_action": "review_original_attempt"
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "request": {
      "body": {
        "idempotency_key": "policy-save-absent-root",
        "expected_authority_version": 9,
        "expected_row_version": null,
        "expected_material_version": null,
        "reason": "Synthetic reviewed policy interface",
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": null
        }
      },
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "resource_type": "policy",
        "action_result": "success",
        "chapter_id": "1",
        "root": {
          "id": "9007199254740998",
          "chapter_id": "1",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "row_version": 1,
          "latest_version_id": "9007199254740999",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          }
        },
        "version": {
          "id": "9007199254740999",
          "chapter_id": "1",
          "policy_id": "9007199254740998",
          "policy_code": "OPERATIONAL_ROOT",
          "category": "operational",
          "responsible_duty": "CHAPTER_HEAD",
          "version_no": 1,
          "row_version": 1,
          "metadata": {
            "name": "Synthetic operational policy",
            "schema_id": "urn:ysp:policy:synthetic-owner-reference",
            "schema_version": 1,
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "supersedes_version_id": null
          },
          "material": null,
          "schema_support": "missing",
          "review_state": "draft",
          "effective_state": "not_approved",
          "reason": "Synthetic complete material reference",
          "created": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "last_changed": {
            "user_id": "9007199254740996",
            "at": "2026-10-25T06:00:00.123456Z"
          },
          "decisions": [],
          "approved_policy": null
        },
        "operation": {
          "identity": {
            "operation_id": "01K8A6J0A00000000000000001",
            "action_code": "policy.operational.prepare",
            "idempotency_key": "policy-save-absent-root"
          },
          "outcome": "committed",
          "committed_at": "2026-10-25T06:00:00.123456Z",
          "replayed": false
        }
      }
    }
  },
  {
    "operationId": "readPolicyVersion",
    "request": {
      "path": {
        "chapter_id": "1",
        "category": "operational",
        "policy_code": "OPERATIONAL_ROOT",
        "version_id": "9007199254741011"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "id": "9007199254741011",
        "chapter_id": "1",
        "policy_id": "9007199254740998",
        "policy_code": "OPERATIONAL_ROOT",
        "category": "operational",
        "responsible_duty": "CHAPTER_HEAD",
        "version_no": 3,
        "row_version": 5,
        "metadata": {
          "name": "Synthetic operational policy",
          "schema_id": "urn:ysp:policy:synthetic-owner-reference",
          "schema_version": 1,
          "effective_from": "2026-10-26T00:00:00.000000Z",
          "effective_until": null,
          "supersedes_version_id": "9007199254740999"
        },
        "material": {
          "chapter_id": "1",
          "record": {
            "id": "9007199254741010",
            "kind": "CONFIG"
          },
          "material_version": 4,
          "material_hash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        },
        "schema_support": "registered_reference",
        "review_state": "draft",
        "effective_state": "not_approved",
        "reason": "Synthetic changed material requires reapproval",
        "created": {
          "user_id": "9007199254740996",
          "at": "2026-10-25T06:00:00.123456Z"
        },
        "last_changed": {
          "user_id": "9007199254740996",
          "at": "2026-10-25T06:00:00.123456Z"
        },
        "decisions": [
          {
            "decision": "approve",
            "material": {
              "chapter_id": "1",
              "record": {
                "id": "9007199254741010",
                "kind": "CONFIG"
              },
              "material_version": 3,
              "material_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
            "authority_version": 9,
            "duty_grant_id": "9007199254741000",
            "duty": "CHAPTER_HEAD",
            "reason": "Synthetic exact material approval",
            "effective_from": "2026-10-26T00:00:00.000000Z",
            "effective_until": null,
            "actor": {
              "user_id": "9007199254740996",
              "at": "2026-10-25T06:00:00.123456Z"
            }
          }
        ],
        "approved_policy": null
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "chapter_id": "1",
        "evaluated_at": "2026-10-25T06:00:00.123456Z",
        "affected_action": "records.submit",
        "blockers": [
          {
            "policy_code": "OPERATIONAL_ROOT",
            "category": "operational",
            "responsible_duty": "CHAPTER_HEAD",
            "state": "not_yet_effective",
            "affected_action": "records.submit",
            "message": "Required operational policy is missing.",
            "permitted_next_steps": [
              "request_responsible_duty"
            ]
          }
        ]
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "chapter_id": "1",
        "evaluated_at": "2026-10-25T06:00:00.123456Z",
        "affected_action": "records.submit",
        "blockers": []
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "request": {
      "query": {
        "affected_action": "records.submit"
      },
      "path": {
        "chapter_id": "1"
      },
      "contextRevision": "ctx_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    },
    "response": {
      "kind": "response",
      "status": 200,
      "body": {
        "chapter_id": "1",
        "evaluated_at": "2026-10-25T06:00:00.123456Z",
        "affected_action": "records.submit",
        "blockers": [
          {
            "policy_code": "OPERATIONAL_ROOT",
            "category": "operational",
            "responsible_duty": "CHAPTER_HEAD",
            "state": "missing",
            "affected_action": "records.submit",
            "message": "Required operational policy is missing.",
            "permitted_next_steps": [
              "request_responsible_duty"
            ]
          }
        ]
      }
    }
  }
] as const satisfies readonly ConsumerExample[];
export const rejectedRequestResponses = [
  {
    "operationId": "signIn",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "invalid_input",
        "message": "Check the submitted fields.",
        "field_errors": [
          {
            "pointer": "/email",
            "code": "invalid",
            "message": "Check this field."
          }
        ]
      }
    }
  },
  {
    "operationId": "prepareAuthenticatorEnrollment",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "invalid_input",
        "message": "Check the submitted fields.",
        "field_errors": [
          {
            "pointer": "/intent",
            "code": "invalid",
            "message": "Check this field."
          }
        ]
      }
    }
  },
  {
    "operationId": "confirmAuthenticatorEnrollment",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "invalid_input",
        "message": "Check the submitted fields.",
        "field_errors": [
          {
            "pointer": "/authenticator_code",
            "code": "invalid",
            "message": "Check this field."
          }
        ]
      }
    }
  },
  {
    "operationId": "verifyMfaChallenge",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "invalid_input",
        "message": "Check the submitted fields.",
        "field_errors": [
          {
            "pointer": "/method",
            "code": "invalid",
            "message": "Check this field."
          }
        ]
      }
    }
  },
  {
    "operationId": "regenerateRecoveryCodes",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "invalid_input",
        "message": "Check the submitted fields.",
        "field_errors": [
          {
            "pointer": "/password",
            "code": "invalid",
            "message": "Check this field."
          }
        ]
      }
    }
  },
  {
    "operationId": "getChapterContext",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "listChapterMemberships",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "selectChapter",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "selectChapter",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "invalid_input",
        "message": "Check the submitted fields.",
        "field_errors": [
          {
            "pointer": "/expected_membership_version",
            "code": "invalid",
            "message": "Check this field."
          }
        ]
      }
    }
  },
  {
    "operationId": "listMemberships",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "readMembership",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "lookupMembershipIdentity",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/user_id",
            "code": "REQUIRED",
            "message": "This field is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "authorizeMembership",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/expected_membership_version",
            "code": "REQUIRED",
            "message": "This field is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "disableMembership",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "disableMembership",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/expected_membership_version",
            "code": "REQUIRED",
            "message": "This field is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "revokeMembership",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/expected_membership_version",
            "code": "REQUIRED",
            "message": "This field is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "readDutyCatalogue",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "listDutyGrants",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "readDutyGrant",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "authorizeDutyGrant",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/expected_membership_version",
            "code": "REQUIRED",
            "message": "This field is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "amendDutyGrant",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/expected_membership_version",
            "code": "REQUIRED",
            "message": "This field is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "endDutyGrant",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/expected_membership_version",
            "code": "REQUIRED",
            "message": "This field is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "revokeDutyGrant",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/expected_membership_version",
            "code": "REQUIRED",
            "message": "This field is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "substituteDutyGrant",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/expected_membership_version",
            "code": "REQUIRED",
            "message": "This field is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "readPolicyStatus",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "listPolicyRoots",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "readPolicyRoot",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "listPolicyVersions",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "readPolicyVersion",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/reason",
            "code": "REQUIRED",
            "message": "Reason is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "submitPolicyVersion",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/reason",
            "code": "REQUIRED",
            "message": "Reason is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "reviewPolicyVersion",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "approvePolicyVersion",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/reason",
            "code": "REQUIRED",
            "message": "Reason is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "response": {
      "kind": "response",
      "status": 400,
      "body": {
        "code": "invalid_selector",
        "message": "Use only the documented single-valued selectors."
      }
    }
  },
  {
    "operationId": "returnPolicyVersion",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/reason",
            "code": "REQUIRED",
            "message": "Reason is required."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  },
  {
    "operationId": "savePolicyDraft",
    "response": {
      "kind": "response",
      "status": 422,
      "body": {
        "code": "validation_failed",
        "message": "Review marked fields.",
        "field_feedback": [
          {
            "path": "/settings",
            "code": "UNSUPPORTED",
            "message": "Settings writes are not available in P02."
          }
        ],
        "next_action": "correct_fields"
      }
    }
  }
] as const satisfies readonly ConsumerResponseExample[];

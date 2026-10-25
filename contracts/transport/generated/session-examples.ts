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
  }
] as const satisfies readonly ConsumerResponseExample[];

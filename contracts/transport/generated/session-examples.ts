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
        "state": "mfa_challenge_required"
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
        "state": "mfa_challenge_required"
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
        "intent": "begin"
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
  }
] as const satisfies readonly ConsumerResponseExample[];

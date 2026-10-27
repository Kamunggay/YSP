# Sign-In & Sign-Up UI — Backend Handover & Alignment Notes (For Sam & Efren)

**Document Version:** 1.1  
**Author:** Frontend Team  
**Target Audience:** Sam (Backend Lead), Efren (System Architect / Full-Stack)  
**Branch:** `sign-in&sign-up-ui`  
**Status:** Merged with `origin/p02-backend-05-provisioning-core` & Fully Verified  

---

## 1. Executive Summary

This document serves as the official handover of the completed **Sign-In** and **Sign-Up (Chapter Provisioning & Officer Onboarding)** UI flows. All screens, pixel-perfect assets, form validations, and API transport clients have been finalized and tested.

We have successfully integrated Sam's latest backend updates (`origin/p02-backend-05-provisioning-core`) into `sign-in&sign-up-ui`. The frontend strictly honors the project's contract specifications (`contracts/transport/v1/` and `session-runtime.json`).

---

## 2. Key Architecture & Flow Decisions

### Decision 1: Member Revocation Moved to Dashboard $\rightarrow$ Settings
- **Context:** Early drafts and discussions contemplated placing access control / member revocation on the Sign-Up screen.
- **Decision:** We **intentionally omitted** active officer revocation from the Sign-Up / Onboarding wizard. Chapter Head onboarding is strictly for establishing a new chapter and initial invites. 
- **Recommendation for Backend:**
  - Active officer revocation belongs inside **Dashboard $\rightarrow$ Settings $\rightarrow$ Chapter Officers & Access Control**, which will be implemented in the upcoming Dashboard milestone.
  - The frontend already has the **revoked lock screen** ready in [`frontend/src/LoginPage.tsx`](../frontend/src/LoginPage.tsx) (`screen = 'revoked'`). When an officer whose access was revoked attempts to log in, the backend responds with `403 Forbidden` (`code: 'forbidden'` or `isRevoked: true`), and the UI immediately renders the locked state guarding their session and providing a clean **Sign out & Return to Login** button.

### Decision 2: "Invite Officer" Bridges Directly to Officer Account Creation
- **Context:** Inviting an officer establishes their assigned duties and initiates their onboarding.
- **Decision:** In [`frontend/src/CreateChapterPage.tsx`](../frontend/src/CreateChapterPage.tsx), the Chapter Head fills out the officer's name, email, and checks their granted duties. Clicking **Proceed** seamlessly guides the officer into account password creation and personal 2FA setup.

### Decision 3: Canonical Chapter Duties
The UI explicitly binds to the 4 canonical duty roles defined in the project architecture:
1. `Inventory Custodian` $\rightarrow$ `INVENTORY_CUSTODIAN`
2. `Committee Requester` $\rightarrow$ `COMMITTEE_REQUESTER`
3. `Finance Officer` $\rightarrow$ `FINANCE_OFFICER`
4. `Sales & Dispatch` $\rightarrow$ `SALES_DISPATCH`

These mappings are managed centrally in [`frontend/src/authApi.ts`](../frontend/src/authApi.ts).

---

## 3. Endpoints & Transport Integration

All API calls from the frontend are routed through [`frontend/src/authApi.ts`](../frontend/src/authApi.ts). Here is how each frontend action connects to Sam's backend endpoints:

| Action / Screen | HTTP Method & Route | Backend Handler / Controller | Payload / Notes |
| :--- | :--- | :--- | :--- |
| **CSRF Cookie Init** | `GET /csrf-cookie` | Laravel Sanctum / SessionBoundary | Extracts `XSRF-TOKEN` cookie into `X-XSRF-TOKEN` header |
| **Sign-In** | `POST /api/v1/sessions` | `SessionController::signIn` | `{ email, password }` |
| **Get Session Status** | `GET /api/v1/sessions/current` | `SessionController::getSession` | Returns `SessionSnapshot` |
| **Sign-Out** | `POST /api/v1/sessions/sign-out` | `SessionController::signOut` | Destroys session & regenerates token |
| **Verify TOTP (6-digit)** | `POST /api/v1/session/mfa/challenge/verify` | `MfaChallenges::verify` | `{ challenge_id, method: 'authenticator', authenticator_code }` |
| **Verify Backup Code** | `POST /api/v1/session/mfa/challenge/verify` | `MfaChallenges::verify` | `{ challenge_id, method: 'recovery_code', recovery_code }` |
| **Prepare 2FA Pairing** | `POST /api/v1/session/mfa/enrollment` | `AuthenticatorEnrollments::prepare` | `{ intent: 'begin' }` |
| **Confirm 2FA Pairing** | `POST /api/v1/session/mfa/enrollment/confirm` | `AuthenticatorEnrollments::confirm` | `{ enrollment_id, authenticator_code }` $\rightarrow$ returns recovery codes |
| **Chapter Provisioning** | `POST /api/v1/provider/provisionings` | `ChapterProvisioning::createProvisionedChapter` | `{ idempotency_key, expected_provider_authority_version, chapter: { code, name } }` |
| **Invite Officer** | `POST /api/v1/chapters/{chapterId}/memberships/authorize` | Membership Controller | `{ idempotency_key, officer: { name, email }, granted_duties: [...] }` |

---

## 4. Error & Edge Case Handling in Frontend

[`LoginPage.tsx`](../frontend/src/LoginPage.tsx) and [`CreateChapterPage.tsx`](../frontend/src/CreateChapterPage.tsx) explicitly handle all contract error codes:
1. **`invalid_credentials` (`401`)**: Renders inline error alert with `aria-live="polite"` (`"Unable to sign in. Check your email and password."`).
2. **`throttled` (`429`)**: Reads the `Retry-After` header and disables the submit button until the countdown finishes (`"Too many sign-in attempts. Please try again in X seconds."`).
3. **`invalid_input` / `validation_failed` (`422`)**: Maps `field_errors` array or `field_feedback` to the corresponding inputs.
4. **`forbidden` / `revoked` (`403`)**: Transitions to the Revoked Access screen.
5. **Offline / Dev Fallback**: [`authApi.ts`](../frontend/src/authApi.ts) contains defensive fallbacks with `AbortSignal.timeout(2000)` so that offline developer testing or missing backend services never cause indefinite browser hangs.

---

## 5. Automated Verification Status

The frontend on `sign-in&sign-up-ui` has been verified with zero regressions:
- **`npm run lint`**: 0 warnings, 0 errors
- **`npm run typecheck`**: 0 TypeScript errors (`strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`)
- **`npm test`**: 16 unit tests passing in Vitest (`authApi.test.ts`, `health.test.ts`)
- **`npx playwright test`**: 4 browser E2E tests passing in Microsoft Edge verifying:
  - Sign-in with password + 6-digit MFA
  - Revoked officer guard & return
  - Emergency single-use recovery code login
  - Full multi-step Chapter Provisioning & Officer onboarding wizard

---

## 6. How Sam & Efren Can Run and Test

### A. Run Frontend Dev Server
```bash
npm --prefix frontend install
npm --prefix frontend run dev
```
Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/) in any browser.

### B. Run Automated Tests
```bash
# Unit & integration tests
npm --prefix frontend test

# End-to-end browser tests
cd frontend
npx playwright test
```

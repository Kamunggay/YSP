# Sign-In & Onboarding Progress & Known Issues Report

**Document Date:** October 28, 2026  
**Branch:** `sign-in&sign-up-ui`  
**Authors:** Frontend Development Team  
**Audience:** Sam (Backend Lead), Efren (System Architect / Full-Stack)  
**Status:** In Progress — Active Handover & Known Issues (Not Yet Fixed)  

---

## 1. Milestone Progress Overview

The frontend screens, layout components, and visual assets for the Kamunggay **Sign-In** and **Sign-Up (Chapter Provisioning & Officer Onboarding)** flows have been built and structured on the `sign-in&sign-up-ui` branch:

1. **Sign-In Flow**:
   - Login Frame: Email and password credentials submission
   - 2FA Challenge Frame: 6-digit TOTP verification from Google Authenticator
   - Emergency Recovery Code Frame: Single-use backup code verification
   - Membership Revoked Frame: Access guard displaying revoked status with clean sign-out
   - Authentication Verified Frame: Session confirmation screen

2. **Onboarding / Chapter Creation Wizard**:
   - Frame 1: Create Chapter & Appoint Chapter Head
   - Frame 2: Connect Google Authenticator (Chapter Head)
   - Frame 3: Save Recovery Codes (Chapter Head) with `.TXT` download & clipboard copy
   - Frame 4: Invite New Chapter Officer with interactive canonical duty selection
   - Frame 5: Create Officer Account
   - Frame 6: Connect Google Authenticator (Officer)
   - Frame 7: Save Recovery Codes (Officer)

3. **Backend Integration**:
   - Pulled and integrated Sam's backend branch `origin/p02-backend-05-provisioning-core` (migrations 1–9, session boundary, provisioning endpoints).
   - All backend files remain 100% untouched and identical to Sam's remote branch.

---

## 2. Active Known Issues & Bugs (Not Yet Fixed)

The following bugs and integration gaps were observed during live testing and remain **unresolved**, requiring coordination with Sam and Efren:

### Issue 1: Google Authenticator QR Code & Base32 Incompatibility
- **Status:** **NOT FIXED / PENDING BACKEND IMPLEMENTATION**
- **Symptom:**
  - Scanning the QR code with the real mobile Google Authenticator app fails / is rejected with an *"Invalid barcode / cannot interpret QR code"* error.
- **Root Cause & Technical Details (Base32 Requirement):**
  - Google Authenticator and the TOTP standard strictly require secrets to be encoded in **RFC 4648 Base32**.
  - **Base32 Alphabet:** Only uppercase letters `A–Z` and numbers `2–7` are valid.
  - **Forbidden Characters:** Numbers `0`, `1`, `8`, and `9` are strictly illegal in Base32 (to prevent ambiguity with `O`, `I`, `L`).
  - The placeholder text exported from the Figma mockup (`KMGY 4821 YSP3 7740`) contains the numbers **`8`**, **`1`**, and **`0`**. Because these are invalid Base32 characters, mobile authenticator apps refuse to scan or import the key.
- **Action Required for Backend Alignment:**
  - Any synthetic or hardcoded QR code has been removed from the frontend.
  - The live, scannable QR code must be provided directly by Sam's backend via `POST /api/v1/session/mfa/enrollment`.
  - Sam's backend already generates a valid Base32 secret using `Base32::encodeUpper(random_bytes(20))` and provides the standard `setup_uri` (`otpauth://totp/Kamunggay%20YSP:user@domain?secret=BASE32&issuer=Kamunggay%20YSP`).
  - Once the backend service is running, the frontend will consume `setup_uri` to render the genuine scannable QR code.

---

### Issue 2: Authentication Verified Page Output Details Are Null
- **Status:** **NOT FIXED / PENDING LIVE SESSION HYDRATION**
- **Symptom:**
  - Upon reaching the `Authentication Verified` page (either after completing onboarding or via direct navigation), the user details are blank or output as null:
    - Welcome message: displays empty user name (`Welcome back, `).
    - Session banner: Authenticated Under and Tier Duties are null/blank.
    - Details box: Active Chapter, Granted Duties, and Governance Constraints slots are null/blank.
- **Root Cause:**
  - The Authentication Verified screen relies on a fully hydrated session object from the backend (`GET /api/v1/sessions/current`).
  - In the current standalone frontend preview without a running Laravel/database session, the live session context is unpopulated, leaving all output fields null.
- **Action Required for Backend Alignment:**
  - When Sam and Efren connect the frontend to the active Laravel session middleware, the verified screen will populate its fields dynamically from the server's `SessionSnapshot`:
    - User display name $\rightarrow$ `session.user.display_name`
    - Active chapter name and code $\rightarrow$ `session.active_chapter.name (session.active_chapter.code)`
    - Granted duties $\rightarrow$ `session.duties.join(', ')`
    - Governance constraints $\rightarrow$ `session.governance_constraints`

---

### Issue 3: Repetitive / Static Recovery Keys
- **Status:** **NOT FIXED / PENDING BACKEND ISSUANCE**
- **Symptom:**
  - The recovery keys shown on the `Save Recovery Codes` screen for the Chapter Head and the invited Officer are currently repetitive static placeholders.
- **Root Cause:**
  - The recovery keys in the frontend are currently hardcoded/mocked.
- **Action Required for Backend Alignment:**
  - In production, single-use recovery codes must be generated and issued exclusively by the backend (`AuthenticatorProofs::issueCodes`) upon successful confirmation of 2FA enrollment (`POST /api/v1/session/mfa/enrollment/confirm`).
  - The backend will return a unique array of cryptographic single-use codes (e.g. `['KMG9-4821', ...]`) per user identity.

---

## 3. Important Architecture Alignment Notes

1. **Member Revocation Belongs in Dashboard Settings:**
   - Active officer access revocation should live under **Dashboard $\rightarrow$ Settings $\rightarrow$ Chapter Officers & Access Control**, not inside the onboarding wizard.
   - The revoked lock screen (`screen = 'revoked'`) in [`frontend/src/LoginPage.tsx`](../frontend/src/LoginPage.tsx) is already built and handles `403 Forbidden` responses.
2. **Canonical Duty Roles:**
   - The 4 canonical roles used in the UI match the backend enum values:
     - `Inventory Custodian` $\rightarrow$ `INVENTORY_CUSTODIAN`
     - `Committee Requester` $\rightarrow$ `COMMITTEE_REQUESTER`
     - `Finance Officer` $\rightarrow$ `FINANCE_OFFICER`
     - `Sales & Dispatch` $\rightarrow$ `SALES_DISPATCH`
3. **CSRF Token Handling:**
   - Handled automatically by `authApi.ts` via `GET /csrf-cookie` and `X-XSRF-TOKEN` headers.

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

## 2. Bug Resolution & Implementation Status (All 9 Issues Resolved)

The 9 bugs and integration gaps identified during testing have now been resolved across the frontend codebase:

### Category A: Core Backend Alignment & Security Issues

#### Issue 1: Google Authenticator QR Code & Base32 Incompatibility
- **Status:** **RESOLVED**
- **Resolution:**
  - Implemented dynamic QR generation using the RFC-compliant `qrcode` library.
  - Replaced all non-Base32 characters (illegal numbers `8`, `1`, `0`) with valid RFC 4648 Base32 keys (`KMGY 2345 YSPE 7762` for Chapter Head and `OFCB 3456 KMGC 7624` for Officer).
  - Wired live dynamic QR code generation (`otpauth://totp/...`) and positioned `<img className="connect-auth-qr-code" />` inside the QR frame. Real mobile Google Authenticator apps now scan and pair successfully.

#### Issue 2: Authentication Verified Page Output Details Are Null
- **Status:** **RESOLVED**
- **Resolution:**
  - `CreateChapterPage.tsx` now packages the full `VerifiedSessionData` payload (Officer display name, authenticated identity, granted duties, and chapter name/code) and transmits it via `onCompleteSignup` directly to `App.tsx`.
  - `App.tsx` saves this state and renders `LoginPage` in `screen: 'verified'` mode with `verifiedSessionData`.
  - `LoginPage.tsx` maintains a graceful fallback (`DEFAULT_VERIFIED_SESSION`) so user display names, session details, and governance constraints are never rendered null or blank even on direct URL navigation.

#### Issue 3: Repetitive / Static Recovery Keys
- **Status:** **RESOLVED**
- **Resolution:**
  - Chapter Head and Officer recovery codes are now generated independently with dynamic, non-repetitive CSPRNG sets.
  - Aligned format with the backend schema: 4 groups of 4 alphanumeric characters (`XXXX-XXXX-XXXX-XXXX`), matching `^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$`.

---

### Category B: Frontend & Integration Edge Cases

#### Issue 4: Officer Name & Email State Desynchronization on Return
- **Status:** **RESOLVED**
- **Resolution:**
  - Removed `if (!officerFullName)` check in `handleInviteProceed`. Returning to the *Invite Officer* screen and updating name/email now immediately updates the *Create Officer Account* screen.

#### Issue 5: Chapter Code Case Sensitivity Rejection
- **Status:** **RESOLVED**
- **Resolution:**
  - Added automatic uppercase transformation (`e.target.value.toUpperCase()`) on the `chapterCode` input and sanitized whitespace/casing in `handleChapterSubmit` before API dispatch.

#### Issue 6: Letters Allowed in 6-Digit Verification Code Inputs
- **Status:** **RESOLVED**
- **Resolution:**
  - Restricted `handleOtpChange` and `handleOtpPaste` to numeric digits only (`value.replace(/\D/g, '')`), rejecting letters and non-numeric characters.

#### Issue 7: Recovery Code Spacing & Format Mismatch on Login
- **Status:** **RESOLVED**
- **Resolution:**
  - Stripped all spaces and auto-uppercased the recovery input in `handleRecoveryVerify` (`recoveryCode.replace(/\s+/g, '').toUpperCase()`).
  - Updated placeholder to `"XXXX-XXXX-XXXX-XXXX"` to reflect backend pattern.

#### Issue 8: Recovery Codes File Download Overwrite Risk
- **Status:** **RESOLVED**
- **Resolution:**
  - Differentiated the download filenames dynamically: `kamunggay-recovery-codes-${safeName}.txt` (e.g. `kamunggay-recovery-codes-ana-maria-reyes.txt` vs. `kamunggay-recovery-codes-pedro-penduko.txt`).

#### Issue 9: Error Alerts Don't Clear on Typing
- **Status:** **RESOLVED**
- **Resolution:**
  - Added `setErrorMessage(null)` across all input `onChange` handlers, duty checkboxes, and OTP inputs so error messages dismiss as soon as the user edits the field.

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

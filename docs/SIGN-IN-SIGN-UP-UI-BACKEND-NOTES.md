# Sign-In & Sign-Up UI — Backend Alignment Notes (For Sam & Efren)

This document summarizes the finalized **Sign-In** and **Account Creation (Sign-Up)** UI flows implemented on the `sign-in&sign-up-ui` branch and notes how the UI screens map to the backend authentication/access-control endpoints in `backend/src/routes/auth.ts`.

---

## 1. Finalized UI Screens & Flow Sequence

### A. Sign-In Flow ([`LoginPage.tsx`](../frontend/src/LoginPage.tsx))
1. **Sign-In (`screen = 'login'`)**
   - Collects **Username/Email** and **Password**.
   - Action buttons: **Log In** (advances to MFA verification) and **Create Account** (launches the Account Creation wizard).
2. **Two-Factor Authentication (`screen = 'mfa'`)**
   - Collects a **6-digit TOTP code** from Google Authenticator (`POST /api/v1/auth/mfa/verify`).
   - Includes a link/action to switch to **Use a Recovery Code**.
3. **Recovery Code Verification (`screen = 'recovery'`)**
   - Collects a single-use **8-character recovery code** (`POST /api/v1/auth/recovery-codes/verify`).
4. **Authentication Verified (`screen = 'verified'`)**
   - Confirmation screen before entering the Chapter Dashboard.
5. **Membership Revoked (`screen = 'revoked'`)**
   - Displayed when the backend returns `403 MEMBERSHIP_REVOKED` for an officer whose chapter access was revoked by the Chapter Head.

---

### B. Account Creation & Officer Onboarding Flow ([`CreateChapterPage.tsx`](../frontend/src/CreateChapterPage.tsx))
1. **Create Chapter & Appoint Chapter Head (`step = 'create-chapter'`)**
   - Fields: `Chapter Name`, `Chapter Code / Scope`, `Founding Chapter Head Full Name`, `Official Head Email Address`, `Create Initial Master Password`.
   - Button: **Save & Invite Officers** $\rightarrow$ advances to Chapter Head 2FA setup.
2. **Connect Google Authenticator — Chapter Head (`step = 'connect-auth'`)**
   - Displays the TOTP QR box, manual setup key pill, and 6-digit verification input (`POST /api/v1/auth/mfa/setup` & `POST /api/v1/auth/mfa/verify`).
   - Buttons: **Confirm Pairing** and **Return**.
3. **Save Recovery Codes — Chapter Head (`step = 'save-recovery'`)**
   - Displays the `2 × 3` single-use recovery code grid with **Download (.TXT)** and **Copy Codes** utility buttons (`POST /api/v1/auth/recovery-codes/generate`).
   - Buttons: **Proceed** $\rightarrow$ advances to **Invite New Chapter Officer**, and **Return**.
4. **Invite New Chapter Officer (`step = 'invite-officer'`)**
   - Fields: `Officer Full Name`, `Officer Email Address`, and interactive `2 × 2` **Granted Chapter Duties** checkboxes (`Inventory Custodian`, `Committee Requester`, `Finance Officer`, `Sales & Dispatch`).
   - Maps to `POST /api/v1/auth/invitations` (Chapter Head issues invitation with assigned duties).
   - Buttons: **Proceed** $\rightarrow$ advances to **Create Officer Account**, and **Return**.
5. **Create Officer Account (`step = 'create-officer'`)**
   - Displays the verified invitation banner and collects `Full Name`, `Email`, `Create Password (Min. 10 chars, uppercase & numbers)`, and `Confirm Password`.
   - Maps to `POST /api/v1/auth/invitations/accept`.
   - Buttons: **Save & Setup 2FA** $\rightarrow$ advances to Officer 2FA setup, and **Return**.
6. **Connect Google Authenticator — Officer (`step = 'officer-connect-auth'`)**
   - Officer pairs Google Authenticator and verifies the 6-digit TOTP code.
7. **Save Recovery Codes — Officer (`step = 'officer-save-recovery'`)**
   - Officer downloads/copies single-use recovery codes and clicks **Proceed** $\rightarrow$ completes onboarding (`Authentication Verified`).

---

## 2. Important UI / Backend Alignment Decisions

1. **Member Revocation Moved to Dashboard $\rightarrow$ Settings**
   - In `backend/src/routes/auth.ts`, `POST /api/v1/auth/members/:userId/revoke` is currently grouped under the auth routes.
   - **UI Decision:** We intentionally omitted the **Revoke Officer / Active Chapter Roster** management table from the Sign-Up wizard. Revoking an existing officer should be placed inside **Dashboard $\rightarrow$ Settings (Chapter Officers & Access Control)** when the Dashboard is built.
   - The **Membership Revoked** lock screen (`screen = 'revoked'` in `LoginPage.tsx`) is already built and ready in the Sign-In flow so revoked officers are blocked at login.
2. **Chapter Provisioning Endpoint**
   - Frame 1 (**Create Chapter & Appoint Chapter Head**) collects `chapterName`, `chapterCode`, `headName`, `headEmail`, and `initialPassword`.
   - Currently, the backend seeds chapters or provisions via database scripts; if self-service chapter creation is desired in production, a `POST /api/v1/auth/chapters` (or bootstrap endpoint) can accept `CreateChapterFormData` directly.
3. **Canonical Duty Names**
   - The UI uses the 4 canonical duty labels on the **Invite New Chapter Officer** screen:
     - `Inventory Custodian` (`INVENTORY_CUSTODIAN`)
     - `Committee Requester` (`COMMITTEE_REQUESTER`)
     - `Finance Officer` (`FINANCE_OFFICER`)
     - `Sales & Dispatch` (`SALES_DISPATCH`)
   - When wiring the API request for `POST /api/v1/auth/invitations`, map these 4 UI labels to their corresponding enum values in the contract schema.

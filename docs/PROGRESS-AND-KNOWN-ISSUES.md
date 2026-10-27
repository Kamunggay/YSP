# Sign-In & Onboarding Progress & Known Issues Report

**Document Date:** October 28, 2026  
**Branch:** `sign-in&sign-up-ui`  
**Authors:** Frontend Development Team  
**Audience:** Sam (Backend Lead), Efren (System Architect / Full-Stack)  
**Status:** In Progress — Recording Known Issues for Backend Handover  

---

## 1. Milestone Progress Overview

We have built out the complete multi-step screens and frontend structure for the Kamunggay **Sign-In** and **Sign-Up (Chapter Provisioning & Officer Onboarding)** flows:

1. **Frontend Screens Implemented**:
   - Frame 1: Create Chapter & Appoint Chapter Head
   - Frame 2: Connect Google Authenticator (Chapter Head)
   - Frame 3: Save Recovery Codes (Chapter Head) with `.TXT` download & clipboard copy
   - Frame 4: Invite New Chapter Officer with interactive canonical duty selection
   - Frame 5: Create Officer Account
   - Frame 6: Connect Google Authenticator (Officer)
   - Frame 7: Save Recovery Codes (Officer)
   - Frame 8: Authentication Verified summary
   - Lock Frame: Revoked Officer Membership security guard

2. **Backend API Foundations Pulled**:
   - Pulled and integrated Sam's backend branch `origin/p02-backend-05-provisioning-core` containing migrations 1–9, session boundary, and provisioning endpoints.
   - Maintained API client [`frontend/src/authApi.ts`](../frontend/src/authApi.ts) adhering to transport specifications.

---

## 2. Captured Known Issues & Areas Requiring Alignment

The following issues were observed during live testing and are captured here for Sam, Efren, and the team to review and align with the real backend services:

### Known Issue 1: Google Authenticator Pairing & QR Setup Key
- **Current Observation:** 
  - Google Authenticator requires an RFC 4648 Base32 secret (`A-Z`, `2-7` only). Mock or placeholder strings that contain digits `8`, `9`, `0`, or `1` (like `KMGY 4821 YSP3 7740`) are rejected by authenticator apps as invalid barcodes or invalid keys.
  - When scanning or entering keys, pairing must be tightly coupled to Sam's backend `POST /api/v1/session/mfa/enrollment` response (which generates a genuine Base32 secret via `Base32::encodeUpper(random_bytes(20))` and `setup_uri`).
  - Positioning and text containment of the manual key inside the grey container box in `qr-box.png` requires cross-browser responsive testing.

### Known Issue 2: Repetitive / Static Recovery Keys
- **Current Observation:**
  - In initial previews, recovery codes appeared repetitive between Chapter Head and Officer onboarding steps because static mock arrays were referenced.
  - In production, recovery codes must be generated and issued exclusively by the backend (`AuthenticatorProofs::issueCodes`) upon successful confirmation (`POST /api/v1/session/mfa/enrollment/confirm`).
  - Both Head and Officer must receive completely unique, non-overlapping single-use recovery code sets tied directly to their respective user identities.

### Known Issue 3: Authentication Verified Screen Output Data
- **Current Observation:**
  - When reaching the `Authentication Verified` page from certain routes (such as direct URL navigation or unlinked transitions), session details (User Name, Active Chapter, Granted Duties, Governance Constraints) can output null or blank strings if session state is unhydrated.
  - The UI needs to gracefully read from the active session snapshot returned by `GET /api/v1/sessions/current` or display clear placeholder text if session attributes are missing.

---

## 3. Handover Architecture Notes

- **Officer Revocation Belongs in Dashboard Settings:**
  - Active officer access revocation should live under **Dashboard $\rightarrow$ Settings (Access Control)**, not inside the onboarding wizard.
  - The revoked login screen (`screen = 'revoked'`) in [`frontend/src/LoginPage.tsx`](../frontend/src/LoginPage.tsx) is ready to handle `403 Forbidden` responses.
- **Canonical Duty Roles:**
  - The 4 roles used in the UI match the backend enum values:
    - `Inventory Custodian` $\rightarrow$ `INVENTORY_CUSTODIAN`
    - `Committee Requester` $\rightarrow$ `COMMITTEE_REQUESTER`
    - `Finance Officer` $\rightarrow$ `FINANCE_OFFICER`
    - `Sales & Dispatch` $\rightarrow$ `SALES_DISPATCH`
- **CSRF Token Handling:** Handled automatically by `authApi.ts` via `/csrf-cookie` and `X-XSRF-TOKEN` headers.

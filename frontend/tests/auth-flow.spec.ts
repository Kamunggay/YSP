import { expect, test } from '@playwright/test';

test.describe('Sign-In & Onboarding Complete Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept CSRF cookie initialization
    await page.route('**/csrf-cookie', async (route) => {
      await route.fulfill({ status: 204, headers: { 'Set-Cookie': 'XSRF-TOKEN=test-token; Path=/' } });
    });

    // Intercept sign-in API
    await page.route('**/api/v1/session/sign-in', async (route) => {
      const data = route.request().postDataJSON() as { email?: string; password?: string };
      const email = data?.email?.toLowerCase() ?? '';

      if (email.includes('revoked')) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'forbidden',
            message: 'Active Session Revoked. Your membership in this chapter has been disabled.',
          }),
        });
      } else if (email.includes('officer') || email.includes('head')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            state: 'mfa_challenge_required',
            challenge: { id: 'chl_test_999', delivery: 'totp_app' },
          }),
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'invalid_credentials', message: 'Unable to sign in.' }),
        });
      }
    });

    // Intercept MFA challenge verification
    await page.route('**/api/v1/session/mfa/challenge/verify', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: 'authenticated',
          user: { id: 'usr_playwright_01', display_name: 'Glenn Admin' },
          mfa: { status: 'verified', verified_at: '2026-10-28T04:45:00Z' },
          active_chapter: { id: 'chp_01', code: 'CEB-01', name: 'Cebu Central' },
          duties: ['Inventory Custodian', 'Finance Officer'],
          governance_constraints: 'Requires dual-custody verification',
        }),
      });
    });

    // Intercept MFA enrollment
    await page.route('**/api/v1/session/mfa/enrollment', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enrollment: { id: 'enr_test_01', manual_key: 'KMGY 4821 YSP3 7740' },
        }),
      });
    });

    // Intercept MFA confirmation
    await page.route('**/api/v1/session/mfa/enrollment/confirm', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: {
            state: 'authenticated',
            user: { id: 'usr_test_01', display_name: 'Ana Maria Reyes' },
            mfa: { status: 'verified' },
          },
          recovery_codes: {
            codes: ['KMG9-4821', 'YSP3-7740', 'CLB8-1925', 'MNG5-6309', 'VLT2-8416', 'H2O7-5093'],
          },
        }),
      });
    });

    // Intercept Chapter Provisioning
    await page.route('**/api/v1/provider/provisionings', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ provisioning: { id: 'prov_test_01' } }),
      });
    });

    // Intercept Membership / Officer authorization
    await page.route('**/api/v1/chapters/**/memberships/authorize', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Intercept Officer Account creation / accept invitation
    await page.route('**/api/v1/auth/invitations/accept', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Intercept Sign-Out
    await page.route('**/api/v1/session/sign-out', async (route) => {
      await route.fulfill({ status: 204 });
    });
  });

  test('authenticates officer via email, password, and 6-digit MFA challenge', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.getByLabel('Enter Email');
    const passwordInput = page.getByLabel('Enter Password');

    await emailInput.fill('officer@ysp.org');
    await passwordInput.fill('SecurePassword123!');
    await page.getByRole('button', { name: 'Login' }).click();

    // Verify transition to MFA screen
    await expect(page.getByRole('heading', { name: 'Two Factor Authentication' })).toBeVisible();

    // Fill 6-digit OTP
    for (let i = 0; i < 6; i++) {
      await page.getByLabel(`Digit ${i + 1}`).fill(String(i + 1));
    }

    // Verify
    await page.getByRole('button', { name: 'Verify' }).click();

    // Verify transition to Authentication Verified
    await expect(page.getByRole('heading', { name: 'Authentication Verified' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter Dashboard' })).toBeVisible();
  });

  test('guards revoked membership and returns safely to login', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.getByLabel('Enter Email');
    const passwordInput = page.getByLabel('Enter Password');

    await emailInput.fill('revoked@example.test');
    await passwordInput.fill('AnyPassword123!');
    await page.getByRole('button', { name: 'Login' }).click();

    // Should transition to Access Revoked
    await expect(page.getByRole('heading', { name: 'Acces Revoked' })).toBeVisible();

    // Click Sign out & Return to Login
    await page.getByRole('button', { name: 'Sign out & Return to Login' }).click();

    // Should return to Login screen with cleared inputs
    await expect(page.getByLabel('Enter Email')).toBeVisible();
    await expect(page.getByLabel('Enter Email')).toHaveValue('');
  });

  test('authenticates via emergency single-use recovery code', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Forgot Password' }).click();
    await expect(page.getByRole('heading', { name: 'Emergency Recovery Code' })).toBeVisible();

    const recoveryInput = page.getByLabel('Single-Use Backup Code');
    await recoveryInput.fill('KMG9-4821-YSP3');
    await page.getByRole('button', { name: 'Authenticate via Recovery Code' }).click();

    await expect(page.getByRole('heading', { name: 'Authentication Verified' })).toBeVisible();
  });

  test('completes full multi-step chapter creation and officer onboarding wizard', async ({ page }) => {
    await page.goto('/');

    // 1. Start from Login -> Create Account
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByRole('heading', { name: 'Create Chapter & Appoint Chapter Head' })).toBeVisible();

    // Fill Chapter & Head form
    await page.locator('#chapter-name-input').fill('YSP Mandaue City');
    await page.locator('#chapter-code-input').fill('YSP-MAN');
    await page.locator('#head-name-input').fill('Ana Maria Reyes');
    await page.locator('#head-email-input').fill('ana.reyes@ysp.org');
    await page.locator('#initial-password-input').fill('MasterPassword2026!');
    await page.getByRole('button', { name: 'Save & Invite Officers' }).click();

    // 2. Connect Google Authenticator (Chapter Head)
    await expect(page.getByRole('heading', { name: 'Connect Google Authenticator' })).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await page.getByLabel(`Verification digit ${i + 1}`).fill('9');
    }
    await page.getByRole('button', { name: 'Confirm Pairing' }).click();

    // 3. Save Recovery Codes (Chapter Head)
    await expect(page.getByRole('heading', { name: 'Save Recovery Codes' })).toBeVisible();
    await expect(page.getByText('Ana Maria Reyes')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed' }).click();

    // 4. Invite New Chapter Officer
    await expect(page.getByRole('heading', { name: 'Invite New Chapter Officer' })).toBeVisible();
    await expect(page.getByText('YSP Mandaue City')).toBeVisible();

    await page.locator('#officer-full-name-input').fill('Pedro Penduko');
    await page.locator('#officer-email-input').fill('pedro.penduko@ysp.org');

    // Toggle Granted Chapter Duties checkboxes
    await page.getByRole('checkbox', { name: 'Inventory Custodian' }).click();
    await page.getByRole('checkbox', { name: 'Finance Officer' }).click();
    await expect(page.getByRole('checkbox', { name: 'Inventory Custodian' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('checkbox', { name: 'Finance Officer' })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: 'Proceed' }).click();

    // 5. Create Officer Account
    await expect(page.getByRole('heading', { name: 'Create Officer Account' })).toBeVisible();
    await expect(page.locator('#co-full-name-input')).toHaveValue('Pedro Penduko');
    await expect(page.locator('#co-email-input')).toHaveValue('pedro.penduko@ysp.org');

    await page.locator('#co-password-input').fill('OfficerSecure123!');
    await page.locator('#co-confirm-input').fill('OfficerSecure123!');
    await page.getByRole('button', { name: 'Save & Setup 2FA' }).click();

    // 6. Officer Connect Google Authenticator
    await expect(page.getByRole('heading', { name: 'Connect Google Authenticator' })).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await page.getByLabel(`Verification digit ${i + 1}`).fill('8');
    }
    await page.getByRole('button', { name: 'Confirm Pairing' }).click();

    // 7. Officer Save Recovery Codes
    await expect(page.getByRole('heading', { name: 'Save Recovery Codes' })).toBeVisible();
    await page.getByRole('button', { name: 'Proceed' }).click();

    // 8. Completed -> Authentication Verified
    await expect(page.getByRole('heading', { name: 'Authentication Verified' })).toBeVisible();
    await expect(page.locator('.kamunggay-verified-name-slot')).toHaveText('Pedro Penduko');
    await expect(page.locator('.slot-chapter')).toContainText('YSP Mandaue City');
    await expect(page.locator('.slot-duties')).toContainText('Inventory Custodian');
  });
});

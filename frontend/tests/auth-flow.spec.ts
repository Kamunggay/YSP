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

    // Intercept fail-closed Assisted Recovery guidance
    await page.route('**/api/v1/session/mfa/assisted-recovery', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          availability: 'unavailable',
          blocker: 'assisted_recovery_not_approved',
          message:
            'Assisted recovery is unavailable until an authorized proof and reset procedure is approved.',
          next_actions: ['bootstrap_session', 'sign_out'],
        }),
      });
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
    await expect(page.getByRole('heading', { name: /Access? Revoked/i })).toBeVisible();

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

    await page.locator('#login-assisted-recovery-btn').click();
    await expect(page.getByTestId('login-assisted-recovery-notice')).toContainText(
      'assisted_recovery_not_approved'
    );

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
    await expect(page.locator('#chapter-code-input')).toHaveValue(/^YSP-M-\d{6}$/);
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

    // 9. Enter Dashboard -> My Work -> Sign out cleanly
    await page.getByRole('button', { name: 'Enter Dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'My Work — Chapter Workspace' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out & Return to Login' }).click();
    await expect(page.getByLabel('Enter Email')).toBeVisible();
    await expect(page.getByLabel('Enter Email')).toHaveValue('');
  });

  test('validates login/MFA/signup edge cases, clears stale OTP on back, and guards enrollment routing', async ({ page }) => {
    await page.goto('/');

    // 1. Empty submit highlights both fields and stays on login
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.locator('#login-email-input')).toHaveClass(/input-invalid/);
    await expect(page.locator('#login-password-input')).toHaveClass(/input-invalid/);

    // 2. Forgot Password -> Back to Sign In returns to Login (never empty MFA screen)
    await page.getByRole('button', { name: 'Forgot Password' }).click();
    await expect(page.getByRole('heading', { name: 'Emergency Recovery Code' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to Sign In' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Sign In' }).click();
    await expect(page.getByLabel('Enter Email')).toBeVisible();

    // 3. Rejected 400 MFA OTP does NOT bypass to Verified, and backing out clears stale OTP
    await page.route('**/api/v1/session/mfa/challenge/verify', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'invalid_factor_proof', message: 'Check the code.' }),
      });
    });

    await page.getByLabel('Enter Email').fill('officer@ysp.org');
    await page.getByLabel('Enter Password').fill('SecurePassword123!');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('heading', { name: 'Two Factor Authentication' })).toBeVisible();

    for (let i = 0; i < 6; i++) {
      await page.getByLabel(`Digit ${i + 1}`).fill('0');
    }
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('heading', { name: 'Two Factor Authentication' })).toBeVisible();
    await expect(page.locator('.callout-banner.is-error')).toBeVisible();

    await page.locator('.nav-back-btn').click();
    await expect(page.getByLabel('Enter Email')).toBeVisible();
    await expect(page.getByLabel('Enter Password')).toHaveValue('');

    // Re-enter MFA -> digits must be cleared
    await page.getByLabel('Enter Password').fill('SecurePassword123!');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByLabel('Digit 1')).toHaveValue('');
    await page.locator('.nav-back-btn').click();

    // 4. mfa_enrollment_required routes straight to Connect Google Authenticator
    await page.route('**/api/v1/session/sign-in', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state: 'mfa_enrollment_required' }),
      });
    });
    await page.getByLabel('Enter Email').fill('newhead@ysp.org');
    await page.getByLabel('Enter Password').fill('StrongPass123!');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('heading', { name: 'Connect Google Authenticator' })).toBeVisible();

    // 5. Signup duplicate Chapter Head / Officer email guard
    await page.locator('.nav-back-btn').click(); // back to create-chapter
    await expect(page.getByRole('heading', { name: 'Create Chapter & Appoint Chapter Head' })).toBeVisible();
    await page.locator('#chapter-name-input').fill('Youth Service Philippines - Cebu Chapter');
    await page.locator('#head-name-input').fill('Ana Maria Reyes');
    await page.locator('#head-email-input').fill('ana.reyes@ysp.org');
    await page.locator('#initial-password-input').fill('MasterPassword2026!');
    await page.getByRole('button', { name: 'Save & Invite Officers' }).click();
    for (let i = 0; i < 6; i++) {
      await page.getByLabel(`Verification digit ${i + 1}`).fill('9');
    }
    await page.getByRole('button', { name: 'Confirm Pairing' }).click();
    await page.getByRole('button', { name: 'Proceed' }).click();

    // Try reusing Head email for Officer -> should reject & highlight email
    await page.locator('#officer-full-name-input').fill('Duplicate Person');
    await page.locator('#officer-email-input').fill('ANA.REYES@YSP.ORG');
    await page.getByRole('checkbox', { name: 'Inventory Custodian' }).click();
    await page.getByRole('button', { name: 'Proceed' }).click();
    await expect(page.locator('#officer-email-input')).toHaveClass(/input-invalid/);
    await expect(page.getByRole('heading', { name: 'Invite New Chapter Officer' })).toBeVisible();
  });

  test('executes P03 record return-revise-approve lifecycle, idempotency, stale comparison, and uncertain lookup recovery', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/?view=p03');
    await expect(
      page.getByRole('heading', { name: 'Record, Version & Durable Operation' })
    ).toBeVisible();

    // Unseeded clean state: zero default records, policies, reviewers, or pre-filled keys
    await expect(page.locator('#p03-state-header-title')).toHaveText('(Draft)');
    await expect(page.locator('#p03-purpose-input')).toHaveValue('');
    await expect(page.locator('#p03-qty-input')).toHaveValue('');
    await expect(page.locator('#p03-valuation-input')).toHaveValue('');
    await expect(page.locator('#p03-basis-input')).toHaveValue('');
    await expect(page.locator('#p03-submit-key-input')).toHaveValue('');
    await expect(page.locator('#p03-review-key')).toHaveValue('');
    await expect(page.locator('#p03-review-persona')).toHaveValue('');
    await page.getByTestId('p03-filter-idempotency-lookup').click();
    await expect(page.locator('#p03-lookup-chapter')).toHaveValue('');
    await expect(page.locator('#p03-lookup-key-input')).toHaveValue('');
    await page.getByTestId('p03-filter-submission-approval').click();

    // Seed explicit chapter + approved policy + test reviewers via localStorage for interactive P03 flow test
    await page.evaluate(() => {
      window.localStorage.setItem(
        'ysp_p03_context',
        JSON.stringify({
          chapter_id: '1',
          chapter_name: 'YSP Cebu',
          record: { id: 'ipc-01', kind: 'IPC' },
          policy_effective: true,
          policy_reference: {
            chapter_id: '1',
            policy_id: 'pol-cfg-1',
            policy_version_id: 'polv-cfg-1',
            version_no: 1,
            settings_hash: 'cfg_2026_0001_v1_hash',
            approval: {
              chapter_id: '1',
              record: { id: 'CFG-2026-0001', kind: 'CONFIG' },
              material_version: 1,
              material_hash: 'cfg_2026_0001_v1_mat',
            },
            effective_from: '2026-10-23T00:00:00.000000Z',
            effective_until: null,
          },
          personas: [
            {
              key: 'receiving_11',
              user_id: '11',
              actor_name: 'Ana Maria Reyes',
              duty_code: 'RECEIVING',
              membership_id: '111',
              duty_grant_id: '1101',
              label: 'Receiving Officer (Ana Maria Reyes)',
            },
            {
              key: 'head_21',
              user_id: '21',
              actor_name: 'Laurence Parojinog',
              duty_code: 'CHAPTER_HEAD',
              membership_id: '211',
              duty_grant_id: '2101',
              label: 'Chapter Head (Laurence Parojinog)',
            },
            {
              key: 'finance_22',
              user_id: '22',
              actor_name: 'Maria Clara Santos',
              duty_code: 'FINANCE',
              membership_id: '221',
              duty_grant_id: '2201',
              label: 'Finance Officer (Maria Clara Santos)',
            },
            {
              key: 'inventory_31',
              user_id: '31',
              actor_name: 'Pedro Penduko',
              duty_code: 'INVENTORY',
              membership_id: '311',
              duty_grant_id: '3101',
              label: 'Inventory Officer (Pedro Penduko)',
            },
          ],
        })
      );
    });
    await page.reload();

    await expect(page.locator('#p03-state-header-title')).toHaveText('(Draft)');
    await expect(page.getByTestId('p03-material-version-pill')).toContainText('Draft');
    await expect(page.getByTestId('p03-axis-approval')).toHaveText('draft');
    await expect(page.getByTestId('p03-submit-card')).toHaveClass(/is-needs-action/);

    // 1. Incomplete draft increments row version without creating material version
    await page.locator('#p03-save-draft-btn').click();
    await expect(page.getByTestId('p03-row-version-pill')).toContainText('v2');
    await expect(page.getByTestId('p03-material-version-pill')).toContainText('Draft');

    // 2. Fill fields + generate Idempotency-Key + Submit Material v1 + check Version History tab
    await page.locator('#p03-purpose-input').fill('Initial v1 physical count');
    await page.locator('#p03-qty-input').fill('15.00');
    await page.locator('#p03-valuation-input').fill('125.500000');
    await page.locator('#p03-basis-input').fill('Chapter opening physical inventory valuation');
    await page.locator('#p03-external-ref-input').fill('COUNT-SHEET-CEB-2026-01');
    await page.locator('#p03-new-key-btn').click();
    const v1SubmitKey = await page.locator('#p03-submit-key-input').inputValue();
    expect(v1SubmitKey).not.toBe('');

    await page.locator('#p03-submit-material-btn').click();
    await expect(page.getByTestId('p03-material-version-pill')).toContainText('v1');
    await expect(page.getByTestId('p03-review-card')).toHaveClass(/is-needs-action/);

    await page.getByTestId('p03-filter-version-history').click();
    await expect(page.getByTestId('p03-history-v1')).toBeVisible();
    await expect(page.getByTestId('p03-history-v1')).toContainText('COUNT-SHEET-CEB-2026-01');
    await expect(page.getByTestId('p03-history-v1')).toContainText('Policy pol-cfg-1 v1');
    await page.getByTestId('p03-filter-submission-approval').click();
    await expect(page.locator('#p03-review-decision option[value="cancel"]')).toHaveCount(1);
    await expect(page.getByTestId('p03-external-ref-input')).toBeVisible();

    // Replay exact same attempt (original key + original expected versions + same payload)
    await page.locator('#p03-expected-row').fill('2');
    await page.locator('#p03-expected-material').fill('');
    await page.locator('#p03-submit-key-input').fill(v1SubmitKey);
    await page.locator('#p03-submit-material-btn').click();
    await expect(page.getByTestId('p03-material-version-pill')).toContainText('v1');
    await page.getByTestId('p03-filter-idempotency-lookup').click();
    await expect(page.getByTestId('p03-latest-outcome')).toContainText('replayed: true');
    await page.getByTestId('p03-filter-submission-approval').click();

    // Reuse same key with changed payload -> blocked mismatch + red serious attention border
    await page.locator('#p03-purpose-input').fill('Changed payload on reused key');
    await page.locator('#p03-submit-material-btn').click();
    await expect(page.getByTestId('p03-blocker-panel')).toContainText('IDEMPOTENCY_PAYLOAD_MISMATCH');
    await expect(page.getByTestId('p03-submit-card')).toHaveClass(/is-serious-attention/);

    // 3. Return v1 -> Revise to v2 -> Check Version History -> Dual independent approval
    await page.locator('#p03-review-persona').selectOption('finance_22');
    await page.locator('#p03-review-decision').selectOption('return');
    await page.locator('#p03-review-reason').fill('Clarify valuation basis before final sign-off');
    await page.locator('#p03-new-review-key-btn').click();
    await page.locator('#p03-record-decision-btn').click();
    await expect(page.getByTestId('p03-axis-approval')).toHaveText('returned');
    await expect(page.getByTestId('p03-review-card')).toHaveClass(/is-serious-attention/);

    await page.locator('#p03-new-key-btn').click();
    await page.locator('#p03-purpose-input').fill('Revised v2 clarified count');
    await page.locator('#p03-submit-material-btn').click();
    await expect(page.getByTestId('p03-material-version-pill')).toContainText('v2');

    await page.getByTestId('p03-filter-version-history').click();
    await expect(page.getByTestId('p03-history-v2')).toContainText('Active · Pending Review');
    await expect(page.getByTestId('p03-history-v1')).toContainText('Superseded by Version 2');
    await expect(page.getByTestId('p03-history-v1')).toContainText('RETURNED FOR REVISION');

    // Hash copy button & Material Version hash search bar
    await expect(page.getByTestId('p03-hash-chip-v2')).toBeVisible();
    await page.getByTestId('p03-copy-hash-v1').click();
    await expect(page.getByTestId('p03-copy-hash-v1')).toHaveClass(/copied/);
    const v1HashTitle = await page.getByTestId('p03-hash-chip-v1').getAttribute('title');
    const v1HashHex = v1HashTitle?.split(': ').pop()?.trim() ?? '';
    expect(v1HashHex.length).toBeGreaterThanOrEqual(16);
    await page.getByTestId('p03-version-search-input').fill(v1HashHex.slice(0, 16));
    await expect(page.getByTestId('p03-search-match-pill')).toContainText('1 match · Material v1');
    await expect(page.getByTestId('p03-history-v1')).toBeVisible();
    await expect(page.getByTestId('p03-history-v2')).toHaveCount(0);
    await page.getByTestId('p03-search-clear-btn').click();
    await expect(page.getByTestId('p03-history-v2')).toBeVisible();

    await page.getByTestId('p03-filter-submission-approval').click();

    // Distinct approvals on v2 (Chapter Head + Finance)
    await page.locator('#p03-review-persona').selectOption('head_21');
    await page.locator('#p03-review-decision').selectOption('approve');
    await page.locator('#p03-review-reason').fill('Head sign-off on v2');
    await page.locator('#p03-new-review-key-btn').click();
    await page.locator('#p03-record-decision-btn').click();

    await page.locator('#p03-review-persona').selectOption('finance_22');
    await page.locator('#p03-review-reason').fill('Finance sign-off on v2');
    await page.locator('#p03-new-review-key-btn').click();
    await page.locator('#p03-record-decision-btn').click();
    await expect(page.getByTestId('p03-axis-approval')).toHaveText('approved');

    // 4. Stale version comparison preserves local draft and syncs cleanly
    await page.locator('#p03-new-key-btn').click();
    await page.locator('#p03-expected-row').fill('1');
    await page.locator('#p03-purpose-input').fill('Preserved local edit during conflict');
    await page.locator('#p03-submit-material-btn').click();
    await expect(page.getByTestId('p03-blocker-panel')).toContainText('STALE_ROW_VERSION');
    await expect(page.getByTestId('p03-stale-comparison')).toContainText(
      'Preserved local edit during conflict'
    );
    await page.getByRole('button', { name: 'Sync Expected Versions & Review' }).click();
    await expect(page.locator('#p03-purpose-input')).toHaveValue(
      'Preserved local edit during conflict'
    );

    // 5. Idempotency Lookup tab & back to Submission & Approval
    await page.getByTestId('p03-filter-idempotency-lookup').click();
    await expect(page.getByTestId('p03-lookup-card')).toBeVisible();
    await page.locator('#p03-lookup-key-input').fill('nonexistent-lookup-key');
    await page.locator('#p03-lookup-by-key-btn').click();
    await expect(page.getByTestId('p03-lookup-result')).not.toContainText('OPERATION_NOT_FOUND');

    await page.locator('#p03-lookup-key-input').fill(v1SubmitKey);
    await page.locator('#p03-lookup-by-key-btn').click();
    await expect(page.getByTestId('p03-lookup-result')).toContainText('Recovered Committed Result');
    await expect(page.getByTestId('p03-lookup-result')).toContainText('IPC-2026-0001');

    await page.getByTestId('p03-filter-submission-approval').click();
    await expect(page.getByTestId('p03-submit-card')).toBeVisible();
    await expect(page.getByTestId('p03-review-card')).toBeVisible();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P02 chapter context switch, provider boundary, S-21 membership/duty/policy controls, and S-22 provisioning', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/?view=p02');
    await expect(
      page.getByRole('heading', { name: 'Chapter Administration & Setup' })
    ).toBeVisible();

    // Unseeded clean state: zero default personas, chapters, memberships, duties, policies, or pre-filled forms
    await expect(page.locator('#p02-context-heading')).toContainText('No Active Officer Session');
    await expect(page.getByTestId('p02-chapter-state')).toContainText('NO AUTHORIZED MEMBERSHIPS');
    await expect(page.getByTestId('p02-next-action')).toContainText('NO CHAPTER WORK');
    await expect(page.locator('#p02-auth-user-id')).toHaveValue('');
    await expect(page.locator('#p02-auth-display-name')).toHaveValue('');
    await expect(page.locator('#p02-auth-email')).toHaveValue('');

    // Inject test session authority context via storage for full S-21/S-22 interactive flow test
    await page.evaluate(() => {
      window.localStorage.setItem(
        'ysp_p02_context',
        JSON.stringify({
          personas: [
            {
              key: 'head_21',
              user_id: '21',
              display_name: 'Laurence Parojinog',
              email: 'head@ysp.org',
              provider_roles: [],
            },
            {
              key: 'finance_22',
              user_id: '22',
              display_name: 'Maria Clara Santos',
              email: 'finance@ysp.org',
              provider_roles: [],
            },
            {
              key: 'receiving_11',
              user_id: '11',
              display_name: 'Ana Maria Reyes',
              email: 'receiving@ysp.org',
              provider_roles: [],
            },
            {
              key: 'provider_90',
              user_id: '90',
              display_name: 'Sam Provisioner',
              email: 'provider@ysp.org',
              provider_roles: ['provisioner'],
            },
          ],
          chapters: [
            { id: '1', code: 'CEB-01', name: 'YSP Cebu Chapter' },
            { id: '2', code: 'MNL-02', name: 'YSP Manila Chapter' },
          ],
          authority_versions: { '1': 3, '2': 2 },
          provider_authority_version: 5,
          active_persona_key: 'head_21',
          selected_chapter_id: '1',
          next_seq: 400,
          organization_id: 'org-ysp-ph',
          memberships: [
            {
              membership_id: '211',
              chapter_id: '1',
              chapter_code: 'CEB-01',
              chapter_name: 'YSP Cebu Chapter',
              user_id: '21',
              display_name: 'Laurence Parojinog',
              email: 'head@ysp.org',
              status: 'active',
              version: 1,
              active_sessions: 1,
            },
            {
              membership_id: '221',
              chapter_id: '1',
              chapter_code: 'CEB-01',
              chapter_name: 'YSP Cebu Chapter',
              user_id: '22',
              display_name: 'Maria Clara Santos',
              email: 'finance@ysp.org',
              status: 'active',
              version: 1,
              active_sessions: 1,
            },
            {
              membership_id: '111',
              chapter_id: '1',
              chapter_code: 'CEB-01',
              chapter_name: 'YSP Cebu Chapter',
              user_id: '11',
              display_name: 'Ana Maria Reyes',
              email: 'receiving@ysp.org',
              status: 'active',
              version: 1,
              active_sessions: 1,
            },
            {
              membership_id: '311',
              chapter_id: '1',
              chapter_code: 'CEB-01',
              chapter_name: 'YSP Cebu Chapter',
              user_id: '31',
              display_name: 'Pedro Penduko',
              email: 'pedro@ysp.org',
              status: 'active',
              version: 1,
              active_sessions: 2,
            },
            {
              membership_id: '212',
              chapter_id: '2',
              chapter_code: 'MNL-02',
              chapter_name: 'YSP Manila Chapter',
              user_id: '21',
              display_name: 'Laurence Parojinog',
              email: 'head@ysp.org',
              status: 'active',
              version: 1,
              active_sessions: 1,
            },
          ],
          duty_grants: [
            {
              id: '1001',
              chapter_id: '1',
              membership_id: '211',
              user_id: '21',
              officer_name: 'Laurence Parojinog',
              duty_code: 'CHAPTER_HEAD',
              scope_kind: 'chapter',
              requesting_unit_id: null,
              monetary_limit: null,
              starts_at: '2026-10-23T00:00:00.000000Z',
              ends_at: null,
              revoked_at: null,
              version: 1,
              alternate_for_grant_id: null,
            },
            {
              id: '1002',
              chapter_id: '1',
              membership_id: '221',
              user_id: '22',
              officer_name: 'Maria Clara Santos',
              duty_code: 'FINANCE',
              scope_kind: 'chapter',
              requesting_unit_id: null,
              monetary_limit: { currency: 'PHP', amount: '50000.00' },
              starts_at: '2026-10-23T00:00:00.000000Z',
              ends_at: null,
              revoked_at: null,
              version: 1,
              alternate_for_grant_id: null,
            },
            {
              id: '1003',
              chapter_id: '1',
              membership_id: '111',
              user_id: '11',
              officer_name: 'Ana Maria Reyes',
              duty_code: 'RECEIVING',
              scope_kind: 'chapter',
              requesting_unit_id: null,
              monetary_limit: null,
              starts_at: '2026-10-23T00:00:00.000000Z',
              ends_at: null,
              revoked_at: null,
              version: 1,
              alternate_for_grant_id: null,
            },
          ],
          policies: [
            {
              policy_id: 'pol-fin-2',
              chapter_id: '1',
              category: 'financial',
              policy_code: 'RETURN_REFUND_VALUATION_POLICY',
              name: 'Return, Refund Execution & Residual Cent Rounding Policy',
              status: 'draft',
              row_version: 1,
              material_version: 1,
              material_hash: 'pol_fin_2_hash',
              summary: 'Governs Finance-approved refunds and PHP 0.01 rounding.',
              workflow_affected: 'Refund Execution & Unequal Exchange Settlement',
              approved_by_duty: null,
              effective_from: null,
              last_reason: null,
            },
          ],
          provisioned_chapters: [
            {
              id: 'prov-1',
              organization_id: 'org-ysp-ph',
              provider_user_id: '90',
              chapter_code: 'CEB-01',
              chapter_name: 'YSP Cebu Chapter',
              version: 2,
              initial_head_user_id: '21',
              initial_head_name: 'Laurence Parojinog',
              initial_head_membership_authorization: 'not_applicable',
            },
          ],
        })
      );
    });
    await page.reload();

    // 1. Provider-only isolation (ADD-AC-09) + provisioning & global disable boundary
    await page.locator('#p02-persona-select').selectOption('provider_90');
    await expect(page.getByTestId('p02-chapter-state')).toContainText('NO AUTHORIZED MEMBERSHIPS');
    await expect(page.getByTestId('p02-next-action')).toContainText('NO CHAPTER WORK');
    await expect(page.getByTestId('p02-no-chapter-access-notice')).toBeVisible();

    await page.locator('#p02-chapter-select').selectOption('1');
    await expect(page.getByTestId('p02-feedback-banner')).toContainText(
      'PROVIDER_ONLY_NO_CHAPTER_ACCESS'
    );

    await page.locator('#p02-tab-provider').click();
    await page.locator('#p02-prov-code-input').fill('DVO-03');
    await page.locator('#p02-prov-name-input').fill('YSP Davao Chapter');
    await page.locator('#p02-prov-create-btn').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText(
      'PROVISIONED_CHAPTER_CREATED'
    );

    // Provisioning existing identity lookup (GET/POST reference without creating new account)
    await page.locator('#p02-appoint-head-id-input').fill('21');
    await page.locator('#p02-lookup-prov-identity-btn').click();
    await expect(page.getByTestId('p02-prov-identity-notice')).toContainText('Laurence Parojinog');
    await expect(page.getByTestId('p02-feedback-banner')).toContainText(
      'IDENTITY_REFERENCE_RESOLVED'
    );

    await page.locator('#p02-global-disable-user-input').fill('31');
    await page.locator('#p02-global-disable-reason-input').fill('Check global lockout availability');
    await page.locator('#p02-global-disable-btn').click();
    await expect(page.getByTestId('p02-global-disable-result')).toContainText('HTTP 503');
    await expect(page.getByTestId('p02-global-disable-result')).toContainText('Outcome: UNCERTAIN');
    await expect(page.getByTestId('p02-audit-log')).toBeVisible();

    // 2. Switch to CHAPTER_HEAD -> disable Pedro (session revoke) & lookup + authorize Sam (ADD-AC-09)
    await page.locator('#p02-persona-select').selectOption('head_21');
    await page.locator('#p02-tab-memberships').click();
    await expect(page.getByTestId('p02-selection-revision')).toBeVisible();
    await page.locator('#p02-membership-action-reason').fill('Term ended and session review');
    await page.getByTestId('p02-disable-31').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('MEMBERSHIP_DISABLED');
    await expect(page.getByTestId('p02-member-31')).toContainText('DISABLED');
    await expect(page.getByTestId('p02-member-31')).toContainText('0 SESSIONS');

    await page.locator('#p02-auth-user-id').fill('90');
    await page.locator('#p02-lookup-member-identity-btn').click();
    await expect(page.getByTestId('p02-member-identity-notice')).toContainText('Sam Provisioner');
    await page.locator('#p02-auth-email').fill('provider@ysp.org');
    await page.locator('#p02-auth-reason').fill('Separate chapter membership authorization');
    await page.locator('#p02-new-key-btn').click();
    await page.locator('#p02-authorize-member-btn').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('MEMBERSHIP_AUTHORIZED');
    await expect(page.getByTestId('p02-member-90')).toBeVisible();

    // Reusing an already-committed idempotency key after authority_version bumped triggers 409 IDEMPOTENCY_CONFLICT
    await page.locator('#p02-authorize-member-btn').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('IDEMPOTENCY_CONFLICT');
    await page.locator('#p02-idempotency-key-input').fill('');

    // Search filter check on roster
    await page.locator('#p02-admin-search-input').fill('Sam Provisioner');
    await expect(page.getByTestId('p02-search-match-count')).toContainText('1 match');
    await expect(page.getByTestId('p02-member-90')).toBeVisible();
    await page.locator('#p02-search-clear-btn').click();

    // 3. Duty grant authorization, amend, end, and distinct alternate substitution
    await page.locator('#p02-tab-duties').click();
    await page.locator('#p02-grant-member-select').selectOption('111');
    await page.locator('#p02-grant-duty-select').selectOption('RF_APPROVER');
    await page.locator('#p02-grant-limit-input').fill('1000.00');
    await page.locator('#p02-grant-reason-input').fill('Explicit operational delegation');
    await page.locator('#p02-authorize-grant-btn').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('DUTY_GRANT_AUTHORIZED');

    await page.locator('#p02-alternate-member-select').selectOption('221');
    await page.locator('#p02-duty-action-reason').fill('Approved scheduled alternate coverage');
    await page.locator('#p02-duty-ends-at-input').fill('2026-12-31T23:59:59.000000Z');
    await page.getByTestId('p02-amend-grant-1003').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('DUTY_GRANT_AMENDED');

    await page.locator('#p02-duty-ends-at-input').fill('2026-11-30T23:59:59.000000Z');
    await page.getByTestId('p02-end-grant-1003').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('DUTY_GRANT_ENDED');

    await page.getByTestId('p02-substitute-1003').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('ALTERNATE_DESIGNATED');

    // 4. Readiness Checklist + Operational vs Financial policy submit -> review -> approve gate enforcement
    await page.locator('#p02-tab-policies').click();
    await expect(page.getByTestId('p02-readiness-badge')).toContainText('Setup Incomplete');
    await page.getByTestId('p02-gate-commit-RETURN_REFUND_VALUATION_POLICY').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('POLICY_NOT_EFFECTIVE');

    // CHAPTER_HEAD cannot submit or approve FINANCIAL policy
    await page.locator('#p02-policy-reason-input').fill('Governance review against Stage 1 controls');
    await page.getByTestId('p02-policy-approve-RETURN_REFUND_VALUATION_POLICY').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('POLICY_DUTY_FORBIDDEN');

    // FINANCE submits -> reviews -> approves financial policy -> commit gate unblocks
    await page.locator('#p02-persona-select').selectOption('finance_22');
    await page.getByTestId('p02-policy-submit-RETURN_REFUND_VALUATION_POLICY').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('POLICY_SUBMITTED');
    await page.getByTestId('p02-policy-review-RETURN_REFUND_VALUATION_POLICY').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('POLICY_REVIEWED');
    await page.getByTestId('p02-policy-approve-RETURN_REFUND_VALUATION_POLICY').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('POLICY_APPROVED');

    await page.getByTestId('p02-gate-commit-RETURN_REFUND_VALUATION_POLICY').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('POLICY_EFFECTIVE');

    // 5. Scoped Durable Operation Lookup recovery by key & ULID + fail-closed missing selector
    await page.locator('#p02-tab-lookup').click();
    await expect(page.getByTestId('p02-operation-ledger')).toBeVisible();
    await page.locator('[data-testid^="p02-ledger-fill-"]').first().click();
    await page.locator('#p02-lookup-by-key-btn').click();
    await expect(page.getByTestId('p02-lookup-result')).toContainText('OPERATION_RECOVERED');
    await page.locator('#p02-lookup-by-ulid-btn').click();
    await expect(page.getByTestId('p02-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.locator('#p02-lookup-key-input').fill('unseen-key-check-99');
    await page.locator('#p02-lookup-by-key-btn').click();
    await expect(page.getByTestId('p02-lookup-result')).toContainText(
      'OPERATION_PENDING_OR_NOT_VISIBLE'
    );

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P04 dual-mode signature/upload lifecycle, changed-batch invalidation, handover recording, and idempotency lookup', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/?view=p04');
    await expect(
      page.getByRole('heading', { name: 'Ready Evidence & Signed Handover' })
    ).toBeVisible();
    await expect(page.locator('#p04-state-header-title')).toHaveText(
      'Internal Requisition Handover'
    );
    // Clean default state: zero pre-generated recipient, reference, batch lines, or idempotency key
    await expect(page.getByTestId('p04-reference-pill')).toContainText('Unassigned');
    await expect(page.getByTestId('p04-empty-batch-notice')).toBeVisible();
    await expect(page.locator('#p04-recipient-input')).toHaveValue('');
    await expect(page.locator('#p04-handover-key-input')).toHaveValue('');

    await expect(page.getByTestId('p04-binding-status-pill')).toContainText('MISSING');
    await expect(page.getByTestId('p04-stock-movements-count')).toHaveText('0');
    await expect(page.getByTestId('p04-attention-badge')).toContainText('Needs Action');
    await expect(page.getByTestId('p04-state-card')).toHaveClass(/is-needs-action/);

    // 1. Empty default state rejects staging without recipient
    await page.locator('#p04-stage-canvas-btn').click();
    await expect(page.getByTestId('p04-blocker-panel')).toContainText('RECIPIENT_REQUIRED');

    // 2. Populate requisition reference, recipient, and inventory line on demand
    await page.locator('#p04-record-number-input').fill('RF-2026-0004');
    await expect(page.getByTestId('p04-reference-pill')).toContainText('RF-2026-0004');
    await page.locator('#p04-recipient-input').fill('Marco Villanueva');

    await page.locator('#p04-add-line-toggle-btn').click();
    await page.locator('#p04-add-sku-input').fill('INV-01');
    await page.locator('#p04-add-name-input').fill('Chapter Supply Item');
    await page.locator('#p04-add-unit-input').fill('unit');
    await page.locator('#p04-add-auth-qty-input').fill('15');
    await page.locator('#p04-add-actual-qty-input').fill('10');
    await page.locator('#p04-add-line-confirm-btn').click();
    await expect(page.getByTestId('p04-empty-batch-notice')).toHaveCount(0);
    await expect(page.locator('#p04-line-qty-0')).toHaveValue('10');

    // Empty canvas submission still rejected without changing stock
    await page.locator('#p04-stage-canvas-btn').click();
    await expect(page.getByTestId('p04-blocker-panel')).toContainText('SIGNATURE_CANVAS_EMPTY');

    // 3. Draw verified signature via real pointer strokes, test Undo/Redo, stage v1 canvas evidence
    const sigCanvas = page.locator('#p04-signature-canvas');
    const sigBox = await sigCanvas.boundingBox();
    expect(sigBox).not.toBeNull();
    if (sigBox) {
      await page.mouse.move(sigBox.x + 48, sigBox.y + sigBox.height * 0.42);
      await page.mouse.down();
      await page.mouse.move(sigBox.x + 128, sigBox.y + sigBox.height * 0.34, { steps: 5 });
      await page.mouse.move(sigBox.x + 190, sigBox.y + sigBox.height * 0.56, { steps: 5 });
      await page.mouse.up();

      await page.mouse.move(sigBox.x + 62, sigBox.y + sigBox.height * 0.72);
      await page.mouse.down();
      await page.mouse.move(sigBox.x + 220, sigBox.y + sigBox.height * 0.66, { steps: 5 });
      await page.mouse.up();
    }
    await expect(page.getByTestId('p04-stroke-count')).toContainText('2 strokes');
    await page.locator('#p04-undo-stroke-btn').click();
    await expect(page.getByTestId('p04-stroke-count')).toContainText('1 stroke');
    await page.locator('#p04-redo-stroke-btn').click();
    await expect(page.getByTestId('p04-stroke-count')).toContainText('2 strokes');

    await page.locator('#p04-stage-canvas-btn').click();
    await expect(page.getByTestId('p04-evidence-version-pill')).toContainText('v1');
    await expect(page.getByTestId('p04-binding-status-pill')).toContainText('READY');
    await expect(page.getByTestId('p04-attention-badge')).toContainText('Ready for Handover');
    await expect(page.getByTestId('p04-state-card')).not.toHaveClass(/is-needs-action/);
    await expect(page.getByTestId('p04-state-card')).not.toHaveClass(/is-serious-attention/);
    await expect(page.getByTestId('p04-stock-movements-count')).toHaveText('0');
    await page.getByTestId('p04-copy-live-hash-btn').click();
    await expect(page.getByTestId('p04-copy-live-hash-btn')).toHaveClass(/copied/);
    await page.getByTestId('p04-copy-bound-hash-btn').click();
    await expect(page.getByTestId('p04-copy-bound-hash-btn')).toHaveClass(/copied/);

    // 4. Modify quantity -> invalidates prior v1 binding (ADD-AC-05)
    await page.locator('#p04-line-qty-0').fill('8');
    await expect(page.getByTestId('p04-binding-status-pill')).toContainText('MISMATCHED');
    await expect(page.getByTestId('p04-blocker-panel')).toContainText('SNAPSHOT_CHANGED');
    await expect(page.getByTestId('p04-mismatch-comparison')).toBeVisible();

    // 5. Switch to Method B Upload -> upload & stage valid PDF as v2 preserving revised quantity
    await page.locator('#p04-mode-upload-btn').click();
    await page.locator('#p04-file-input').setInputFiles({
      name: 'signed-handover-v2.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n'),
    });
    await expect(page.getByTestId('p04-upload-preview')).toContainText('signed-handover-v2.pdf');
    await page.locator('#p04-upload-reason-input').fill('Revised batch signed paper scan');
    await page.locator('#p04-stage-upload-btn').click();
    await expect(page.locator('#p04-line-qty-0')).toHaveValue('8');
    await expect(page.getByTestId('p04-evidence-version-pill')).toContainText('v2');
    await expect(page.getByTestId('p04-binding-status-pill')).toContainText('READY');
    await expect(page.getByTestId('p04-attention-badge')).toContainText('Ready for Handover');
    await expect(page.getByTestId('p04-state-card')).not.toHaveClass(/is-needs-action/);
    await expect(page.getByTestId('p04-state-card')).not.toHaveClass(/is-serious-attention/);

    // 6. Generate idempotency key + record signed handover -> verify Lookup by key and ULID
    await page.locator('#p04-new-key-btn').click();
    await expect(page.locator('#p04-handover-key-input')).not.toHaveValue('');
    await page.locator('#p04-record-handover-btn').click();
    await page.locator('#p04-tab-guard').click();
    await expect(page.getByTestId('p04-lookup-card')).toBeVisible();
    await page.locator('#p04-lookup-by-key-btn').click();
    await expect(page.getByTestId('p04-lookup-result')).toContainText('Recovered Committed Result');
    await expect(page.getByTestId('p04-lookup-result')).toContainText('RF-2026-0004');

    await page.locator('#p04-lookup-by-ulid-btn').click();
    await expect(page.getByTestId('p04-lookup-result')).toContainText('Recovered Committed Result');

    // 7. Evidence History tab: retained superseded v1 + active v2 + search + hash copy
    await page.locator('#p04-tab-history').click();
    await expect(page.getByTestId('p04-history-v2')).toContainText('ACTIVE · READY');
    await expect(page.getByTestId('p04-history-v1')).toContainText('SUPERSEDED BY VERSION 2');

    await page.getByTestId('p04-hist-copy-file-v1').click();
    await expect(page.getByTestId('p04-hist-copy-file-v1')).toHaveClass(/copied/);

    await page.locator('#p04-evidence-search-input').fill('signed paper upload');
    await expect(page.getByTestId('p04-search-match-count')).toContainText('1 match');
    await expect(page.getByTestId('p04-history-v2')).toBeVisible();
    await expect(page.getByTestId('p04-history-v1')).toHaveCount(0);
    await page.locator('#p04-search-clear-btn').click();
    await expect(page.getByTestId('p04-history-v1')).toBeVisible();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

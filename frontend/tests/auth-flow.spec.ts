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
    await expect(page.locator('#p03-state-header-title')).toHaveText('Initial Physical Count');
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

    await expect(page.locator('#p03-state-header-title')).toHaveText('Initial Physical Count');
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

  test('executes P05 non-posting catalog, policy gate, 7-view stock query, disjoint overlap split/clearance, and durable lookup', async ({
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

    await page.goto('/?view=p05');
    await expect(
      page.getByRole('heading', { name: 'Inventory Catalog & Stock Eligibility' })
    ).toBeVisible();

    // Unseeded clean state: zero variants, units, cells, holds, and empty form inputs
    await expect(page.getByTestId('p05-variant-count-pill')).toContainText('0');
    await expect(page.getByTestId('p05-unit-count-pill')).toContainText('0');
    await expect(page.getByTestId('p05-cell-count-pill')).toContainText('0');
    await expect(page.getByTestId('p05-empty-catalog-notice')).toBeVisible();
    await expect(page.locator('#p05-unit-code-input')).toHaveValue('');
    await expect(page.locator('#p05-location-code-input')).toHaveValue('');
    await expect(page.locator('#p05-variant-sku-input')).toHaveValue('');
    await expect(page.locator('#p05-policy-rop-input')).toHaveValue('');

    // Verify precise inline row height and vertical alignment for Register Unit & Register Location
    const unitSelectBox = await page.locator('#p05-unit-scale-select').boundingBox();
    const addUnitBtnBox = await page.locator('#p05-add-unit-btn').boundingBox();
    expect(unitSelectBox).not.toBeNull();
    expect(addUnitBtnBox).not.toBeNull();
    if (unitSelectBox && addUnitBtnBox) {
      expect(Math.abs(unitSelectBox.y - addUnitBtnBox.y)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(unitSelectBox.height - addUnitBtnBox.height)).toBeLessThanOrEqual(0.5);
    }

    const locSelectBox = await page.locator('#p05-location-custody-select').boundingBox();
    const addLocBtnBox = await page.locator('#p05-add-location-btn').boundingBox();
    expect(locSelectBox).not.toBeNull();
    expect(addLocBtnBox).not.toBeNull();
    if (locSelectBox && addLocBtnBox) {
      expect(Math.abs(locSelectBox.y - addLocBtnBox.y)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(locSelectBox.height - addLocBtnBox.height)).toBeLessThanOrEqual(0.5);
    }

    // 1. Interactively register Unit (PCS, scale 0), Location (LOC-MAIN), and Variant (YSP-SHIRT-M)
    await page.locator('#p05-unit-code-input').fill('PCS');
    await page.locator('#p05-unit-name-input').fill('Pieces');
    await page.locator('#p05-unit-scale-select').selectOption('0');
    await page.locator('#p05-add-unit-btn').click();
    await expect(page.getByTestId('p05-feedback-banner')).toContainText('UNIT_REGISTERED');

    await page.locator('#p05-location-code-input').fill('LOC-MAIN');
    await page.locator('#p05-location-name-input').fill('Main Stockroom');
    await page.locator('#p05-location-custody-select').selectOption('stockroom');
    await page.locator('#p05-add-location-btn').click();
    await expect(page.getByTestId('p05-feedback-banner')).toContainText('LOCATION_REGISTERED');

    await page.locator('#p05-variant-sku-input').fill('YSP-SHIRT-M');
    await page.locator('#p05-variant-name-input').fill('Chapter Relief T-Shirt');
    await page.locator('#p05-add-variant-btn').click();
    await expect(page.getByTestId('p05-feedback-banner')).toContainText('VARIANT_REGISTERED');
    await expect(page.getByTestId('p05-variant-count-pill')).toContainText('1');

    // Non-posting guard check: rejects arbitrary direct balance setter
    await page.locator('#p05-test-direct-balance-btn').click();
    await expect(page.getByTestId('p05-feedback-banner')).toContainText(
      'DIRECT_BALANCE_SETTER_FORBIDDEN'
    );

    // Querying before approved policy rejects with POLICY_NOT_EFFECTIVE
    await page.locator('#p05-tab-eligibility').click();
    await page.locator('#p05-query-purpose-select').selectOption('internal');
    await page.locator('#p05-query-qty-input').fill('2');
    await page.locator('#p05-run-query-btn').click();
    await expect(page.getByTestId('p05-feedback-banner')).toContainText('POLICY_NOT_EFFECTIVE');

    // Prepare & approve item ROP policy -> run zero-stock query across all 7 views
    await page.locator('#p05-tab-catalog').click();
    await page.locator('#p05-policy-rop-input').fill('8');
    await page.locator('#p05-prepare-policy-btn').click();
    await expect(page.getByTestId('p05-feedback-banner')).toContainText('ITEM_POLICY_DRAFTED');
    await page.locator('#p05-approve-policy-btn').click();
    await expect(page.getByTestId('p05-feedback-banner')).toContainText('ITEM_POLICY_APPROVED');

    await page.locator('#p05-tab-eligibility').click();
    await page.locator('#p05-run-query-btn').click();
    await expect(page.getByTestId('p05-feedback-banner')).toContainText('ELIGIBILITY_ZERO_STOCK');
    await expect(page.getByTestId('p05-view-usable-on-hand')).toHaveText('0');
    await expect(page.getByTestId('p05-view-available')).toHaveText('0');
    await expect(page.getByTestId('p05-view-rf-reserved')).toHaveText('0');
    await expect(page.getByTestId('p05-view-so-reserved')).toHaveText('0');
    await expect(page.getByTestId('p05-view-booth-custody')).toHaveText('0');
    await expect(page.getByTestId('p05-view-quarantined')).toHaveText('0');
    await expect(page.getByTestId('p05-view-inbound-po')).toHaveText('0');

    // 2. Seed P05 test context with 10-unit RM-backed lot [0, 10) for disjoint cell hold split & clearance
    await page.evaluate(() => {
      window.localStorage.setItem(
        'ysp_p05_context',
        JSON.stringify({
          chapter_id: '1',
          chapter_name: 'YSP Cebu Chapter',
          units: [{ unit_id: '61', chapter_id: '1', code: 'PCS', name: 'Pieces', quantity_scale: 0 }],
          locations: [
            {
              location_id: '91',
              chapter_id: '1',
              code: 'LOC-MAIN',
              name: 'Main Stockroom',
              custody_kind: 'stockroom',
              custody_assignment_id: '101',
              custodian_user_id: null,
            },
          ],
          variants: [
            {
              variant_id: '71',
              chapter_id: '1',
              sku: 'YSP-SHIRT-M',
              item_name: 'Chapter Relief T-Shirt',
              variant_label: 'Medium',
              unit_id: '61',
              quantity_scale: 0,
              eligibility_version: 1,
              policy_status: 'approved',
              policy_version_id: '301',
              draft_rop_threshold: { value: '5', quantity_scale: 0 },
              approved_rop_threshold: { value: '5', quantity_scale: 0 },
              restriction_version_ids: ['201'],
            },
          ],
          cells: [
            {
              cell_id: '2001',
              dimension: {
                chapter_id: '1',
                variant_id: '71',
                unit_id: '61',
                quantity_scale: 0,
                lot_id: '1201',
                position_id: '1301',
                location_id: '91',
                custody_assignment_id: '101',
                custodian_user_id: null,
                custody_kind: 'stockroom',
                condition_code: 'usable',
                lot_kind: 'accepted',
                restriction_version_id: '201',
                source: {
                  chapter_id: '1',
                  record: { id: '901', kind: 'RM' },
                  line_id: '601',
                  line_kind: 'RM',
                  variant_id: '71',
                },
              },
              start: '0',
              end: '10',
              quantity: { value: '10', quantity_scale: 0 },
              active_hold_ids: [],
              active_reservation_id: null,
              non_hold_eligibility: 'eligible',
              blocking_codes: [],
            },
          ],
          position_versions: { '1301': 1 },
        })
      );
    });
    await page.reload();

    // Record overlapping holds [0, 3) and [2, 4) -> verify disjoint split into 4 cells & union math
    await page.locator('#p05-tab-holds').click();
    await page.locator('#p05-hold-variant-select').selectOption('71');
    await page.locator('#p05-hold-reason-input').fill('overlap_hold_a');
    await page.locator('#p05-hold-lot-input').fill('1201');
    await page.locator('#p05-hold-position-input').fill('1301');
    await page.locator('#p05-hold-start-input').fill('0');
    await page.locator('#p05-hold-end-input').fill('3');
    await page.locator('#p05-hold-evidence-hash-input').fill('a'.repeat(64));
    await page.locator('#p05-hold-key-input').fill('e2e-hold-key-a');
    await page.locator('#p05-record-hold-btn').click();
    await expect(page.getByTestId('p05-feedback-banner')).toContainText('HOLD_RECORDED');

    await page.locator('#p05-hold-reason-input').fill('overlap_hold_b');
    await page.locator('#p05-hold-start-input').fill('2');
    await page.locator('#p05-hold-end-input').fill('4');
    await page.locator('#p05-hold-evidence-hash-input').fill('b'.repeat(64));
    await page.locator('#p05-hold-key-input').fill('e2e-hold-key-b');
    await page.locator('#p05-record-hold-btn').click();
    await expect(page.getByTestId('p05-feedback-banner')).toContainText('HOLD_RECORDED');

    await page.locator('#p05-tab-eligibility').click();
    await page.locator('#p05-query-variant-select').selectOption('71');
    await page.locator('#p05-query-purpose-select').selectOption('internal');
    await page.locator('#p05-query-qty-input').fill('2');
    await page.locator('#p05-run-query-btn').click();
    await expect(page.getByTestId('p05-cells-table').locator('tbody tr')).toHaveCount(4);
    await expect(page.getByTestId('p05-union-held')).toHaveText('4');
    await expect(page.getByTestId('p05-view-available')).toHaveText('6');

    // Clear first hold -> verify held_union drops to 2 and available_to_allocate increases to 8 with 0 movements
    await page.locator('#p05-tab-holds').click();
    await page.locator('#p05-clear-reason-input').fill('Verified sample batch intact');
    await page.locator('#p05-clear-evidence-hash-input').fill('c'.repeat(64));
    await page.locator('#p05-clear-key-input').fill('e2e-clear-key-a');
    await page.locator('[data-testid^="p05-clear-hold-"]').first().click();
    await expect(page.getByTestId('p05-feedback-banner')).toContainText('HOLD_CLEARED');

    await page.locator('#p05-tab-eligibility').click();
    await page.locator('#p05-run-query-btn').click();
    await expect(page.getByTestId('p05-union-held')).toHaveText('2');
    await expect(page.getByTestId('p05-view-available')).toHaveText('8');

    // Verify durable operation lookup by key & ULID
    await page.locator('#p05-tab-lookup').click();
    await page.locator('#p05-lookup-by-key-btn').click();
    await expect(page.getByTestId('p05-lookup-result')).toContainText('OPERATION_RECOVERED');
    await page.locator('#p05-lookup-by-ulid-btn').click();
    await expect(page.getByTestId('p05-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p05_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('completes Opening Physical Count, Receiving Inspection & Split, Atomic Baseline Lock, Duplicate Fence & Lookup without console/runtime errors', async ({
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

    await page.goto('/?view=p06');
    await expect(
      page.getByRole('heading', { name: 'Opening Physical Count & Baseline Acceptance' })
    ).toBeVisible();

    // Unseeded zero-data initial state check
    await expect(page.getByTestId('p06-empty-counters-notice')).toBeVisible();
    await expect(page.getByTestId('p06-empty-ipc-lines-notice')).toBeVisible();
    await expect(page.getByTestId('p06-baseline-lock-pill')).toContainText('Unlocked');
    await expect(page.getByTestId('p06-usable-on-hand-val')).toHaveText('0');
    await expect(page.locator('#p06-counter-user-id')).toHaveValue('');
    await expect(page.locator('#p06-ipc-variant-id')).toHaveValue('');

    // Add first counter (custodian) + usable count line
    await page.locator('#p06-counter-user-id').fill('11');
    await page.locator('#p06-counter-name').fill('Officer Eleven');
    await page.locator('#p06-counter-custodian-checkbox').check();
    await page.locator('#p06-add-counter-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText('COUNTER_ADDED');

    await page.locator('#p06-ipc-line-id').fill('501');
    await page.locator('#p06-ipc-variant-id').fill('71');
    await page.locator('#p06-ipc-sku').fill('TENT-4P');
    await page.locator('#p06-ipc-item-name').fill('Four-Person Field Tent');
    await page.locator('#p06-ipc-location-id').fill('81');
    await page.locator('#p06-ipc-custody-id').fill('82');
    await page.locator('#p06-ipc-condition').selectOption('usable');
    await page.locator('#p06-ipc-scale').selectOption('0');
    await page.locator('#p06-ipc-qty').fill('10');
    await page.locator('#p06-ipc-valuation').fill('25');
    await page.locator('#p06-ipc-valuation-basis').fill('Approved baseline schedule');
    await page.locator('#p06-ipc-restriction-id').fill('83');
    await page.locator('#p06-add-ipc-line-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText('IPC_LINE_ADDED');

    // Attempt IPC publish without independent non-custodian counter -> 409 COUNTER_INDEPENDENCE_REQUIRED
    await page.locator('#p06-ipc-policy-id').fill('42');
    await page.locator('#p06-ipc-cutoff-at').fill('2026-10-23T23:00:00.000000Z');
    await page.locator('#p06-ipc-counted-at').fill('2026-10-24T06:00:00.000000Z');
    await page.locator('#p06-ipc-purpose').fill('Initial chapter baseline opening count');
    await page.locator('#p06-ipc-sheet-hash').fill('c'.repeat(64));
    await page.locator('#p06-ipc-head-approved').check();
    await page.locator('#p06-ipc-finance-approved').check();
    await page.locator('#p06-publish-ipc-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText(
      'COUNTER_INDEPENDENCE_REQUIRED'
    );

    // Add independent counter & damaged count line -> approve & publish IPC
    await page.locator('#p06-counter-user-id').fill('12');
    await page.locator('#p06-counter-name').fill('Auditor Twelve');
    await page.locator('#p06-add-counter-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText('COUNTER_ADDED');

    await page.locator('#p06-ipc-line-id').fill('502');
    await page.locator('#p06-ipc-location-id').fill('84');
    await page.locator('#p06-ipc-custody-id').fill('85');
    await page.locator('#p06-ipc-condition').selectOption('damaged');
    await page.locator('#p06-ipc-qty').fill('2');
    await page.locator('#p06-add-ipc-line-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText('IPC_LINE_ADDED');

    await page.locator('#p06-publish-ipc-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText('IPC_PUBLISHED');
    await expect(page.getByTestId('p06-usable-on-hand-val')).toHaveText('0');

    // Switch to Tab 2: Receiving Inspection & Split (10 usable + 2 damaged)
    await page.locator('#p06-tab-inspection').click();
    await page.locator('#p06-rm-source-line-select').selectOption('501');
    await page.locator('#p06-rm-line-id').fill('601');
    await page.locator('#p06-rm-delivered-qty').fill('10');
    await page.locator('#p06-rm-accepted-qty').fill('10');
    await page.locator('#p06-rm-rejected-qty').fill('0');
    await page.locator('#p06-rm-held-qty').fill('0');
    await page.locator('#p06-rm-missing-qty').fill('0');
    await page.locator('#p06-rm-nonusable-qty').fill('0');
    await page.locator('#p06-rm-condition').selectOption('usable');
    await page.locator('#p06-rm-notes').fill('Ten inspected usable units matching count sheet.');
    await page.locator('#p06-save-rm-line-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText('RM_INSPECTION_LINE_SAVED');

    await page.locator('#p06-rm-source-line-select').selectOption('502');
    await page.locator('#p06-rm-line-id').fill('602');
    await page.locator('#p06-rm-delivered-qty').fill('2');
    await page.locator('#p06-rm-accepted-qty').fill('0');
    await page.locator('#p06-rm-rejected-qty').fill('2');
    await page.locator('#p06-rm-held-qty').fill('0');
    await page.locator('#p06-rm-missing-qty').fill('0');
    await page.locator('#p06-rm-nonusable-qty').fill('2');
    await page.locator('#p06-rm-condition').selectOption('damaged');
    await page.locator('#p06-rm-notes').fill('Two damaged units segregated in holding.');
    await page.locator('#p06-save-rm-line-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText('RM_INSPECTION_LINE_SAVED');

    await page.locator('#p06-rm-inspection-at').fill('2026-10-24T06:30:00.000000Z');
    await page.locator('#p06-rm-inspection-hash').fill('d'.repeat(64));
    await page.locator('#p06-rm-discrepancy-hash').fill('e'.repeat(64));
    await page.locator('#p06-publish-rm-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText('RM_INSPECTION_PUBLISHED');

    // Switch to Tab 3: Atomic Opening Baseline Acceptance
    await page.locator('#p06-tab-acceptance').click();
    await expect(page.getByTestId('p06-gate1-checklist')).toContainText('Verified');
    await expect(page.getByTestId('p06-gate1-checklist')).toContainText('Approved');
    await expect(page.getByTestId('p06-gate1-checklist')).toContainText('Complete');
    await expect(page.getByTestId('p06-gate1-checklist')).toContainText('3 ready');

    await page.locator('#p06-accept-idempotency-key').fill('e2e-p06-accept-01');
    await page.locator('#p06-commit-baseline-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText('OPENING_BASELINE_ACCEPTED');
    await expect(page.getByTestId('p06-usable-on-hand-val')).toHaveText('10');
    await expect(page.getByTestId('p06-quarantined-val')).toHaveText('2');
    await expect(page.getByTestId('p06-baseline-lock-pill')).toContainText('Locked');
    await expect(page.getByTestId('p06-accepted-summary')).toContainText('Baseline #1001');
    await expect(page.getByTestId('p06-accepted-summary')).toContainText('Discrepancies: #1501');

    // Replay with same key succeeds before lock check; fresh key triggers once-only baseline fence
    await page.locator('#p06-replay-same-key-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText('OPENING_BASELINE_REPLAYED');

    await page.locator('#p06-simulate-duplicate-baseline-btn').click();
    await expect(page.getByTestId('p06-feedback-banner')).toContainText('DUPLICATE_OPENING_BASELINE');

    // Switch to Tab 4: Durable Operation Recovery by Key and ULID
    await page.locator('#p06-tab-lookup').click();
    await page.locator('#p06-lookup-key-input').fill('e2e-p06-accept-01');
    await page.locator('#p06-lookup-by-key-btn').click();
    await expect(page.getByTestId('p06-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.locator('[data-testid^="p06-ledger-fill-"]').first().click();
    await page.locator('#p06-lookup-by-ulid-btn').click();
    await expect(page.getByTestId('p06-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p06_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P07 Internal Requisition intake, unsaved edit preservation, return-revise-approve lifecycle, reservation AC-01 conflict, cancellation fence & recovery', async ({
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

    await page.goto('/?view=p07');
    await expect(
      page.getByRole('heading', { name: 'Internal Requisitions & Stock Reservations' })
    ).toBeVisible();

    // Zero-data initial state check
    await expect(page.getByTestId('p07-empty-queue-notice')).toBeVisible();
    await expect(page.getByTestId('p07-usable-on-hand-val')).toHaveText('0');
    await expect(page.getByTestId('p07-rf-reserved-val')).toHaveText('0');
    await expect(page.getByTestId('p07-available-val')).toHaveText('0');
    await expect(page.getByTestId('p07-shortage-val')).toHaveText('0');
    await expect(page.locator('#p07-draft-requester-id')).toHaveValue('');
    await expect(page.locator('#p07-draft-qty')).toHaveValue('');

    // Fill draft & verify unsaved edit preservation across tab switch
    await page.locator('#p07-draft-requester-id').fill('101');
    await page.locator('#p07-draft-unit-id').fill('UNIT-LOGISTICS');
    await page.locator('#p07-draft-needed-at').fill('2026-12-01T09:00:00.000000Z');
    await page.locator('#p07-draft-justification').fill('Relief shelter staging');
    await page.locator('#p07-draft-line-id').fill('rf-line-501');
    await page.locator('#p07-draft-variant-id').fill('71');
    await page.locator('#p07-draft-sku').fill('TENT-4P');
    await page.locator('#p07-draft-item-name').fill('Four-Person Field Tent');
    await page.locator('#p07-draft-qty').fill('10');
    await page.locator('#p07-draft-scale').selectOption('0');

    await page.locator('#p07-tab-review').click();
    await expect(page.getByTestId('p07-unsaved-draft-pill')).toBeVisible();
    await page.locator('#p07-tab-intake').click();
    await expect(page.locator('#p07-draft-justification')).toHaveValue('Relief shelter staging');
    await expect(page.locator('#p07-draft-qty')).toHaveValue('10');

    // Create draft & submit for once-only CEBU-RF-2026-000001 reference
    await page.locator('#p07-create-draft-btn').click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('RF_DRAFT_CREATED');
    await page.locator('[data-testid^="p07-submit-rf-"]').first().click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('RF_SUBMITTED');
    await expect(page.getByTestId('p07-queue-list')).toContainText('CEBU-RF-2026-000001');

    // Switch to Review: self-approval rejected -> return -> revise -> resubmit -> independent approve
    await page.locator('#p07-tab-review').click();
    await page.locator('#p07-review-actor-id').fill('101');
    await page.locator('#p07-approve-rf-btn').click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('INDEPENDENCE_REQUIRED');

    await page.locator('#p07-review-actor-id').fill('202');
    await page.locator('#p07-review-reason').fill('Verify unit staging allocation');
    await page.locator('#p07-return-rf-btn').click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('RF_RETURNED');

    await page.locator('#p07-revise-reason').fill('Confirmed logistics allocation');
    await page.locator('#p07-revise-rf-btn').click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('RF_REVISED_TO_DRAFT');

    await page.locator('#p07-submit-selected-rf-btn').click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('RF_SUBMITTED');

    await page.locator('#p07-review-actor-id').fill('202');
    await page.locator('#p07-review-actor-name').fill('Approver Two');
    await page.locator('#p07-approve-rf-btn').click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('RF_APPROVED');
    await expect(page.getByTestId('p07-selected-rf-summary')).toContainText('CEBU-RF-2026-000001');

    // Switch to Reservations: register lot (10 usable), prepare partial (6) & competing (10)
    await page.locator('#p07-tab-reservations').click();
    await page.locator('#p07-lot-id').fill('lot-71');
    await page.locator('#p07-lot-variant-id').fill('71');
    await page.locator('#p07-lot-item-name').fill('Four-Person Field Tent');
    await page.locator('#p07-lot-qty').fill('10');
    await page.locator('#p07-lot-scale').selectOption('0');
    await page.locator('#p07-register-lot-btn').click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('STOCK_LOT_REGISTERED');
    await expect(page.getByTestId('p07-usable-on-hand-val')).toHaveText('10');

    await page.locator('#p07-res-actor-id').fill('301');
    await page.locator('#p07-res-offset').fill('0');
    await page.locator('#p07-res-qty').fill('6');
    await page.locator('#p07-prepare-res-btn').click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('RESERVATION_PREPARED');

    await page.locator('#p07-res-actor-id').fill('302');
    await page.locator('#p07-res-offset').fill('0');
    await page.locator('#p07-res-qty').fill('10');
    await page.locator('#p07-prepare-res-btn').click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('RESERVATION_PREPARED');

    // Commit first preparation (6 units) -> succeeds; competing second commit (10 units) -> AVAILABILITY_CONFLICT
    await page.locator('[data-testid^="p07-commit-prep-"]').first().click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('RESERVATION_COMMITTED');
    await expect(page.getByTestId('p07-usable-on-hand-val')).toHaveText('10');
    await expect(page.getByTestId('p07-rf-reserved-val')).toHaveText('6');
    await expect(page.getByTestId('p07-available-val')).toHaveText('4');

    await page.locator('[data-testid^="p07-commit-prep-"]').first().click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('AVAILABILITY_CONFLICT');
    await expect(page.getByTestId('p07-rf-reserved-val')).toHaveText('6');

    // Cancellation while reservation active -> COMMITMENT_CONFLICT; release -> RF_CANCELED
    await page.locator('#p07-tab-review').click();
    await page.locator('#p07-review-reason').fill('Event rescheduled');
    await page.locator('#p07-cancel-rf-btn').click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('COMMITMENT_CONFLICT');

    await page.locator('#p07-tab-reservations').click();
    await page.locator('#p07-res-manage-reason').fill('Release reservation prior to cancel');
    await page.locator('[data-testid^="p07-release-res-"]').first().click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('RESERVATION_RELEASED');
    await expect(page.getByTestId('p07-rf-reserved-val')).toHaveText('0');
    await expect(page.getByTestId('p07-available-val')).toHaveText('10');

    await page.locator('#p07-tab-review').click();
    await page.locator('#p07-cancel-rf-btn').click();
    await expect(page.getByTestId('p07-feedback-banner')).toContainText('RF_CANCELED');

    // Audit History & Operation Status Recovery lookup
    await page.locator('#p07-tab-history').click();
    await expect(page.getByTestId('p07-history-list')).toContainText('commitRfReservation');
    await expect(page.getByTestId('p07-history-list')).toContainText('cancelInternalRf');

    await page.locator('[data-testid^="p07-ledger-fill-"]').first().click();
    await page.locator('#p07-lookup-by-key-btn').click();
    await expect(page.getByTestId('p07-lookup-result')).toContainText('OPERATION_RECOVERED');
    await page.locator('#p07-lookup-by-ulid-btn').click();
    await expect(page.getByTestId('p07-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p07_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P08 Net-Need & ROP Alerts, unpaid-SO/duplicate claim guards, budget review & recovery', async ({
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

    await page.goto('/?view=p08');
    await expect(
      page.getByRole('heading', { name: 'Purchase Requests & Budget Review' })
    ).toBeVisible();

    await expect(page.getByTestId('p08-empty-profiles-notice')).toBeVisible();
    await expect(page.getByTestId('p08-gross-uncovered-val')).toHaveText('0');
    await expect(page.getByTestId('p08-low-stock-count-val')).toHaveText('0');

    // Configure supply profile (usable 10, inbound 20, rop 10, target 40 => net need 10, 1 alert)
    await page.locator('#p08-prof-variant-id').fill('71');
    await page.locator('#p08-prof-item-name').fill('Four-Person Field Tent');
    await page.locator('#p08-prof-usable').fill('10');
    await page.locator('#p08-prof-reserved').fill('0');
    await page.locator('#p08-prof-demand').fill('0');
    await page.locator('#p08-prof-inbound').fill('20');
    await page.locator('#p08-prof-rop').fill('10');
    await page.locator('#p08-prof-target').fill('40');
    await page.locator('#p08-prof-scale').selectOption('0');
    await page.locator('#p08-save-profile-btn').click();
    await expect(page.getByTestId('p08-feedback-banner')).toContainText('SUPPLY_PROFILE_CONFIGURED');
    await expect(page.getByTestId('p08-gross-uncovered-val')).toHaveText('10');
    await expect(page.getByTestId('p08-remaining-uncovered-val')).toHaveText('10');
    await expect(page.getByTestId('p08-low-stock-count-val')).toHaveText('1');

    // Intake: unpaid SO trigger blocked -> valid ROP RepF -> duplicate claim blocked -> submit
    await page.locator('#p08-tab-intake').click();
    await page.locator('#p08-repf-requester-id').fill('101');
    await page.locator('#p08-repf-source-kind').selectOption('unpaid_so');
    await page.locator('#p08-repf-qty').fill('10');
    await page.locator('#p08-repf-estimate').fill('2500.00');
    await page.locator('#p08-repf-justification').fill('Attempt unpaid SO relabel');
    await page.locator('#p08-create-repf-btn').click();
    await expect(page.getByTestId('p08-feedback-banner')).toContainText(
      'UNPAID_SO_RELABEL_FORBIDDEN'
    );

    await page.locator('#p08-repf-source-kind').selectOption('rop_replenishment');
    await page.locator('#p08-repf-justification').fill('ROP target stock replenishment');
    await page.locator('#p08-create-repf-btn').click();
    await expect(page.getByTestId('p08-feedback-banner')).toContainText('REPF_DRAFT_CREATED');
    await expect(page.getByTestId('p08-remaining-uncovered-val')).toHaveText('0');

    // Competing second RepF for 1 unit hits DUPLICATE_SUPPLY_COVERAGE
    await page.locator('#p08-repf-qty').fill('1');
    await page.locator('#p08-repf-estimate').fill('250.00');
    await page.locator('#p08-create-repf-btn').click();
    await expect(page.getByTestId('p08-feedback-banner')).toContainText('DUPLICATE_SUPPLY_COVERAGE');

    await page.locator('[data-testid^="p08-submit-repf-"]').first().click();
    await expect(page.getByTestId('p08-feedback-banner')).toContainText('REPF_SUBMITTED');

    // Budget review: self-approval rejected -> independent approval -> lookup recovery
    await page.locator('#p08-tab-budget').click();
    await page.locator('#p08-budget-reviewer-id').fill('101');
    await page.locator('#p08-budget-approved-amount').fill('2500.00');
    await page.locator('#p08-budget-approve-btn').click();
    await expect(page.getByTestId('p08-feedback-banner')).toContainText('INDEPENDENCE_REQUIRED');

    await page.locator('#p08-budget-reviewer-id').fill('202');
    await page.locator('#p08-budget-approve-btn').click();
    await expect(page.getByTestId('p08-feedback-banner')).toContainText('REPF_BUDGET_APPROVED');

    await page.locator('#p08-tab-history').click();
    await page.locator('[data-testid^="p08-ledger-fill-"]').first().click();
    await page.locator('#p08-lookup-by-key-btn').click();
    await expect(page.getByTestId('p08-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p08_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P09 Quotations comparison, quote-count threshold, PO issuance (inbound only), amendment & recovery', async ({
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

    await page.goto('/?view=p09');
    await expect(
      page.getByRole('heading', { name: 'Quotations, Supplier Selection & Purchase Orders' })
    ).toBeVisible();

    await expect(page.getByTestId('p09-empty-quotes-notice')).toBeVisible();
    await expect(page.getByTestId('p09-usable-on-hand-val')).toHaveText('0');
    await expect(page.getByTestId('p09-inbound-val')).toHaveText('0');

    // Register approved RepF source
    await page.locator('#p09-src-ref').fill('CEBU-REPF-2026-000001');
    await page.locator('#p09-src-preparer').fill('101');
    await page.locator('#p09-src-variant').fill('71');
    await page.locator('#p09-src-item-name').fill('Four-Person Field Tent');
    await page.locator('#p09-src-qty').fill('10');
    await page.locator('#p09-src-scale').selectOption('0');
    await page.locator('#p09-src-ceiling').fill('2500.00');
    await page.locator('#p09-src-min-quotes').fill('2');
    await page.locator('#p09-register-source-btn').click();
    await expect(page.getByTestId('p09-feedback-banner')).toContainText('APPROVED_REPF_REGISTERED');
    await expect(page.getByTestId('p09-uncovered-val')).toHaveText('10');

    // Record Quote 1 -> threshold guard blocks premature selection
    await page.locator('#p09-quote-supplier').fill('Mactan Gear Supply');
    await page.locator('#p09-quote-actor').fill('301');
    await page.locator('#p09-quote-unit-price').fill('240.00');
    await page.locator('#p09-quote-total-cost').fill('2400.00');
    await page.locator('#p09-quote-lead-days').fill('5');
    await page.locator('#p09-quote-warranty').fill('1 year replacement');
    await page.locator('#p09-quote-terms').fill('Net 15');
    await page.locator('#p09-record-quote-btn').click();
    await expect(page.getByTestId('p09-feedback-banner')).toContainText('QUOTATION_RECORDED');

    await page.locator('#p09-quote-rationale').fill('Best warranty within budget');
    await page.locator('[data-testid^="p09-select-quote-"]').first().click();
    await expect(page.getByTestId('p09-feedback-banner')).toContainText('QUOTATION_THRESHOLD_UNMET');

    // Record Quote 2 -> select winning quote
    await page.locator('#p09-quote-supplier').fill('Cebu Depot Co.');
    await page.locator('#p09-quote-unit-price').fill('248.00');
    await page.locator('#p09-quote-total-cost').fill('2480.00');
    await page.locator('#p09-record-quote-btn').click();
    await expect(page.getByTestId('p09-feedback-banner')).toContainText('QUOTATION_RECORDED');

    await page.locator('[data-testid^="p09-select-quote-"]').first().click();
    await expect(page.getByTestId('p09-feedback-banner')).toContainText('WINNING_QUOTATION_SELECTED');

    // Issue PO: preparer self-issue blocked -> independent approval updates inbound (not on-hand)
    await page.locator('#p09-tab-po-issue').click();
    await page.locator('#p09-po-approver').fill('101');
    await page.locator('#p09-po-location').fill('Main Stockroom');
    await page.locator('#p09-po-expected-at').fill('2026-12-03T10:00:00.000000Z');
    await page.locator('#p09-issue-po-btn').click();
    await expect(page.getByTestId('p09-feedback-banner')).toContainText('INDEPENDENCE_REQUIRED');

    await page.locator('#p09-po-approver').fill('202');
    await page.locator('#p09-issue-po-btn').click();
    await expect(page.getByTestId('p09-feedback-banner')).toContainText('PO_ISSUED');
    await expect(page.getByTestId('p09-usable-on-hand-val')).toHaveText('0');
    await expect(page.getByTestId('p09-inbound-val')).toHaveText('10');
    await expect(page.getByTestId('p09-uncovered-val')).toHaveText('0');

    // Amend PO & lookup recovery
    await page.locator('#p09-tab-amendments').click();
    await page.locator('#p09-amend-qty').fill('8');
    await page.locator('#p09-amend-reason').fill('Initial supplier partial batch 8');
    await page.locator('#p09-amend-po-btn').click();
    await expect(page.getByTestId('p09-feedback-banner')).toContainText('PO_AMENDED');
    await expect(page.getByTestId('p09-inbound-val')).toHaveText('8');
    await expect(page.getByTestId('p09-uncovered-val')).toHaveText('2');

    await page.locator('#p09-tab-history').click();
    await page.locator('[data-testid^="p09-ledger-fill-"]').first().click();
    await page.locator('#p09-lookup-by-key-btn').click();
    await expect(page.getByTestId('p09-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p09_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P10 Supplier Delivery, partial RM split, held custody clearance, claim resolution, and lookup recovery without errors', async ({
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

    await page.goto('/?view=p10');
    await expect(
      page.getByRole('heading', { name: 'Supplier Delivery, Partial Receiving & Discrepancies' })
    ).toBeVisible();

    await expect(page.getByTestId('p10-empty-pos-notice')).toBeVisible();
    await expect(page.getByTestId('p10-usable-on-hand-val')).toHaveText('0');
    await expect(page.getByTestId('p10-held-val')).toHaveText('0');
    await expect(page.getByTestId('p10-rejected-val')).toHaveText('0');
    await expect(page.getByTestId('p10-po-outstanding-val')).toHaveText('0');

    // Register open Purchase Order CEBU-PO-2026-000001 (100 units)
    await page.locator('#p10-po-ref-input').fill('CEBU-PO-2026-000001');
    await page.locator('#p10-po-supplier-input').fill('Visayas Medical Supply Co.');
    await page.locator('#p10-po-variant-input').fill('71');
    await page.locator('#p10-po-item-input').fill('Emergency Hygiene Kits');
    await page.locator('#p10-po-qty-input').fill('100');
    await page.locator('#p10-po-scale-select').selectOption('0');
    await page.locator('#p10-register-po-btn').click();
    await expect(page.getByTestId('p10-feedback-banner')).toContainText('OPEN_PO_REGISTERED');
    await expect(page.getByTestId('p10-po-outstanding-val')).toHaveText('100');

    // Verify missing Supplier DR blocks posting (MISSING_RECEIVING_SOURCE)
    await page.locator('#p10-tab-receiving').click();
    await page.locator('#p10-rm-inspector-input').fill('401');
    await page.locator('#p10-rm-variant-input').fill('71');
    await page.locator('#p10-rm-delivered-input').fill('60');
    await page.locator('#p10-rm-accepted-input').fill('40');
    await page.locator('#p10-rm-held-input').fill('10');
    await page.locator('#p10-rm-rejected-input').fill('10');
    await page.locator('#p10-rm-missing-input').fill('40');
    await page.locator('#p10-rm-timestamp-input').fill('2026-11-22T12:30:00Z');
    await page.locator('#p10-rm-notes-input').fill('40 usable, 10 held, 10 damaged, 40 backordered');
    const validSha = 'a'.repeat(64);
    await page.locator('#p10-rm-evidence-hash-input').fill(validSha);
    await page.locator('#p10-rm-discrepancy-hash-input').fill('b'.repeat(64));
    await page.locator('#p10-post-rm-btn').click();
    await expect(page.getByTestId('p10-feedback-banner')).toContainText('MISSING_RECEIVING_SOURCE');

    // Verify Supplier DR & Post Partial RM -> CEBU-RM-2026-000001
    await page.locator('label[for="p10-rm-has-dr-checkbox"]').click();
    await page.locator('#p10-rm-dr-ref-input').fill('DR-2026-8841');
    await page.locator('#p10-post-rm-btn').click();
    await expect(page.getByTestId('p10-feedback-banner')).toContainText('SUPPLIER_RM_POSTED');
    await expect(page.getByTestId('p10-receipts-table')).toContainText('CEBU-RM-2026-000001');
    await expect(page.getByTestId('p10-usable-on-hand-val')).toHaveText('40');
    await expect(page.getByTestId('p10-held-val')).toHaveText('10');
    await expect(page.getByTestId('p10-rejected-val')).toHaveText('10');
    await expect(page.getByTestId('p10-po-outstanding-val')).toHaveText('60');

    // Accept held custody once -> 50 usable, 0 held, 50 PO outstanding
    await page.locator('#p10-tab-claims').click();
    await page.locator('#p10-claim-actor-input').fill('402');
    await page.locator('#p10-claim-clearance-notes-input').fill('Seal verified intact by QA');
    await page.locator('#p10-accept-held-btn').click();
    await expect(page.getByTestId('p10-feedback-banner')).toContainText('HELD_CUSTODY_ACCEPTED');
    await expect(page.getByTestId('p10-usable-on-hand-val')).toHaveText('50');
    await expect(page.getByTestId('p10-held-val')).toHaveText('0');
    await expect(page.getByTestId('p10-po-outstanding-val')).toHaveText('50');

    // Reject second held transfer on same claim (HELD_CUSTODY_ALREADY_TRANSFERRED)
    await page.locator('#p10-claim-clearance-notes-input').fill('Attempt duplicate transfer');
    await page.locator('#p10-accept-held-btn').click();
    await expect(page.getByTestId('p10-feedback-banner')).toContainText(
      'HELD_CUSTODY_ALREADY_TRANSFERRED'
    );

    // Resolve claim formally (SUPPLIER_CLAIM_RESOLVED)
    await page.locator('#p10-claim-resolution-select').selectOption('credit_note');
    await page.locator('#p10-claim-resolution-notes-input').fill('Credit memo CM-2026-19 issued');
    await page.locator('#p10-resolve-claim-btn').click();
    await expect(page.getByTestId('p10-feedback-banner')).toContainText('SUPPLIER_CLAIM_RESOLVED');

    // Lookup committed operation recovery (OPERATION_RECOVERED)
    await page.locator('#p10-tab-history').click();
    await page.locator('[data-testid^="p10-ledger-fill-"]').first().click();
    await page.locator('#p10-lookup-key-btn').click();
    await expect(page.getByTestId('p10-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p10_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P11 Signed Partial RF Issue, material revision signature invalidation, formal remainder closure, and lookup recovery without errors', async ({
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

    await page.goto('/?view=p11');
    await expect(
      page.getByRole('heading', { name: 'Signed Material Issues & Partial Fulfillment' })
    ).toBeVisible();

    await expect(page.getByTestId('p11-empty-rfs-notice')).toBeVisible();
    await expect(page.getByTestId('p11-usable-on-hand-val')).toHaveText('0');
    await expect(page.getByTestId('p11-active-reserved-val')).toHaveText('0');
    await expect(page.getByTestId('p11-total-issued-val')).toHaveText('0');
    await expect(page.getByTestId('p11-open-rf-remaining-val')).toHaveText('0');

    // Register approved RF (10 requested, 6 reserved, 6 usable)
    await page.locator('#p11-rf-ref-input').fill('CEBU-RF-2026-000001');
    await page.locator('#p11-rf-requester-input').fill('101');
    await page.locator('#p11-rf-variant-input').fill('71');
    await page.locator('#p11-rf-item-input').fill('Field Sleeping Pad');
    await page.locator('#p11-rf-requested-input').fill('10');
    await page.locator('#p11-rf-reserved-input').fill('6');
    await page.locator('#p11-rf-usable-input').fill('6');
    await page.locator('#p11-rf-scale-select').selectOption('0');
    await page.locator('#p11-register-rf-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText('APPROVED_RF_REGISTERED');
    await expect(page.getByTestId('p11-active-reserved-val')).toHaveText('6');
    await expect(page.getByTestId('p11-open-rf-remaining-val')).toHaveText('10');

    // Switch to batches: verify exceeding active reservation is rejected
    await page.locator('#p11-tab-batches').click();
    await page.locator('#p11-batch-preparer-input').fill('301');
    await page.locator('#p11-batch-qty-input').fill('7');
    await page.locator('#p11-batch-recipient-id-input').fill('102');
    await page.locator('#p11-batch-recipient-name-input').fill('Maria Santos');
    await page.locator('#p11-batch-recipient-cap-input').fill('Relief Team Lead');
    await page.locator('#p11-prepare-batch-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText(
      'EXCEEDS_ACTIVE_RESERVATION'
    );

    // Prepare Batch 1 (4 units) -> CEBU-ISAR-2026-000001
    await page.locator('#p11-batch-qty-input').fill('4');
    await page.locator('#p11-prepare-batch-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText('ISSUE_BATCH_PREPARED');
    await expect(page.getByTestId('p11-batches-list')).toContainText('CEBU-ISAR-2026-000001');

    // Verify missing recipient ack rejected, then check ack, bind & post Batch 1
    await page.locator('#p11-ev-issuer-input').fill('301');
    await page.locator('#p11-ev-recipient-input').fill('102');
    await page.locator('#p11-ev-sig-hash-input').fill('c'.repeat(64));
    await page.locator('#p11-ev-photo-hash-input').fill('d'.repeat(64));
    await page.locator('#p11-ev-signed-at-input').fill('2026-11-22T12:40:00Z');
    await page.locator('#p11-load-current-hash-btn').click();
    await page.locator('#p11-bind-evidence-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText(
      'MISSING_RECIPIENT_ACKNOWLEDGMENT'
    );

    await page.locator('label[for="p11-ev-ack-checkbox"]').click();
    await page.locator('#p11-bind-evidence-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText('ISSUE_EVIDENCE_BOUND');

    await page.locator('#p11-post-batch-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText('ISSUE_BATCH_POSTED');
    await expect(page.getByTestId('p11-usable-on-hand-val')).toHaveText('2');
    await expect(page.getByTestId('p11-active-reserved-val')).toHaveText('2');
    await expect(page.getByTestId('p11-total-issued-val')).toHaveText('4');
    await expect(page.getByTestId('p11-open-rf-remaining-val')).toHaveText('6');

    // Prepare Batch 2 (2 units), bind, revise materially -> stale digest rejected -> re-load & post
    await page.locator('#p11-batch-qty-input').fill('2');
    await page.locator('#p11-prepare-batch-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText('ISSUE_BATCH_PREPARED');
    await page.locator('#p11-load-current-hash-btn').click();
    await page.locator('#p11-bind-evidence-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText('ISSUE_EVIDENCE_BOUND');

    // Revise Batch 2 recipient capacity -> prior signature invalidated
    await page.locator('#p11-batch-qty-input').fill('2');
    await page.locator('#p11-batch-recipient-cap-input').fill('Lead Coordinator');
    await page.locator('#p11-revise-batch-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText('ISSUE_BATCH_REVISED');

    await page.locator('#p11-post-batch-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText(
      'STALE_BATCH_EVIDENCE_MISMATCH'
    );

    await page.locator('label[for="p11-ev-ack-checkbox"]').click();
    await page.locator('#p11-bind-evidence-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText(
      'STALE_BATCH_EVIDENCE_MISMATCH'
    );

    await page.locator('#p11-load-current-hash-btn').click();
    await page.locator('#p11-post-batch-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText('MISSING_ISSUANCE_EVIDENCE');

    await page.locator('#p11-bind-evidence-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText('ISSUE_EVIDENCE_BOUND');
    await page.locator('#p11-post-batch-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText('ISSUE_BATCH_POSTED');
    await expect(page.getByTestId('p11-usable-on-hand-val')).toHaveText('0');
    await expect(page.getByTestId('p11-active-reserved-val')).toHaveText('0');
    await expect(page.getByTestId('p11-total-issued-val')).toHaveText('6');
    await expect(page.getByTestId('p11-open-rf-remaining-val')).toHaveText('4');

    // Formally cancel remaining 4 units while keeping 6 issued intact
    await page.locator('#p11-tab-closure').click();
    await page.locator('#p11-cancel-actor-input').fill('201');
    await page.locator('#p11-cancel-reason-input').fill('Event concluded; remaining 4 unneeded');
    await page.locator('#p11-cancel-remainder-btn').click();
    await expect(page.getByTestId('p11-feedback-banner')).toContainText('RF_REMAINDER_CANCELED');
    await expect(page.getByTestId('p11-open-rf-remaining-val')).toHaveText('0');
    await expect(page.getByTestId('p11-total-issued-val')).toHaveText('6');
    await expect(page.getByTestId('p11-closure-list')).toContainText(
      'Partially Fulfilled & Remainder Canceled'
    );

    // Lookup recovery
    await page.locator('#p11-tab-history').click();
    await page.locator('[data-testid^="p11-ledger-fill-"]').first().click();
    await page.locator('#p11-lookup-key-btn').click();
    await expect(page.getByTestId('p11-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p11_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P12 Sales Order Review, Unsaved Draft Preservation, Stock Split, Buyer Acceptance & Billing-Only SI', async ({
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

    await page.goto('/?view=p12');
    await expect(
      page.getByRole('heading', { name: 'Sales Orders, Buyer Acceptance & Invoicing' })
    ).toBeVisible();

    await expect(page.getByTestId('p12-empty-pools-notice')).toBeVisible();
    await expect(page.getByTestId('p12-empty-orders-notice')).toBeVisible();
    await expect(page.getByTestId('p12-usable-on-hand-val')).toHaveText('0');
    await expect(page.getByTestId('p12-so-reserved-val')).toHaveText('0');
    await expect(page.getByTestId('p12-available-val')).toHaveText('0');
    await expect(page.getByTestId('p12-backorders-val')).toHaveText('0');

    // Configure stock pool (10 usable, 6 RF reserved -> 4 available)
    await page.locator('#p12-pool-variant-id').fill('71');
    await page.locator('#p12-pool-item-name').fill('Four-Person Field Tent');
    await page.locator('#p12-pool-usable').fill('10');
    await page.locator('#p12-pool-rf-reserved').fill('6');
    await page.locator('#p12-pool-unit-price').fill('250.00');
    await page.locator('#p12-pool-max-discount').fill('50.00');
    await page.locator('#p12-pool-scale').selectOption('0');
    await page.locator('#p12-configure-pool-btn').click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('SALE_STOCK_POOL_CONFIGURED');
    await expect(page.getByTestId('p12-usable-on-hand-val')).toHaveText('10');
    await expect(page.getByTestId('p12-available-val')).toHaveText('4');

    // Enter draft & verify unsaved edit preservation across tab switch
    await page.locator('#p12-so-officer-id').fill('101');
    await page.locator('#p12-so-variant-id').fill('71');
    await page.locator('#p12-so-buyer-name').fill('Maria Santos');
    await page.locator('#p12-so-buyer-contact').fill('09171234567');
    await page.locator('#p12-so-qty').fill('7');
    await page.locator('#p12-so-scale').selectOption('0');
    await page.locator('#p12-so-unit-price').fill('250.00');
    await page.locator('#p12-so-discount').fill('100.00');
    await page.locator('#p12-so-requested-at').fill('2026-11-01T08:00:00Z');
    await page.locator('#p12-so-terms').fill('50% deposit on backorder');

    await page.locator('#p12-tab-review').click();
    await expect(page.getByTestId('p12-unsaved-draft-pill')).toBeVisible();
    await page.locator('#p12-tab-intake').click();
    await expect(page.locator('#p12-so-buyer-name')).toHaveValue('Maria Santos');
    await expect(page.locator('#p12-so-qty')).toHaveValue('7');

    // Create draft & submit -> CEBU-SO-2026-000001
    await page.locator('#p12-create-draft-btn').click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('SO_DRAFT_CREATED');
    await page.locator('[data-testid^="p12-submit-so-"]').first().click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('SO_SUBMITTED');
    await expect(page.getByTestId('p12-orders-list')).toContainText('CEBU-SO-2026-000001');

    // Review tab: self-approval rejected -> excess discount rejected -> return -> revise -> resubmit -> approve
    await page.locator('#p12-tab-review').click();
    await page.locator('#p12-review-actor-id').fill('101');
    await page.locator('#p12-approve-so-btn').click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('INDEPENDENCE_REQUIRED');

    await page.locator('#p12-review-actor-id').fill('202');
    await page.locator('#p12-approve-so-btn').click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('UNAPPROVED_DISCOUNT_EXCEEDS_LIMIT');

    await page.locator('#p12-review-reason').fill('Reduce discount within approved PHP 50 cap');
    await page.locator('#p12-return-so-btn').click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('SO_RETURNED');

    await page.locator('#p12-revise-discount').fill('50.00');
    await page.locator('#p12-review-reason').fill('Adjusted discount to PHP 50.00');
    await page.locator('#p12-revise-so-btn').click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('SO_REVISED_TO_DRAFT');

    await page.locator('#p12-resubmit-so-btn').click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('SO_SUBMITTED');

    await page.locator('#p12-approve-so-btn').click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('SO_APPROVED');

    // Commit stock split (4 reserved available, 3 backorder; usable on-hand stays 10)
    await page.locator('#p12-split-actor-id').fill('301');
    await page.locator('#p12-split-at').fill('2026-11-01T09:00:00Z');
    await page.locator('#p12-commit-split-btn').click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('SO_STOCK_SPLIT_COMMITTED');
    await expect(page.getByTestId('p12-usable-on-hand-val')).toHaveText('10');
    await expect(page.getByTestId('p12-so-reserved-val')).toHaveText('4');
    await expect(page.getByTestId('p12-available-val')).toHaveText('0');
    await expect(page.getByTestId('p12-split-ledger')).toContainText('Awaiting Acceptance');

    // Buyer Acceptance & Full-Order SI
    await page.locator('#p12-tab-acceptance').click();
    await page.locator('#p12-acc-actor-id').fill('101');
    await page.locator('#p12-acc-decision').selectOption('accept_all');
    await page.locator('#p12-acc-channel').fill('Phone Call');
    await page.locator('#p12-acc-recorded-at').fill('2026-11-01T11:00:00Z');
    await page.locator('#p12-acc-outcome').fill('Buyer confirmed 4 ready and 3 backorder');
    await page.locator('#p12-record-acceptance-btn').click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('BUYER_ACCEPTANCE_RECORDED');
    await expect(page.getByTestId('p12-backorders-val')).toHaveText('3');

    await page.locator('#p12-si-actor-id').fill('401');
    await page.locator('#p12-si-issued-at').fill('2026-11-01T11:05:00Z');
    await page.locator('#p12-issue-si-btn').click();
    await expect(page.getByTestId('p12-feedback-banner')).toContainText('SI_ISSUED');
    await expect(page.getByTestId('p12-invoices-table')).toContainText('CEBU-SI-2026-000001');
    await expect(page.getByTestId('p12-invoices-table')).toContainText('None (Billing Only)');

    // Recovery lookup
    await page.locator('#p12-tab-history').click();
    await page.locator('[data-testid^="p12-ledger-fill-"]').first().click();
    await page.locator('#p12-lookup-by-key-btn').click();
    await expect(page.getByTestId('p12-lookup-result')).toContainText('OPERATION_RECOVERED');
    await page.locator('#p12-lookup-by-ulid-btn').click();
    await expect(page.getByTestId('p12-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p12_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P13 Payment Verification, Screenshot/Duplicate Guards, 400+600 OR Installments, Line Credit & Reconciliation', async ({
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

    await page.goto('/?view=p13');
    await expect(
      page.getByRole('heading', {
        name: 'Payment Verification, Official Receipts & Line Credit',
      })
    ).toBeVisible();

    await expect(page.getByTestId('p13-empty-accounts-notice')).toBeVisible();
    await expect(page.getByTestId('p13-empty-orders-notice')).toBeVisible();
    await expect(page.getByTestId('p13-verified-credit-val')).toHaveText('0.00');

    // Reject unapproved personal wallet channel
    await page.locator('#p13-acc-channel').selectOption('personal_unapproved');
    await page.locator('#p13-acc-code').fill('GCASH-PERSONAL');
    await page.locator('#p13-acc-label').fill('Personal Account');
    await page.locator('#p13-acc-finance-id').fill('201');
    await page.locator('#p13-register-account-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('UNAPPROVED_PAYMENT_CHANNEL');

    // Register official GCash + Cash Desk accounts + Billable SO (PHP 1000.00 due)
    await page.locator('#p13-acc-channel').selectOption('official_gcash');
    await page.locator('#p13-acc-code').fill('GCASH-CEBU-01');
    await page.locator('#p13-acc-label').fill('YSP Official GCash');
    await page.locator('#p13-register-account-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('OFFICIAL_ACCOUNT_REGISTERED');

    await page.locator('#p13-acc-channel').selectOption('cash');
    await page.locator('#p13-acc-code').fill('CASH-CEBU-DESK');
    await page.locator('#p13-acc-label').fill('Chapter Cash Desk');
    await page.locator('#p13-register-account-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('OFFICIAL_ACCOUNT_REGISTERED');

    await page.locator('#p13-bill-so-ref').fill('CEBU-SO-2026-000001');
    await page.locator('#p13-bill-si-ref').fill('CEBU-SI-2026-000001');
    await page.locator('#p13-bill-buyer').fill('Maria Santos');
    await page.locator('#p13-bill-total').fill('1000.00');
    await page.locator('#p13-bill-avail-val').fill('600.00');
    await page.locator('#p13-bill-backorder-cost').fill('400.00');
    await page.locator('#p13-register-bill-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('BILLABLE_SO_REGISTERED');

    // Tab 2: Submit screenshot-only PHP 400.00 -> duplicate blocked -> screenshot-alone OR blocked -> confirm credit & issue OR #1
    await page.locator('#p13-tab-verify').click();
    await page.locator('#p13-pay-payer').fill('Maria Santos');
    await page.locator('#p13-pay-collector').fill('101');
    await page.locator('#p13-pay-channel').selectOption('official_gcash');
    await page.locator('#p13-pay-account').fill('GCASH-CEBU-01');
    await page.locator('#p13-pay-ext-ref').fill('GC-771201');
    await page.locator('#p13-pay-amount').fill('400.00');
    await page.locator('#p13-pay-ev-kind').selectOption('screenshot_only');
    await page.locator('#p13-pay-received-at').fill('2026-11-02T09:00:00Z');
    await page.locator('#p13-submit-payment-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('PAYMENT_EVIDENCE_STAGED');

    await page.locator('#p13-pay-ext-ref').fill('GC-771201');
    await page.locator('#p13-pay-amount').fill('400.00');
    await page.locator('#p13-submit-payment-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('DUPLICATE_PAYMENT_REFERENCE');

    await page.locator('#p13-ver-verifier-id').fill('202');
    await page.locator('#p13-ver-at').fill('2026-11-02T09:05:00Z');
    await page.locator('#p13-verify-or-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('SCREENSHOT_ALONE_INSUFFICIENT');

    await page.locator('label[for="p13-ver-confirmed-checkbox"]').click();
    await page.locator('#p13-verify-or-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('OR_ISSUED');
    await expect(page.getByTestId('p13-verified-credit-val')).toHaveText('400.00');

    // Submit distinct PHP 600.00 cash installment -> issue Full Settlement OR #2 (total 1000.00)
    await page.locator('#p13-pay-channel').selectOption('cash');
    await page.locator('#p13-pay-account').fill('CASH-CEBU-DESK');
    await page.locator('#p13-pay-ext-ref').fill('CASH-RCP-0902');
    await page.locator('#p13-pay-amount').fill('600.00');
    await page.locator('#p13-pay-ev-kind').selectOption('physical_cash_counted');
    await page.locator('#p13-submit-payment-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('PAYMENT_EVIDENCE_STAGED');

    await page.locator('#p13-verify-or-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('OR_ISSUED');
    await expect(page.getByTestId('p13-verified-credit-val')).toHaveText('1000.00');

    // Tab 3: Allocate credit & reconcile independently
    await page.locator('#p13-tab-allocate').click();
    await page.locator('#p13-alloc-finance-id').fill('201');
    await page.locator('#p13-alloc-at').fill('2026-11-02T14:12:00Z');
    await page.locator('#p13-alloc-coverage').fill('600.00');
    await page.locator('#p13-alloc-funding').fill('400.00');
    await page.locator('#p13-allocate-credit-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('CREDIT_ALLOCATED');
    await expect(page.getByTestId('p13-verified-credit-val')).toHaveText('1000.00');
    await expect(page.getByTestId('p13-release-coverage-val')).toHaveText('600.00');
    await expect(page.getByTestId('p13-procurement-funding-val')).toHaveText('400.00');

    // Verifier 202 blocked from self-reconciling -> 203 succeeds
    await page.locator('#p13-rec-actor-id').fill('202');
    await page.locator('#p13-rec-at').fill('2026-11-02T16:00:00Z');
    await page.locator('#p13-reconcile-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('INDEPENDENCE_REQUIRED');

    await page.locator('#p13-rec-actor-id').fill('203');
    await page.locator('#p13-reconcile-btn').click();
    await expect(page.getByTestId('p13-feedback-banner')).toContainText('FINANCE_RECONCILED');
    await expect(page.getByTestId('p13-or-table')).toContainText('CEBU-OR-2026-000001');
    await expect(page.getByTestId('p13-or-table')).toContainText('CEBU-OR-2026-000002');

    // Lookup recovery
    await page.locator('#p13-tab-history').click();
    await page.locator('[data-testid^="p13-ledger-fill-"]').first().click();
    await page.locator('#p13-lookup-by-key-btn').click();
    await expect(page.getByTestId('p13-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p13_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P14 Two 48h Clocks, Scoped Backorder Funding, Funded RepF Gate & Late-Payment Resolution', async ({
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

    await page.goto('/?view=p14');
    await expect(
      page.getByRole('heading', {
        name: 'Two 48h Clocks, Funded Procurement & Late Money',
      })
    ).toBeVisible();

    await expect(page.getByTestId('p14-empty-orders-notice')).toBeVisible();
    await expect(page.getByTestId('p14-usable-on-hand-val')).toHaveText('0');

    // Register Dual-Clock Order: usable 10, rf 4, unpaid SO 3, paid SO 2, accepted backorder 5 (1 avail)
    await page.locator('#p14-reg-so-ref').fill('CEBU-SO-2026-000001');
    await page.locator('#p14-reg-variant-id').fill('71');
    await page.locator('#p14-reg-item-name').fill('Four-Person Field Tent');
    await page.locator('#p14-reg-scale').selectOption('0');
    await page.locator('#p14-reg-usable').fill('10');
    await page.locator('#p14-reg-rf').fill('4');
    await page.locator('#p14-reg-unpaid-so').fill('3');
    await page.locator('#p14-reg-paid-so').fill('2');
    await page.locator('#p14-reg-backorder').fill('5');
    await page.locator('#p14-reg-sale-amt').fill('1000.00');
    await page.locator('#p14-reg-proc-cost').fill('400.00');
    await page.locator('#p14-reg-created-at').fill('2026-11-01T08:00:00Z');
    await page.locator('#p14-reg-accepted-at').fill('2026-11-01T10:00:00Z');
    await page.locator('label[for="p14-reg-cost-approved"]').click();
    await page.locator('#p14-register-order-btn').click();
    await expect(page.getByTestId('p14-feedback-banner')).toContainText('DUAL_CLOCK_ORDER_REGISTERED');
    await expect(page.getByTestId('p14-usable-on-hand-val')).toHaveText('10');
    await expect(page.getByTestId('p14-unpaid-so-val')).toHaveText('3');
    await expect(page.getByTestId('p14-paid-so-val')).toHaveText('2');
    await expect(page.getByTestId('p14-available-val')).toHaveText('1');

    // Tab 2: Screenshot & Backdating rejected -> valid backorder deposit protects backorder only
    await page.locator('#p14-tab-funding').click();
    await page.locator('#p14-fund-scope').selectOption('backorder_deposit');
    await page.locator('#p14-fund-evidence').selectOption('pending_screenshot');
    await page.locator('#p14-fund-amount').fill('400.00');
    await page.locator('#p14-fund-actor').fill('202');
    await page.locator('#p14-fund-verified-at').fill('2026-11-01T12:00:00Z');
    await page.locator('#p14-record-funding-btn').click();
    await expect(page.getByTestId('p14-feedback-banner')).toContainText(
      'UNVERIFIED_PAYMENT_CANNOT_PROTECT'
    );

    await page.locator('#p14-fund-evidence').selectOption('verified_or');
    await page.locator('#p14-fund-or-ref').fill('CEBU-OR-2026-000001');
    await page.locator('#p14-record-funding-btn').click();
    await expect(page.getByTestId('p14-feedback-banner')).toContainText('SCOPED_FUNDING_RECORDED');
    await expect(page.getByTestId('p14-funded-backorder-val')).toHaveText('5');
    await expect(page.getByTestId('p14-unpaid-so-val')).toHaveText('3');

    // Tab 3: Evaluate Clock 1 expiry -> only unpaid 3 expire (available becomes 4, usable stays 10, funded stays 5)
    await page.locator('#p14-tab-expiry').click();
    await page.locator('#p14-eval-actor').fill('301');
    await page.locator('#p14-eval-time').fill('2026-11-03T08:00:00Z');
    await page.locator('#p14-evaluate-clocks-btn').click();
    await expect(page.getByTestId('p14-feedback-banner')).toContainText('CLOCKS_EVALUATED');
    await expect(page.getByTestId('p14-usable-on-hand-val')).toHaveText('10');
    await expect(page.getByTestId('p14-unpaid-so-val')).toHaveText('0');
    await expect(page.getByTestId('p14-paid-so-val')).toHaveText('2');
    await expect(page.getByTestId('p14-funded-backorder-val')).toHaveText('5');
    await expect(page.getByTestId('p14-available-val')).toHaveText('4');

    // Another officer consumes 4 available units -> late payment routes to Finance refund without over-allocating
    await page.locator('#p14-consume-qty').fill('4');
    await page.locator('#p14-consume-elsewhere-btn').click();
    await expect(page.getByTestId('p14-available-val')).toHaveText('0');

    await page.locator('#p14-late-or-ref').fill('CEBU-OR-2026-000009');
    await page.locator('#p14-late-qty').fill('2');
    await page.locator('#p14-late-at').fill('2026-11-03T09:00:00Z');
    await page.locator('#p14-late-fallback').selectOption('route_to_finance_refund');
    await page.locator('#p14-resolve-late-btn').click();
    await expect(page.getByTestId('p14-feedback-banner')).toContainText('LATE_PAYMENT_RESOLVED');
    await expect(page.getByTestId('p14-late-list')).toContainText('route_to_finance_refund');

    // Tab 2: Unpaid SO relabel blocked -> Funded RepF forward succeeds
    await page.locator('#p14-tab-funding').click();
    await page.locator('#p14-repf-actor').fill('202');
    await page.locator('#p14-repf-at').fill('2026-11-03T09:10:00Z');
    await page.locator('label[for="p14-repf-relabel-checkbox"]').click();
    await page.locator('#p14-forward-repf-btn').click();
    await expect(page.getByTestId('p14-feedback-banner')).toContainText(
      'UNPAID_SO_RELABEL_FORBIDDEN'
    );

    await page.locator('label[for="p14-repf-relabel-checkbox"]').click();
    await page.locator('#p14-forward-repf-btn').click();
    await expect(page.getByTestId('p14-feedback-banner')).toContainText('REPF_FUNDED_FORWARDED');
    await expect(page.getByTestId('p14-repf-list')).toContainText('CEBU-REPF-SO-2026-000001');

    // Recovery lookup
    await page.locator('#p14-tab-history').click();
    await page.locator('[data-testid^="p14-ledger-fill-"]').first().click();
    await page.locator('#p14-lookup-by-key-btn').click();
    await expect(page.getByTestId('p14-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p14_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P15 Covered Customer Releases, SI-Only/Deposit Blocks, Revision Signature Invalidation & Repeated Partials', async ({
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

    await page.goto('/?view=p15');
    await expect(
      page.getByRole('heading', { name: 'Covered Customer Releases & Repeated Partials' })
    ).toBeVisible();

    await expect(page.getByTestId('p15-empty-orders-notice')).toBeVisible();
    await expect(page.getByTestId('p15-usable-on-hand-val')).toHaveText('0');
    await expect(page.getByTestId('p15-remaining-coverage-val')).toHaveText('0.00');

    // Register SI-only order (no OR) -> verify release preparation blocked
    await page.locator('#p15-ord-so-ref').fill('CEBU-SO-2026-000001');
    await page.locator('#p15-ord-si-ref').fill('CEBU-SI-2026-000001');
    await page.locator('#p15-ord-variant-id').fill('71');
    await page.locator('#p15-ord-item-name').fill('Field Tent');
    await page.locator('#p15-ord-scale').selectOption('0');
    await page.locator('#p15-ord-price').fill('250.00');
    await page.locator('#p15-ord-accepted').fill('4');
    await page.locator('#p15-ord-reserved').fill('4');
    await page.locator('#p15-ord-usable').fill('4');
    await page.locator('#p15-ord-rop').fill('2');
    await page.locator('#p15-ord-coverage').fill('0.00');
    await page.locator('#p15-ord-deposit').fill('0.00');
    await page.locator('#p15-register-order-btn').click();
    await expect(page.getByTestId('p15-feedback-banner')).toContainText('RELEASABLE_ORDER_REGISTERED');

    await page.locator('#p15-tab-batches').click();
    await page.locator('#p15-batch-preparer').fill('301');
    await page.locator('#p15-batch-qty').fill('2');
    await page.locator('#p15-batch-rec-name').fill('Maria Santos');
    await page.locator('#p15-batch-rec-id').fill('9001');
    await page.locator('#p15-prepare-batch-btn').click();
    await expect(page.getByTestId('p15-feedback-banner')).toContainText(
      'SI_OR_SCREENSHOT_ALONE_CANNOT_RELEASE'
    );

    // Register verified covered order (6 units at PHP 250 = 1500.00, 4 reserved initially, 400 deposit preserved)
    await page.locator('#p15-tab-orders').click();
    await page.locator('#p15-ord-so-ref').fill('CEBU-SO-2026-000002');
    await page.locator('#p15-ord-si-ref').fill('CEBU-SI-2026-000002');
    await page.locator('#p15-ord-or-ref').fill('CEBU-OR-2026-000005');
    await page.locator('label[for="p15-ord-has-or"]').click();
    await page.locator('#p15-ord-accepted').fill('6');
    await page.locator('#p15-ord-reserved').fill('4');
    await page.locator('#p15-ord-usable').fill('4');
    await page.locator('#p15-ord-rop').fill('2');
    await page.locator('#p15-ord-coverage').fill('1500.00');
    await page.locator('#p15-ord-deposit').fill('400.00');
    await page.locator('#p15-register-order-btn').click();
    await expect(page.getByTestId('p15-feedback-banner')).toContainText('RELEASABLE_ORDER_REGISTERED');

    // Prepare Batch 1 (2 units -> CEBU-CDR-2026-000001), bind signature, then revise recipient -> old hash stale
    await page.locator('#p15-tab-batches').click();
    await page.locator('#p15-batch-qty').fill('2');
    await page.locator('#p15-prepare-batch-btn').click();
    await expect(page.getByTestId('p15-feedback-banner')).toContainText('CUSTOMER_DR_PREPARED');

    await page.locator('#p15-ev-signed-at').fill('2026-11-04T09:00:00Z');
    await page.locator('#p15-ev-officer').fill('301');
    await page.locator('#p15-ev-recipient').fill('9001');
    await page.locator('#p15-ev-hash').fill('a'.repeat(64));
    await page.locator('#p15-load-current-hash-btn').click();
    await page.locator('label[for="p15-ev-ack-checkbox"]').click();
    await page.locator('#p15-bind-evidence-btn').click();
    await expect(page.getByTestId('p15-feedback-banner')).toContainText('CUSTOMER_DR_EVIDENCE_BOUND');

    // Revise recipient -> signature invalidated -> stale post rejected -> reload digest, re-bind, post
    await page.locator('#p15-batch-qty').fill('2');
    await page.locator('#p15-batch-rec-name').fill('Maria Santos Rep');
    await page.locator('#p15-batch-rec-id').fill('9002');
    await page.locator('#p15-revise-batch-btn').click();
    await expect(page.getByTestId('p15-feedback-banner')).toContainText('CUSTOMER_DR_REVISED');

    await page.locator('#p15-post-release-btn').click();
    await expect(page.getByTestId('p15-feedback-banner')).toContainText(
      'STALE_BATCH_EVIDENCE_MISMATCH'
    );

    await page.locator('#p15-load-current-hash-btn').click();
    await page.locator('#p15-ev-recipient').fill('9002');
    await page.locator('label[for="p15-ev-ack-checkbox"]').click();
    await page.locator('#p15-bind-evidence-btn').click();
    await expect(page.getByTestId('p15-feedback-banner')).toContainText('CUSTOMER_DR_EVIDENCE_BOUND');

    await page.locator('#p15-post-release-btn').click();
    await expect(page.getByTestId('p15-feedback-banner')).toContainText('CUSTOMER_RELEASE_POSTED');
    await expect(page.getByTestId('p15-total-released-val')).toHaveText('2');
    await expect(page.getByTestId('p15-remaining-coverage-val')).toHaveText('1000.00');

    // Verify coverage table & recovery
    await page.locator('#p15-tab-coverage').click();
    await expect(page.getByTestId('p15-batches-table')).toContainText('CEBU-CDR-2026-000001');
    await expect(page.getByTestId('p15-batches-table')).toContainText('500.00');

    await page.locator('#p15-tab-history').click();
    await page.locator('[data-testid^="p15-ledger-fill-"]').first().click();
    await page.locator('#p15-lookup-by-key-btn').click();
    await expect(page.getByTestId('p15-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p15_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P16 Donation Receiving, Non-Cash Invariant, Same-SKU Restriction Segregation & Resolution', async ({
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

    await page.goto('/?view=p16');
    await expect(
      page.getByRole('heading', {
        name: 'In-Kind Donations & Bounded Donor Restrictions',
      })
    ).toBeVisible();

    await expect(page.getByTestId('p16-empty-da-notice')).toBeVisible();
    await expect(page.getByTestId('p16-usable-on-hand-val')).toHaveText('0');
    await expect(page.getByTestId('p16-cash-or-count-val')).toHaveText('0');

    // Acknowledge distribution_only DA -> creates 0 cash ORs
    await page.locator('#p16-da-donor').fill('Cebu Relief Foundation');
    await page.locator('#p16-da-officer').fill('101');
    await page.locator('#p16-da-variant').fill('71');
    await page.locator('#p16-da-item').fill('Four-Person Field Tent');
    await page.locator('#p16-da-qty').fill('10');
    await page.locator('#p16-da-scale').selectOption('0');
    await page.locator('#p16-da-val').fill('250.00');
    await page.locator('#p16-da-basis').fill('Sponsor invoice');
    await page.locator('#p16-da-mode').selectOption('distribution_only');
    await page.locator('#p16-da-at').fill('2026-11-05T08:00:00Z');
    await page.locator('#p16-da-condition').fill('Relief distribution only');
    await page.locator('#p16-ack-da-btn').click();
    await expect(page.getByTestId('p16-feedback-banner')).toContainText('DA_ACKNOWLEDGED');
    await expect(page.getByTestId('p16-cash-or-count-val')).toHaveText('0');

    // Tab 2: Post DA RM (8 accepted, 2 rejected) + Register same-SKU PO commercial lot (5 saleable)
    await page.locator('#p16-tab-lots').click();
    await page.locator('#p16-rm-inspector').fill('301');
    await page.locator('#p16-rm-at').fill('2026-11-05T08:30:00Z');
    await page.locator('#p16-rm-accepted').fill('8');
    await page.locator('#p16-rm-rejected').fill('2');
    await page.locator('#p16-post-da-rm-btn').click();
    await expect(page.getByTestId('p16-feedback-banner')).toContainText('DA_RM_POSTED');
    await expect(page.getByTestId('p16-restricted-val')).toHaveText('8');

    await page.locator('#p16-po-ref').fill('CEBU-PO-2026-000001');
    await page.locator('#p16-po-rm-ref').fill('CEBU-RM-2026-000001');
    await page.locator('#p16-po-variant').fill('71');
    await page.locator('#p16-po-qty').fill('5');
    await page.locator('#p16-po-item').fill('Four-Person Field Tent');
    await page.locator('#p16-register-po-lot-btn').click();
    await expect(page.getByTestId('p16-feedback-banner')).toContainText('COMMERCIAL_LOT_REGISTERED');
    await expect(page.getByTestId('p16-saleable-val')).toHaveText('5');

    // Select DA lot for allocation test -> Sale blocked -> Ordinary override blocked -> Internal RF succeeds
    await page.locator('[data-testid^="p16-select-lot-"]').first().click();
    await page.locator('#p16-alloc-kind').selectOption('track1_sale');
    await page.locator('#p16-alloc-ref').fill('CEBU-SO-2026-000010');
    await page.locator('#p16-alloc-qty').fill('3');
    await page.locator('#p16-alloc-actor').fill('301');
    await page.locator('#p16-alloc-at').fill('2026-11-05T09:00:00Z');
    await page.locator('#p16-allocate-lot-btn').click();
    await expect(page.getByTestId('p16-feedback-banner')).toContainText(
      'DISTRIBUTION_ONLY_SALE_FORBIDDEN'
    );

    await page.locator('label[for="p16-alloc-override"]').click();
    await page.locator('#p16-allocate-lot-btn').click();
    await expect(page.getByTestId('p16-feedback-banner')).toContainText(
      'ORDINARY_OVERRIDE_FORBIDDEN'
    );

    await page.locator('label[for="p16-alloc-override"]').click();
    await page.locator('#p16-alloc-kind').selectOption('internal_rf');
    await page.locator('#p16-alloc-ref').fill('CEBU-RF-2026-000003');
    await page.locator('#p16-allocate-lot-btn').click();
    await expect(page.getByTestId('p16-feedback-banner')).toContainText('LOT_ALLOCATED');
    await expect(page.getByTestId('p16-restricted-val')).toHaveText('5');

    // Lookup recovery
    await page.locator('#p16-tab-history').click();
    await page.locator('[data-testid^="p16-ledger-fill-"]').first().click();
    await page.locator('#p16-lookup-by-key-btn').click();
    await expect(page.getByTestId('p16-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p16_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P17 Count Variance ADJ, Direct Edit Lock, Recount & GOV-06 Preparer/Custodian/Dual-Slot Bar', async ({
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

    await page.goto('/?view=p17');
    await expect(
      page.getByRole('heading', {
        name: 'Independent Counts & Stock-Variance Adjustments',
      })
    ).toBeVisible();

    await expect(page.getByTestId('p17-empty-positions-notice')).toBeVisible();
    await expect(page.getByTestId('p17-usable-on-hand-val')).toHaveText('0');

    // Register locked position (10 usable, custodian 105) + attempt direct edit
    await page.locator('#p17-pos-variant').fill('71');
    await page.locator('#p17-pos-item').fill('Four-Person Field Tent');
    await page.locator('#p17-pos-loc').fill('LOC-MAIN');
    await page.locator('#p17-pos-custodian').fill('105');
    await page.locator('#p17-pos-usable').fill('10');
    await page.locator('#p17-pos-quar').fill('0');
    await page.locator('#p17-pos-scale').selectOption('0');
    await page.locator('#p17-register-pos-btn').click();
    await expect(page.getByTestId('p17-feedback-banner')).toContainText(
      'LOCKED_BASELINE_POSITION_REGISTERED'
    );
    await expect(page.getByTestId('p17-usable-on-hand-val')).toHaveText('10');

    await page.locator('#p17-direct-edit-val').fill('12');
    await page.locator('#p17-direct-edit-btn').click();
    await expect(page.getByTestId('p17-feedback-banner')).toContainText(
      'DIRECT_BALANCE_EDIT_FORBIDDEN'
    );

    // Tab 2: Initiate positive gain +2 (no balance change yet) + independent recount by 302
    await page.locator('#p17-tab-recount').click();
    await page.locator('#p17-adj-preparer').fill('101');
    await page.locator('#p17-adj-kind').selectOption('positive_gain_discovery');
    await page.locator('#p17-adj-qty').fill('2');
    await page.locator('#p17-adj-at').fill('2026-11-06T08:00:00Z');
    await page.locator('#p17-adj-hash').fill('a'.repeat(64));
    await page.locator('#p17-adj-reason').fill('Found sealed carton post-cutoff');
    await page.locator('#p17-initiate-adj-btn').click();
    await expect(page.getByTestId('p17-feedback-banner')).toContainText('VARIANCE_ADJ_INITIATED');
    await expect(page.getByTestId('p17-usable-on-hand-val')).toHaveText('10');

    await page.locator('#p17-rec-actor').fill('302');
    await page.locator('#p17-rec-qty').fill('2');
    await page.locator('#p17-rec-notes').fill('Verified 2 intact tents');
    await page.locator('#p17-rec-at').fill('2026-11-06T08:30:00Z');
    await page.locator('#p17-record-recount-btn').click();
    await expect(page.getByTestId('p17-feedback-banner')).toContainText(
      'INDEPENDENT_RECOUNT_RECORDED'
    );

    // Tab 3: Preparer & Custodian barred -> Head 201 approved -> same 201 barred from Finance -> Fallback 203 succeeds -> Post once (usable 12)
    await page.locator('#p17-tab-approvals').click();
    await page.locator('#p17-app-slot').selectOption('chapter_head_slot');
    await page.locator('#p17-app-actor').fill('101');
    await page.locator('#p17-app-at').fill('2026-11-06T08:40:00Z');
    await page.locator('#p17-approve-slot-btn').click();
    await expect(page.getByTestId('p17-feedback-banner')).toContainText(
      'PREPARER_OR_CUSTODIAN_BARRED'
    );

    await page.locator('#p17-app-actor').fill('105');
    await page.locator('#p17-approve-slot-btn').click();
    await expect(page.getByTestId('p17-feedback-banner')).toContainText(
      'PREPARER_OR_CUSTODIAN_BARRED'
    );

    await page.locator('#p17-app-actor').fill('201');
    await page.locator('#p17-approve-slot-btn').click();
    await expect(page.getByTestId('p17-feedback-banner')).toContainText('VARIANCE_SLOT_APPROVED');

    await page.locator('#p17-app-slot').selectOption('finance_slot');
    await page.locator('#p17-approve-slot-btn').click();
    await expect(page.getByTestId('p17-feedback-banner')).toContainText(
      'DUAL_DUTY_SAME_PERSON_INSUFFICIENT'
    );

    await page.locator('#p17-app-actor').fill('203');
    await page.locator('label[for="p17-app-fallback-checkbox"]').click();
    await page.locator('#p17-approve-slot-btn').click();
    await expect(page.getByTestId('p17-feedback-banner')).toContainText('VARIANCE_SLOT_APPROVED');

    await page.locator('#p17-post-actor').fill('301');
    await page.locator('#p17-post-at').fill('2026-11-06T09:00:00Z');
    await page.locator('#p17-post-adj-btn').click();
    await expect(page.getByTestId('p17-feedback-banner')).toContainText('VARIANCE_ADJ_POSTED');
    await expect(page.getByTestId('p17-usable-on-hand-val')).toHaveText('12');
    await expect(page.getByTestId('p17-adjs-table')).toContainText(
      'GAIN-LOT-CEBU-ADJ-VAR-2026-000001'
    );

    // Repost blocked -> idempotent recovery lookup
    await page.locator('#p17-post-adj-btn').click();
    await expect(page.getByTestId('p17-feedback-banner')).toContainText('ADJ_ALREADY_POSTED');

    await page.locator('#p17-tab-history').click();
    await page.locator('[data-testid^="p17-ledger-fill-"]').first().click();
    await page.locator('#p17-lookup-by-key-btn').click();
    await expect(page.getByTestId('p17-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p17_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P18 Customer Claims, OR/DR Link Gate, Cumulative Limit, Defect Inspection & Signed Replacement', async ({
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

    await page.goto('/?view=p18');
    await expect(
      page.getByRole('heading', {
        name: 'Customer Claims, Inspected Returns & Replacements',
      })
    ).toBeVisible();

    await expect(page.getByTestId('p18-empty-sales-notice')).toBeVisible();
    await expect(page.getByTestId('p18-eligible-stock-val')).toHaveText('0');

    // Register Track 1 sale missing signed Customer DR -> claim blocked
    await page.locator('#p18-sale-channel').selectOption('track1_so_cdr');
    await page.locator('#p18-sale-so-ref').fill('CEBU-SO-2026-000001');
    await page.locator('#p18-sale-or-ref').fill('CEBU-OR-2026-000001');
    await page.locator('#p18-sale-variant').fill('71');
    await page.locator('#p18-sale-item').fill('Four-Person Field Tent');
    await page.locator('#p18-sale-released').fill('2');
    await page.locator('#p18-sale-stock').fill('5');
    await page.locator('#p18-sale-scale').selectOption('0');
    await page.locator('#p18-sale-prov').fill('CEBU-RM-2026-000001');
    await page.locator('#p18-register-sale-btn').click();
    await expect(page.getByTestId('p18-feedback-banner')).toContainText('ORIGINAL_SALE_REGISTERED');

    await page.locator('#p18-clm-preparer').fill('101');
    await page.locator('#p18-clm-qty').fill('2');
    await page.locator('#p18-clm-reason').fill('Seam defect');
    await page.locator('#p18-clm-at').fill('2026-11-07T08:00:00Z');
    await page.locator('#p18-initiate-claim-btn').click();
    await expect(page.getByTestId('p18-feedback-banner')).toContainText(
      'MISSING_ORIGINAL_OR_OR_SIGNED_DR'
    );

    // Register valid Track 1 sale with OR + Signed DR -> initiate claim for 2 -> cumulative reclaim blocked
    await page.locator('#p18-sale-so-ref').fill('CEBU-SO-2026-000002');
    await page.locator('#p18-sale-or-ref').fill('CEBU-OR-2026-000002');
    await page.locator('#p18-sale-cdr-ref').fill('CEBU-CDR-2026-000002');
    await page.locator('#p18-register-sale-btn').click();
    await expect(page.getByTestId('p18-feedback-banner')).toContainText('ORIGINAL_SALE_REGISTERED');

    await page.locator('#p18-initiate-claim-btn').click();
    await expect(page.getByTestId('p18-feedback-banner')).toContainText('CLAIM_ADJ_INITIATED');

    await page.locator('#p18-clm-qty').fill('1');
    await page.locator('#p18-clm-reason').fill('Excess claim check');
    await page.locator('#p18-initiate-claim-btn').click();
    await expect(page.getByTestId('p18-feedback-banner')).toContainText(
      'CUMULATIVE_CLAIM_LIMIT_EXCEEDED'
    );

    // Tab 2: Inspect defective -> single configured Claim Approver 202 approves
    await page.locator('#p18-tab-inspect').click();
    await page.locator('#p18-insp-actor').fill('301');
    await page.locator('#p18-insp-outcome').selectOption('defective_confirmed');
    await page.locator('#p18-insp-rm-ref').fill('CEBU-RM-2026-000001');
    await page.locator('#p18-insp-at').fill('2026-11-07T08:30:00Z');
    await page.locator('#p18-insp-notes').fill('Seam tear verified on both tents');
    await page.locator('#p18-record-inspection-btn').click();
    await expect(page.getByTestId('p18-feedback-banner')).toContainText('CLAIM_INSPECTION_RECORDED');

    await page.locator('#p18-app-actor').fill('202');
    await page.locator('#p18-app-at').fill('2026-11-07T08:35:00Z');
    await page.locator('#p18-app-reason').fill('Approved even replacement');
    await page.locator('#p18-approve-claim-btn').click();
    await expect(page.getByTestId('p18-feedback-banner')).toContainText('CLAIM_ADJ_APPROVED');

    // Tab 3: Execute blocked before acknowledgment -> bind ack -> execute (quarantines 2, issues 2 replacements)
    await page.locator('#p18-tab-replace').click();
    await page.locator('#p18-exec-actor').fill('301');
    await page.locator('#p18-exec-at').fill('2026-11-07T08:40:00Z');
    await page.locator('#p18-execute-claim-btn').click();
    await expect(page.getByTestId('p18-feedback-banner')).toContainText(
      'MISSING_REPLACEMENT_ACKNOWLEDGMENT'
    );

    await page.locator('#p18-ack-actor').fill('301');
    await page.locator('#p18-ack-rec-name').fill('Maria Santos');
    await page.locator('#p18-ack-hash').fill('f'.repeat(64));
    await page.locator('#p18-ack-at').fill('2026-11-07T08:42:00Z');
    await page.locator('#p18-bind-ack-btn').click();
    await expect(page.getByTestId('p18-feedback-banner')).toContainText(
      'REPLACEMENT_ACKNOWLEDGMENT_BOUND'
    );

    await page.locator('#p18-execute-claim-btn').click();
    await expect(page.getByTestId('p18-feedback-banner')).toContainText('CLAIM_REPLACEMENT_EXECUTED');
    await expect(page.getByTestId('p18-quarantined-defects-val')).toHaveText('2');
    await expect(page.getByTestId('p18-replacements-issued-val')).toHaveText('2');
    await expect(page.getByTestId('p18-claims-table')).toContainText('CEBU-ADJ-CLM-2026-000001');

    await page.locator('#p18-tab-history').click();
    await page.locator('[data-testid^="p18-ledger-fill-"]').first().click();
    await page.locator('#p18-lookup-by-key-btn').click();
    await expect(page.getByTestId('p18-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p18_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes P19 Refund Payouts, Unequal Exchange Payment Gate, and Funded Exception Resolution', async ({
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

    await page.goto('/?view=p19');
    await expect(
      page.getByRole('heading', {
        name: 'Refunds, Unequal Exchanges & Funded Exceptions',
      })
    ).toBeVisible();

    await expect(page.getByTestId('p19-empty-contexts-notice')).toBeVisible();
    await expect(page.getByTestId('p19-net-credit-val')).toHaveText('0.00');
    await expect(page.getByTestId('p19-approved-unexecuted-val')).toHaveText('0.00');
    await expect(page.getByTestId('p19-executed-refunds-val')).toHaveText('0.00');
    await expect(page.getByTestId('p19-exchange-collected-val')).toHaveText('0.00');
    await expect(page.getByTestId('p19-open-obligations-val')).toHaveText('0');

    // Context 1: Track 1 SO refund flow (PHP 1000.00 credit - PHP 250.00 consumed = PHP 750.00 refundable)
    await page.locator('#p19-ctx-kind').selectOption('track1_so');
    await page.locator('#p19-ctx-src-ref').fill('CEBU-SO-2026-000001');
    await page.locator('#p19-ctx-or-ref').fill('CEBU-OR-2026-000001');
    await page.locator('#p19-ctx-adj-ref').fill('CEBU-ADJ-CLM-2026-000001');
    await page.locator('#p19-ctx-buyer').fill('Maria Santos');
    await page.locator('#p19-ctx-credit').fill('1000.00');
    await page.locator('#p19-ctx-consumed').fill('250.00');
    await page.locator('#p19-ctx-po-amt').fill('0.00');
    await page.locator('#p19-ctx-res-qty').fill('0');
    await page.locator('#p19-register-ctx-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'FINANCIAL_CONTEXT_REGISTERED'
    );
    await expect(page.getByTestId('p19-net-credit-val')).toHaveText('750.00');

    // Over-refund guard & same-actor guard before independent Finance approval
    await page.locator('#p19-ref-prep').fill('101');
    await page.locator('#p19-ref-fin').fill('202');
    await page.locator('#p19-ref-amt').fill('800.00');
    await page.locator('#p19-ref-at').fill('2026-11-09T08:00:00Z');
    await page.locator('#p19-ref-reason').fill('Customer refund approval');
    await page.locator('#p19-approve-refund-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'REFUND_EXCEEDS_AVAILABLE_CREDIT'
    );

    await page.locator('#p19-ref-fin').fill('101');
    await page.locator('#p19-ref-amt').fill('500.00');
    await page.locator('#p19-approve-refund-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText('INDEPENDENCE_REQUIRED');

    // Approve PHP 500.00 -> net verified credit stays 750.00 & executed total stays 0.00
    await page.locator('#p19-ref-fin').fill('202');
    await page.locator('#p19-approve-refund-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'REFUND_APPROVED_PENDING_EXECUTION'
    );
    await expect(page.getByTestId('p19-net-credit-val')).toHaveText('750.00');
    await expect(page.getByTestId('p19-approved-unexecuted-val')).toHaveText('500.00');
    await expect(page.getByTestId('p19-executed-refunds-val')).toHaveText('0.00');

    // Execute actual verified payout once -> net credit drops to 250.00
    await page.locator('#p19-exec-actor').fill('203');
    await page.locator('#p19-exec-channel').selectOption('official_gcash');
    await page.locator('#p19-exec-pay-ref').fill('GC-PAYOUT-9901');
    await page.locator('#p19-exec-at').fill('2026-11-09T09:00:00Z');
    await page.locator('#p19-exec-hash').fill('a'.repeat(64));
    await page.locator('#p19-execute-refund-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText('VERIFIED_REFUND_EXECUTED');
    await expect(page.getByTestId('p19-net-credit-val')).toHaveText('250.00');
    await expect(page.getByTestId('p19-approved-unexecuted-val')).toHaveText('0.00');
    await expect(page.getByTestId('p19-executed-refunds-val')).toHaveText('500.00');

    await page.locator('#p19-execute-refund-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText('REFUND_ALREADY_EXECUTED');

    // Context 2: Booth claim unequal exchange (PHP 250 -> PHP 400 = PHP 150 due)
    await page.locator('#p19-ctx-kind').selectOption('booth_or');
    await page.locator('#p19-ctx-src-ref').fill('BOOTH-CEBU-2026');
    await page.locator('#p19-ctx-or-ref').fill('CEBU-OR-BOOTH-0001');
    await page.locator('#p19-ctx-adj-ref').fill('CEBU-ADJ-CLM-2026-000002');
    await page.locator('#p19-ctx-buyer').fill('Juan Dela Cruz');
    await page.locator('#p19-ctx-credit').fill('250.00');
    await page.locator('#p19-ctx-consumed').fill('250.00');
    await page.locator('#p19-register-ctx-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'FINANCIAL_CONTEXT_REGISTERED'
    );

    await page.locator('#p19-tab-exchange').click();
    await page.locator('#p19-ex-actor').fill('101');
    await page.locator('#p19-ex-at').fill('2026-11-10T08:00:00Z');
    await page.locator('#p19-ex-ret-val').fill('250.00');
    await page.locator('#p19-ex-rep-val').fill('400.00');
    await page.locator('label[for="p19-ex-fab-checkbox"]').click();
    await page.locator('#p19-prepare-exchange-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'BOOTH_CLAIM_SO_FABRICATION_FORBIDDEN'
    );

    await page.locator('label[for="p19-ex-fab-checkbox"]').click();
    await page.locator('#p19-prepare-exchange-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'UNEQUAL_EXCHANGE_PREPARED'
    );

    // Release blocked before additional verified OR payment
    await page.locator('#p19-ex-sig-hash').fill('b'.repeat(64));
    await page.locator('#p19-ex-rel-at').fill('2026-11-10T08:10:00Z');
    await page.locator('#p19-release-ex-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'ADDITIONAL_VERIFIED_PAYMENT_REQUIRED'
    );

    // Verify additional OR and release higher-value replacement
    await page.locator('#p19-ex-ver-actor').fill('202');
    await page.locator('#p19-ex-or-ref').fill('CEBU-OR-2026-000050');
    await page.locator('#p19-ex-ver-at').fill('2026-11-10T08:15:00Z');
    await page.locator('#p19-verify-ex-pay-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'ADDITIONAL_EXCHANGE_PAYMENT_VERIFIED'
    );

    await page.locator('#p19-ex-rel-at').fill('2026-11-10T08:20:00Z');
    await page.locator('#p19-release-ex-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'UNEQUAL_EXCHANGE_RELEASED'
    );
    await expect(page.getByTestId('p19-exchange-collected-val')).toHaveText('150.00');

    // Context 3: Funded cancellation with linked open PO & reserved stock
    await page.locator('#p19-tab-refunds').click();
    await page.locator('#p19-ctx-kind').selectOption('track1_so');
    await page.locator('#p19-ctx-src-ref').fill('CEBU-SO-2026-000009');
    await page.locator('#p19-ctx-or-ref').fill('CEBU-OR-2026-000009');
    await page.locator('#p19-ctx-adj-ref').fill('CEBU-ADJ-EXC-2026-000001');
    await page.locator('#p19-ctx-buyer').fill('Carlos Reyes');
    await page.locator('#p19-ctx-credit').fill('400.00');
    await page.locator('#p19-ctx-consumed').fill('0.00');
    await page.locator('#p19-ctx-po-ref').fill('CEBU-PO-2026-000004');
    await page.locator('#p19-ctx-po-amt').fill('400.00');
    await page.locator('#p19-ctx-res-qty').fill('3');
    await page.locator('#p19-register-ctx-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'FINANCIAL_CONTEXT_REGISTERED'
    );

    await page.locator('#p19-tab-exceptions').click();
    await page.locator('#p19-exc-kind').selectOption('funded_cancellation');
    await page.locator('#p19-exc-actor').fill('101');
    await page.locator('#p19-exc-init-at').fill('2026-11-10T09:00:00Z');
    await page.locator('label[for="p19-exc-forfeit-checkbox"]').click();
    await page.locator('#p19-initiate-exc-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'AUTOMATIC_FORFEITURE_OR_RELEASE_FORBIDDEN'
    );

    await page.locator('label[for="p19-exc-forfeit-checkbox"]').click();
    await page.locator('#p19-initiate-exc-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText('FUNDED_EXCEPTION_OPENED');
    await expect(page.getByTestId('p19-open-obligations-val')).toHaveText('1');

    await page.locator('#p19-exc-approver').fill('202');
    await page.locator('#p19-exc-res-at').fill('2026-11-10T10:00:00Z');
    await page.locator('#p19-exc-po-res').fill('Retain PO as chapter safety stock');
    await page.locator('#p19-exc-stock-res').fill('Transfer 3 reserved units cleanly');
    await page.locator('#p19-exc-fund-res').fill('Approve PHP 400.00 refund payout');
    await page.locator('#p19-exc-reason').fill('Mutual cancellation under exception policy');
    await page.locator('#p19-resolve-exc-btn').click();
    await expect(page.getByTestId('p19-feedback-banner')).toContainText(
      'FUNDED_OBLIGATIONS_RESOLVED'
    );
    await expect(page.getByTestId('p19-open-obligations-val')).toHaveText('0');

    // Tab 4: Operation Recovery Lookup
    await page.locator('#p19-tab-history').click();
    await page.locator('[data-testid^="p19-ledger-fill-"]').first().click();
    await page.locator('#p19-lookup-by-key-btn').click();
    await expect(page.getByTestId('p19-lookup-result')).toContainText('OPERATION_RECOVERED');
    await page.locator('#p19-lookup-by-ulid-btn').click();
    await expect(page.getByTestId('p19-lookup-result')).toContainText('OPERATION_RECOVERED');

    await page.evaluate(() => {
      window.localStorage.removeItem('ysp_p19_context');
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

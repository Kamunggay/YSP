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

    await expect(page.locator('#p03-state-header-title')).toHaveText('(Draft)');
    await expect(page.getByTestId('p03-material-version-pill')).toContainText('Draft');
    await expect(page.getByTestId('p03-axis-approval')).toHaveText('draft');
    await expect(page.getByTestId('p03-submit-card')).toHaveClass(/is-needs-action/);

    // 1. Incomplete draft increments row version without creating material version
    await page.locator('#p03-save-draft-btn').click();
    await expect(page.getByTestId('p03-row-version-pill')).toContainText('v2');
    await expect(page.getByTestId('p03-material-version-pill')).toContainText('Draft');

    // 2. Submit Material v1 + check Version History tab + idempotency replay & mismatch
    await page.locator('#p03-purpose-input').fill('Initial v1 physical count');
    await page.locator('#p03-submit-material-btn').click();
    await expect(page.getByTestId('p03-material-version-pill')).toContainText('v1');
    await expect(page.getByTestId('p03-review-card')).toHaveClass(/is-needs-action/);

    await page.getByTestId('p03-filter-version-history').click();
    await expect(page.getByTestId('p03-history-v1')).toBeVisible();
    await expect(page.getByTestId('p03-history-v1')).toContainText('COUNT-SHEET-CEB-2026-01');
    await expect(page.getByTestId('p03-history-v1')).toContainText('CFG-2026-0001 v1');
    await page.getByTestId('p03-filter-submission-approval').click();
    await expect(page.locator('#p03-review-decision option[value="cancel"]')).toHaveCount(1);
    await expect(page.getByTestId('p03-external-ref-input')).toBeVisible();

    // Replay exact same attempt (original key + original expected versions + same payload)
    await page.locator('#p03-expected-row').fill('2');
    await page.locator('#p03-expected-material').fill('');
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
    await page.locator('#p03-record-decision-btn').click();

    await page.locator('#p03-review-persona').selectOption('finance_22');
    await page.locator('#p03-review-reason').fill('Finance sign-off on v2');
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
    await page.locator('#p03-lookup-key-input').fill('submit-ipc-v1-01');
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
      page.getByRole('heading', { name: 'P02 Chapter Administration, Readiness & Provider Surface' })
    ).toBeVisible();

    // 1. Provider-only isolation (ADD-AC-09) + S-22 provisioning & 503 global disable boundary
    await page.locator('#p02-persona-select').selectOption('provider_90');
    await expect(page.getByTestId('p02-chapter-state')).toContainText('no_authorized_memberships');
    await expect(page.getByTestId('p02-next-action')).toContainText('no_chapter_work');
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

    await page.locator('#p02-global-disable-btn').click();
    await expect(page.getByTestId('p02-global-disable-result')).toContainText('HTTP 503');
    await expect(page.getByTestId('p02-global-disable-result')).toContainText(
      'original_outcome: uncertain'
    );

    // 2. Switch to CHAPTER_HEAD -> disable Pedro (session revoke) & separately authorize Sam (ADD-AC-09)
    await page.locator('#p02-persona-select').selectOption('head_21');
    await page.locator('#p02-tab-memberships').click();
    await page.getByTestId('p02-disable-31').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('MEMBERSHIP_DISABLED');
    await expect(page.getByTestId('p02-member-31')).toContainText('status: disabled');
    await expect(page.getByTestId('p02-member-31')).toContainText('sessions: 0');

    await page.locator('#p02-preset-sam-btn').click();
    await page.locator('#p02-authorize-member-btn').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('MEMBERSHIP_AUTHORIZED');
    await expect(page.getByTestId('p02-member-90')).toBeVisible();

    // 3. Duty grant & distinct alternate substitution
    await page.locator('#p02-tab-duties').click();
    await page.locator('#p02-grant-member-select').selectOption('111');
    await page.locator('#p02-grant-duty-select').selectOption('RF_APPROVER');
    await page.locator('#p02-authorize-grant-btn').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('DUTY_GRANT_AUTHORIZED');

    await page.locator('#p02-alternate-member-select').selectOption('221');
    await page.getByTestId('p02-substitute-1003').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('ALTERNATE_DESIGNATED');

    // 4. Operational vs Financial policy gate enforcement
    await page.locator('#p02-tab-policies').click();
    await page.getByTestId('p02-gate-commit-RETURN_REFUND_VALUATION_POLICY').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('POLICY_NOT_EFFECTIVE');

    // CHAPTER_HEAD cannot approve FINANCIAL policy
    await page.getByTestId('p02-policy-approve-RETURN_REFUND_VALUATION_POLICY').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('POLICY_DUTY_FORBIDDEN');

    // FINANCE approves financial policy -> commit gate unblocks
    await page.locator('#p02-persona-select').selectOption('finance_22');
    await page.getByTestId('p02-policy-approve-RETURN_REFUND_VALUATION_POLICY').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('POLICY_APPROVED');

    await page.getByTestId('p02-gate-commit-RETURN_REFUND_VALUATION_POLICY').click();
    await expect(page.getByTestId('p02-feedback-banner')).toContainText('POLICY_EFFECTIVE');

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

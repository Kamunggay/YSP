import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import './login.css';
import './create-chapter.css';
import {
  confirmAuthenticatorEnrollment,
  createOfficerAccount,
  generateUniqueRecoveryCodes,
  inviteChapterOfficer,
  prepareAuthenticatorEnrollment,
  provisionChapter,
} from './authApi';
import type { VerifiedSessionData } from './LoginPage';

export type SignupStepMode =
  | 'create-chapter'
  | 'connect-auth'
  | 'save-recovery'
  | 'invite-officer'
  | 'create-officer'
  | 'officer-connect-auth'
  | 'officer-save-recovery';

export type ChapterDuty =
  | 'Inventory Custodian'
  | 'Committee Requester'
  | 'Finance Officer'
  | 'Sales & Dispatch';

export interface CreateChapterFormData {
  chapterName: string;
  chapterCode: string;
  headName: string;
  headEmail: string;
  initialPassword: string;
}

export interface InviteOfficerFormData {
  officerName: string;
  officerEmail: string;
  duties: ChapterDuty[];
}

export interface CreateOfficerFormData {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface CreateChapterPageProps {
  initialStep?: SignupStepMode;
  initialData?: Partial<CreateChapterFormData>;
  onNavigateToLogin?: () => void;
  onCompleteSignup?: (sessionData?: VerifiedSessionData) => void;
  onSaveAndInvite?: (data: CreateChapterFormData) => void;
}

interface PhotoButtonProps {
  type?: 'button' | 'submit';
  unclickedSrc: string;
  clickedSrc: string;
  alt: string;
  className?: string;
  disabled?: boolean;
  onClick?: (() => void) | undefined;
}

function PhotoButton({
  type = 'button',
  unclickedSrc,
  clickedSrc,
  alt,
  className = '',
  disabled = false,
  onClick,
}: PhotoButtonProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type={type}
      disabled={disabled}
      className={`kamunggay-photo-btn ${pressed ? 'is-active' : ''} ${className}`.trim()}
      aria-label={alt}
      onClick={onClick}
      onPointerDown={() => {
        if (!disabled) setPressed(true);
      }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onKeyDown={(e) => {
        if (!disabled && (e.key === ' ' || e.key === 'Enter')) setPressed(true);
      }}
      onKeyUp={() => setPressed(false)}
      onBlur={() => setPressed(false)}
    >
      <img src={unclickedSrc} alt={alt} className="btn-unclicked" draggable={false} />
      <img src={clickedSrc} alt="" aria-hidden="true" className="btn-clicked" draggable={false} />
    </button>
  );
}

const DUTY_ITEMS: { duty: ChapterDuty; slotClass: string }[] = [
  { duty: 'Inventory Custodian', slotClass: 'duty-slot-top-left' },
  { duty: 'Committee Requester', slotClass: 'duty-slot-top-right' },
  { duty: 'Finance Officer', slotClass: 'duty-slot-bottom-left' },
  { duty: 'Sales & Dispatch', slotClass: 'duty-slot-bottom-right' },
];

export function CreateChapterPage({
  initialStep = 'create-chapter',
  initialData,
  onNavigateToLogin,
  onCompleteSignup,
  onSaveAndInvite,
}: CreateChapterPageProps) {
  const [step, setStep] = useState<SignupStepMode>(initialStep);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Frame 1: Create Chapter & Appoint Chapter Head state
  const [chapterName, setChapterName] = useState(initialData?.chapterName ?? '');
  const [chapterCode, setChapterCode] = useState(initialData?.chapterCode ?? '');
  const [headName, setHeadName] = useState(initialData?.headName ?? '');
  const [headEmail, setHeadEmail] = useState(initialData?.headEmail ?? '');
  const [initialPassword, setInitialPassword] = useState(initialData?.initialPassword ?? '');

  // Frame 2: Connect Google Authenticator state (Chapter Head)
  const [headEnrollmentId, setHeadEnrollmentId] = useState<string>('enr_head_demo');
  const [headSetupKey, setHeadSetupKey] = useState<string>('KMGY 4821 YSP3 7740');
  const [headOtp, setHeadOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [headRecoveryCodes, setHeadRecoveryCodes] = useState<string[]>(() => generateUniqueRecoveryCodes(6));

  // Frame 4: Invite New Chapter Officer state
  const [officerName, setOfficerName] = useState('');
  const [officerEmail, setOfficerEmail] = useState('');
  const [selectedDuties, setSelectedDuties] = useState<ChapterDuty[]>([]);

  // Frame 5: Create Officer Account state
  const [officerFullName, setOfficerFullName] = useState('');
  const [officerAccountEmail, setOfficerAccountEmail] = useState('');
  const [officerPassword, setOfficerPassword] = useState('');
  const [officerConfirmPassword, setOfficerConfirmPassword] = useState('');

  // Frame 6: Officer MFA state
  const [officerEnrollmentId, setOfficerEnrollmentId] = useState<string>('enr_officer_demo');
  const [officerSetupKey, setOfficerSetupKey] = useState<string>('OFC9 3158 KMG7 6241');
  const [officerOtp, setOfficerOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [officerRecoveryCodes, setOfficerRecoveryCodes] = useState<string[]>(() => generateUniqueRecoveryCodes(6));
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('/assets/kamunggay/authenticator-qr.png');

  // Generate dynamic scannable QR code based on active setup key
  useEffect(() => {
    const isOfficer = step === 'officer-connect-auth';
    const activeKey = isOfficer ? officerSetupKey : headSetupKey;
    const activeEmail = isOfficer ? officerAccountEmail || 'officer@ysp.org' : headEmail || 'head@ysp.org';
    const cleanKey = activeKey.replace(/\s+/g, '');
    const otpUri = `otpauth://totp/Kamunggay%20YSP:${encodeURIComponent(activeEmail)}?secret=${cleanKey}&issuer=Kamunggay%20YSP`;

    let isMounted = true;
    void QRCode.toDataURL(otpUri, {
      margin: 1,
      width: 500,
      color: { dark: '#1e1611', light: '#ffffff' },
    })
      .then((url) => {
        if (isMounted) setQrCodeUrl(url);
      })
      .catch(() => {
        if (isMounted) setQrCodeUrl('/assets/kamunggay/authenticator-qr.png');
      });

    return () => {
      isMounted = false;
    };
  }, [step, headSetupKey, officerSetupKey, headEmail, officerAccountEmail]);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Load setup key when entering connect-auth or officer-connect-auth if not yet loaded
  useEffect(() => {
    if (step === 'connect-auth' && headSetupKey === 'KMGY 4821 YSP3 7740') {
      void prepareAuthenticatorEnrollment('begin').then((res) => {
        if (res.kind === 'success') {
          setHeadEnrollmentId(res.enrollmentId);
          setHeadSetupKey(res.setupKey);
        }
      });
    } else if (step === 'officer-connect-auth' && officerSetupKey === 'OFC9 3158 KMG7 6241') {
      void prepareAuthenticatorEnrollment('begin').then((res) => {
        if (res.kind === 'success') {
          setOfficerEnrollmentId(res.enrollmentId);
          setOfficerSetupKey(res.setupKey);
        }
      });
    }
  }, [step, headSetupKey, officerSetupKey]);

  async function handleChapterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!chapterName.trim() || !chapterCode.trim() || !headName.trim() || !headEmail.trim() || !initialPassword) {
      setErrorMessage('Please complete all required fields to establish the Chapter entity.');
      return;
    }

    setIsLoading(true);
    try {
      const data: CreateChapterFormData = {
        chapterName,
        chapterCode,
        headName,
        headEmail,
        initialPassword,
      };
      onSaveAndInvite?.(data);

      const provResult = await provisionChapter(data);
      if (provResult.kind === 'success') {
        const enrollResult = await prepareAuthenticatorEnrollment('begin');
        if (enrollResult.kind === 'success') {
          setHeadEnrollmentId(enrollResult.enrollmentId);
          setHeadSetupKey(enrollResult.setupKey);
        }
        setStep('connect-auth');
      } else {
        setErrorMessage(provResult.message);
      }
    } catch {
      setErrorMessage('An unexpected error occurred while provisioning the chapter.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmPairing(isOfficer: boolean) {
    const activeOtp = isOfficer ? officerOtp : headOtp;
    const enrollmentId = isOfficer ? officerEnrollmentId : headEnrollmentId;
    const code = activeOtp.join('');

    if (code.length < 6) {
      setErrorMessage('Please enter all 6 verification digits from Google Authenticator.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);
    try {
      const result = await confirmAuthenticatorEnrollment(enrollmentId, code);
      if (result.kind === 'success') {
        if (isOfficer) {
          setOfficerRecoveryCodes(result.recoveryCodes);
          setStep('officer-save-recovery');
        } else {
          setHeadRecoveryCodes(result.recoveryCodes);
          setStep('save-recovery');
        }
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setErrorMessage('Pairing verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleOtpChange(
    index: number,
    value: string,
    currentOtp: string[],
    setOtp: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    const cleaned = value.replace(/[^0-9a-zA-Z]/g, '').slice(-1).toUpperCase();
    const next = [...currentOtp];
    next[index] = cleaned;
    setOtp(next);
    if (cleaned && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
    currentOtp: string[],
    isOfficer: boolean
  ) {
    if (e.key === 'Backspace' && !currentOtp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      void handleConfirmPairing(isOfficer);
    }
  }

  function handleOtpPaste(
    e: React.ClipboardEvent<HTMLInputElement>,
    setOtp: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    const pasted = e.clipboardData
      .getData('text')
      .replace(/[^0-9a-zA-Z]/g, '')
      .slice(0, 6)
      .toUpperCase();
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i] ?? '';
    }
    setOtp(next);
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  }

  function toggleDuty(duty: ChapterDuty) {
    setSelectedDuties((prev) =>
      prev.includes(duty) ? prev.filter((d) => d !== duty) : [...prev, duty]
    );
  }

  function handleDownloadRecoveryTxt(targetLabel: string, codes: string[]) {
    const content = [
      `Kamunggay Single-Use Recovery Codes${targetLabel ? ` (${targetLabel})` : ''}`,
      '====================================',
      ...codes,
      '',
    ].join('\n');
    if (typeof window !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kamunggay-recovery-codes.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  function handleCopyRecoveryCodes(codes: string[]) {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(codes.join('\n'));
    }
  }

  async function handleInviteProceed(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!officerName.trim() || !officerEmail.trim()) {
      setErrorMessage('Please enter both the Officer Full Name and Email Address.');
      return;
    }

    if (selectedDuties.length === 0) {
      setErrorMessage('Please select at least one Granted Chapter Duty.');
      return;
    }

    setIsLoading(true);
    try {
      await inviteChapterOfficer({
        officerName,
        officerEmail,
        duties: selectedDuties,
      });

      if (!officerFullName) setOfficerFullName(officerName);
      if (!officerAccountEmail) setOfficerAccountEmail(officerEmail);
      setStep('create-officer');
    } catch {
      setErrorMessage('Unable to register officer invitation. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateOfficerSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!officerFullName.trim() || !officerAccountEmail.trim() || !officerPassword || !officerConfirmPassword) {
      setErrorMessage('Please fill in all officer account fields.');
      return;
    }

    if (officerPassword.length < 10) {
      setErrorMessage('Password must be at least 10 characters long.');
      return;
    }

    if (!/[A-Z]/.test(officerPassword) || !/[0-9]/.test(officerPassword)) {
      setErrorMessage('Password must contain at least one uppercase letter and one number.');
      return;
    }

    if (officerPassword !== officerConfirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await createOfficerAccount({
        fullName: officerFullName,
        email: officerAccountEmail,
        password: officerPassword,
        confirmPassword: officerConfirmPassword,
      });

      if (result.kind === 'success') {
        const enrollResult = await prepareAuthenticatorEnrollment('begin');
        if (enrollResult.kind === 'success') {
          setOfficerEnrollmentId(enrollResult.enrollmentId);
          setOfficerSetupKey(enrollResult.setupKey);
        }
        setStep('officer-connect-auth');
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setErrorMessage('Failed to create officer account.');
    } finally {
      setIsLoading(false);
    }
  }

  // Render Frame 2 or Frame 6: Connect Google Authenticator
  if (step === 'connect-auth' || step === 'officer-connect-auth') {
    const isOfficer = step === 'officer-connect-auth';
    const activeOtp = isOfficer ? officerOtp : headOtp;
    const setActiveOtp = isOfficer ? setOfficerOtp : setHeadOtp;
    const activeSetupKey = isOfficer ? officerSetupKey : headSetupKey;

    return (
      <div className="kamunggay-viewport centered-mode">
        <section
          className="kamunggay-create-chapter-card card-connect-auth"
          aria-labelledby="connect-auth-title"
        >
          <img
            src="/assets/kamunggay/lock.png"
            alt=""
            aria-hidden="true"
            className="connect-auth-icon"
            draggable={false}
          />
          <h1 id="connect-auth-title" className="connect-auth-title">
            Connect Google Authenticator
          </h1>
          <p className="connect-auth-subtitle">
            Scan this QR code using Google Authenticator
            <br />
            on your mobile phone.
          </p>

          {errorMessage && (
            <div className="kamunggay-auth-error" role="alert" aria-live="polite">
              {errorMessage}
            </div>
          )}

          <div className="connect-auth-qr-wrap">
            <img
              src="/assets/kamunggay/qr-box.png"
              alt="Scan QR code or enter setup key manually"
              className="connect-auth-qr-box"
              draggable={false}
            />
            <img
              src={qrCodeUrl}
              alt="Scan QR code using Google Authenticator"
              className="connect-auth-qr-code"
              draggable={false}
            />
            {activeSetupKey && (
              <span className="connect-auth-setup-key-slot" aria-label={`Manual setup key: ${activeSetupKey}`}>
                {activeSetupKey}
              </span>
            )}
          </div>

          <label className="connect-auth-otp-label" htmlFor="connect-auth-otp-0">
            Enter 6-Digits Verification Code from App.
          </label>

          <div className="connect-auth-otp-row" role="group" aria-label="6-Digit Verification Code">
            {activeOtp.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  otpRefs.current[idx] = el;
                }}
                id={`connect-auth-otp-${idx}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                disabled={isLoading}
                className="connect-auth-otp-input"
                aria-label={`Verification digit ${idx + 1}`}
                value={digit}
                onChange={(e) => handleOtpChange(idx, e.target.value, activeOtp, setActiveOtp)}
                onKeyDown={(e) => handleOtpKeyDown(idx, e, activeOtp, isOfficer)}
                onPaste={(e) => handleOtpPaste(e, setActiveOtp)}
              />
            ))}
          </div>

          <div className="connect-auth-btn-row">
            <PhotoButton
              type="button"
              disabled={isLoading}
              unclickedSrc="/assets/kamunggay/confirm-pairing-btn.png"
              clickedSrc="/assets/kamunggay/confirm-pairing-btn-clicked.png"
              alt={isLoading ? 'Verifying...' : 'Confirm Pairing'}
              className="connect-auth-half-btn"
              onClick={() => void handleConfirmPairing(isOfficer)}
            />
            <PhotoButton
              type="button"
              disabled={isLoading}
              unclickedSrc="/assets/kamunggay/small-return-btn.png"
              clickedSrc="/assets/kamunggay/small-return-btn-clicked.png"
              alt="Return"
              className="connect-auth-half-btn"
              onClick={() => {
                setErrorMessage(null);
                setStep(isOfficer ? 'create-officer' : 'create-chapter');
              }}
            />
          </div>
        </section>
      </div>
    );
  }

  // Render Frame 3 or Frame 7: Save Recovery Codes
  if (step === 'save-recovery' || step === 'officer-save-recovery') {
    const isOfficer = step === 'officer-save-recovery';
    const targetPerson = isOfficer ? officerFullName || officerName : headName;
    const activeCodes = isOfficer ? officerRecoveryCodes : headRecoveryCodes;

    return (
      <div className="kamunggay-viewport centered-mode">
        <section
          className="kamunggay-create-chapter-card card-save-recovery"
          aria-labelledby="save-recovery-title"
        >
          <img
            src="/assets/kamunggay/recovery-code-icon.png"
            alt=""
            aria-hidden="true"
            className="save-recovery-icon"
            draggable={false}
          />
          <h1 id="save-recovery-title" className="save-recovery-title">
            Save Recovery Codes
          </h1>
          <p className="save-recovery-subtitle">
            <span className="save-recovery-subtitle-prefix">Emergency backup codes for</span>
            {targetPerson ? <span className="save-recovery-subtitle-name"> {targetPerson}</span> : null}
          </p>

          <img
            src="/assets/kamunggay/recovery-code-message.png"
            alt="Each code is single-use. Store them in a secure password manager or offline safe."
            className="save-recovery-banner"
            draggable={false}
          />

          <div className="save-recovery-grid" aria-label="Emergency backup codes">
            {activeCodes.map((code, idx) => (
              <div key={idx} className="save-recovery-code-box" data-code={code}>
                <span className="save-recovery-code-text">{code}</span>
              </div>
            ))}
          </div>

          <div className="save-recovery-utility-row">
            <PhotoButton
              type="button"
              unclickedSrc="/assets/kamunggay/download-txt-btn.png"
              clickedSrc="/assets/kamunggay/download-txt-btn-clicked.png"
              alt="Download (.TXT)"
              className="save-recovery-half-btn"
              onClick={() => handleDownloadRecoveryTxt(targetPerson, activeCodes)}
            />
            <PhotoButton
              type="button"
              unclickedSrc="/assets/kamunggay/copy-codes-btn.png"
              clickedSrc="/assets/kamunggay/copy-codes-btn-clicked.png"
              alt="Copy Codes"
              className="save-recovery-half-btn"
              onClick={() => handleCopyRecoveryCodes(activeCodes)}
            />
          </div>

          <div className="save-recovery-btn-stack">
            <PhotoButton
              type="button"
              unclickedSrc="/assets/kamunggay/proceed-btn.png"
              clickedSrc="/assets/kamunggay/proceed-btn-clicked.png"
              alt="Proceed"
              onClick={() => {
                setErrorMessage(null);
                if (isOfficer) {
                  const verifiedData: VerifiedSessionData = {
                    userName: officerFullName.trim() || officerName.trim() || headName.trim() || 'Chapter Officer',
                    authenticatedUnder: officerAccountEmail.trim() || officerEmail.trim() || headEmail.trim() || 'officer@ysp.org',
                    tierSummary: selectedDuties.length > 0 ? selectedDuties.join(', ') : 'Inventory Custodian',
                    activeChapter: chapterName.trim()
                      ? `${chapterName.trim()} (${chapterCode.trim() || 'CEBU-01'})`
                      : 'Cebu Chapter (CEBU-01)',
                    grantedDuties: selectedDuties.length > 0
                      ? selectedDuties.join(', ')
                      : 'Inventory Custodian, Committee Requester',
                    governanceConstraints: 'Requires dual-custody verification for transactions over PHP 50,000.00',
                  };
                  if (onCompleteSignup) {
                    onCompleteSignup(verifiedData);
                  } else {
                    onNavigateToLogin?.();
                  }
                } else {
                  setStep('invite-officer');
                }
              }}
            />
            <PhotoButton
              type="button"
              unclickedSrc="/assets/kamunggay/return.png"
              clickedSrc="/assets/kamunggay/return-when-clicked.png"
              alt="Return"
              onClick={() => {
                setErrorMessage(null);
                setStep(isOfficer ? 'officer-connect-auth' : 'connect-auth');
              }}
            />
          </div>
        </section>
      </div>
    );
  }

  // Render Frame 4: Invite New Chapter Officer
  if (step === 'invite-officer') {
    return (
      <div className="kamunggay-viewport centered-mode">
        <section
          className="kamunggay-create-chapter-card card-invite-officer"
          aria-labelledby="invite-officer-title"
        >
          <h1 id="invite-officer-title" className="invite-officer-title">
            Invite New Chapter Officer
          </h1>
          <p className="invite-officer-subtitle">
            Chapter Head authorizes membership and assigns canonical
            <br />
            duties to a new officer.
          </p>

          {errorMessage && (
            <div className="kamunggay-auth-error" role="alert" aria-live="polite">
              {errorMessage}
            </div>
          )}

          <div className="invite-officer-banner-wrap">
            <img
              src="/assets/kamunggay/assign-member-message.png"
              alt="Assigning membership to chapter. Officers must use individual accounts."
              className="invite-officer-banner"
              draggable={false}
            />
            {chapterName ? (
              <span className="invite-officer-banner-slot">{chapterName}</span>
            ) : null}
          </div>

          <form className="invite-officer-form" onSubmit={handleInviteProceed} noValidate>
            <div className="invite-officer-group group-officer-name">
              <label className="invite-officer-label" htmlFor="officer-full-name-input">
                Officer Full Name
              </label>
              <input
                id="officer-full-name-input"
                type="text"
                disabled={isLoading}
                className="invite-officer-input"
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
              />
            </div>

            <div className="invite-officer-group group-officer-email">
              <label className="invite-officer-label" htmlFor="officer-email-input">
                Officer Email Address
              </label>
              <input
                id="officer-email-input"
                type="email"
                disabled={isLoading}
                className="invite-officer-input"
                value={officerEmail}
                onChange={(e) => setOfficerEmail(e.target.value)}
              />
            </div>

            <div className="invite-officer-duties-section">
              <span className="invite-officer-duties-label">Granted Chapter Duties</span>
              <div className="invite-officer-duties-box" role="group" aria-label="Granted Chapter Duties">
                <img
                  src="/assets/kamunggay/assign-member-choices.png"
                  alt=""
                  aria-hidden="true"
                  className="invite-officer-duties-img"
                  draggable={false}
                />
                {DUTY_ITEMS.map(({ duty, slotClass }) => {
                  const checked = selectedDuties.includes(duty);
                  return (
                    <button
                      key={duty}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={duty}
                      className={`invite-duty-hitbox ${slotClass}`}
                      onClick={() => toggleDuty(duty)}
                    >
                      {checked ? (
                        <img
                          src="/assets/kamunggay/duty-check-icon.png"
                          alt=""
                          aria-hidden="true"
                          className="invite-duty-check-icon"
                          draggable={false}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="invite-officer-btn-stack">
              <PhotoButton
                type="submit"
                disabled={isLoading}
                unclickedSrc="/assets/kamunggay/proceed-btn.png"
                clickedSrc="/assets/kamunggay/proceed-btn-clicked.png"
                alt={isLoading ? 'Processing...' : 'Proceed'}
              />
              <PhotoButton
                type="button"
                disabled={isLoading}
                unclickedSrc="/assets/kamunggay/return.png"
                clickedSrc="/assets/kamunggay/return-when-clicked.png"
                alt="Return"
                onClick={() => {
                  setErrorMessage(null);
                  setStep('save-recovery');
                }}
              />
            </div>
          </form>
        </section>
      </div>
    );
  }

  // Render Frame 5: Create Officer Account
  if (step === 'create-officer') {
    return (
      <div className="kamunggay-viewport centered-mode">
        <section
          className="kamunggay-create-chapter-card card-create-officer"
          aria-labelledby="create-officer-title"
        >
          <img
            src="/assets/kamunggay/create-officer-icon.png"
            alt=""
            aria-hidden="true"
            className="create-officer-icon"
            draggable={false}
          />
          <h1 id="create-officer-title" className="create-officer-title">
            Create Officer Account
          </h1>

          {errorMessage && (
            <div className="kamunggay-auth-error" role="alert" aria-live="polite">
              {errorMessage}
            </div>
          )}

          <div className="create-officer-banner-wrap">
            <img
              src="/assets/kamunggay/create-officer-info-message.png"
              alt="Officer invitation verified"
              className="create-officer-banner"
              draggable={false}
            />
            {chapterName || selectedDuties.length > 0 ? (
              <span className="create-officer-banner-text">
                {chapterName ? `${chapterName}` : 'YSP Chapter'}
                {selectedDuties.length > 0 ? ` — ${selectedDuties.join(', ')}` : ''}
              </span>
            ) : null}
          </div>

          <form className="create-officer-form" onSubmit={handleCreateOfficerSubmit} noValidate>
            <div className="create-officer-group group-co-name">
              <label className="create-officer-label" htmlFor="co-full-name-input">
                Full Name
              </label>
              <input
                id="co-full-name-input"
                type="text"
                disabled={isLoading}
                className="create-chapter-input"
                value={officerFullName}
                onChange={(e) => setOfficerFullName(e.target.value)}
              />
            </div>

            <div className="create-officer-group group-co-email">
              <label className="create-officer-label" htmlFor="co-email-input">
                Email
              </label>
              <input
                id="co-email-input"
                type="email"
                disabled={isLoading}
                className="create-chapter-input"
                value={officerAccountEmail}
                onChange={(e) => setOfficerAccountEmail(e.target.value)}
              />
            </div>

            <div className="create-officer-group group-co-password">
              <label className="create-officer-label label-co-password" htmlFor="co-password-input">
                Create Password (Min. 10 chars, uppercase &amp; numbers)
              </label>
              <input
                id="co-password-input"
                type="password"
                disabled={isLoading}
                className="create-chapter-input"
                value={officerPassword}
                onChange={(e) => setOfficerPassword(e.target.value)}
              />
            </div>

            <div className="create-officer-group group-co-confirm">
              <label className="create-officer-label label-co-confirm" htmlFor="co-confirm-input">
                Confirm Password
              </label>
              <input
                id="co-confirm-input"
                type="password"
                disabled={isLoading}
                className="create-chapter-input"
                value={officerConfirmPassword}
                onChange={(e) => setOfficerConfirmPassword(e.target.value)}
              />
            </div>

            <div className="create-officer-btn-stack">
              <PhotoButton
                type="submit"
                disabled={isLoading}
                unclickedSrc="/assets/kamunggay/save-setup-2fa-btn.png"
                clickedSrc="/assets/kamunggay/save-setup-2fa-btn-clicked.png"
                alt={isLoading ? 'Saving...' : 'Save & Setup 2FA'}
              />
              <PhotoButton
                type="button"
                disabled={isLoading}
                unclickedSrc="/assets/kamunggay/return.png"
                clickedSrc="/assets/kamunggay/return-when-clicked.png"
                alt="Return"
                onClick={() => {
                  setErrorMessage(null);
                  setStep('invite-officer');
                }}
              />
            </div>
          </form>
        </section>
      </div>
    );
  }

  // Default Frame 1: Create Chapter & Appoint Chapter Head
  return (
    <div className="kamunggay-viewport centered-mode">
      <section className="kamunggay-create-chapter-card" aria-labelledby="create-chapter-title">
        <h1 id="create-chapter-title" className="create-chapter-title">
          Create Chapter &amp; Appoint Chapter Head
        </h1>
        <p className="create-chapter-subtitle">
          Establish a new YSP Chapter entity and designate its founding
          <br />
          Chapter Head authority.
        </p>

        {errorMessage && (
          <div className="kamunggay-auth-error" role="alert" aria-live="polite">
            {errorMessage}
          </div>
        )}

        <img
          src="/assets/kamunggay/the-appointed-message.png"
          alt="The appointed Chapter Head possesses exclusive operational authority to invite, assign duties, and revoke officer memberships in this chapter."
          className="create-chapter-banner"
          draggable={false}
        />

        <form className="create-chapter-form" onSubmit={handleChapterSubmit} noValidate>
          <div className="create-chapter-row">
            <div className="create-chapter-group group-chapter-name">
              <label className="create-chapter-label" htmlFor="chapter-name-input">
                Chapter Name
              </label>
              <input
                id="chapter-name-input"
                type="text"
                disabled={isLoading}
                className="create-chapter-input"
                value={chapterName}
                onChange={(e) => setChapterName(e.target.value)}
              />
            </div>
            <div className="create-chapter-group group-chapter-code">
              <label className="create-chapter-label label-chapter-code" htmlFor="chapter-code-input">
                Chapter Code / Scope
              </label>
              <input
                id="chapter-code-input"
                type="text"
                disabled={isLoading}
                className="create-chapter-input"
                value={chapterCode}
                onChange={(e) => setChapterCode(e.target.value)}
              />
            </div>
          </div>

          <div className="create-chapter-group">
            <label className="create-chapter-label" htmlFor="head-name-input">
              Founding Chapter Head Full Name
            </label>
            <input
              id="head-name-input"
              type="text"
              disabled={isLoading}
              className="create-chapter-input"
              value={headName}
              onChange={(e) => setHeadName(e.target.value)}
            />
          </div>

          <div className="create-chapter-group">
            <label className="create-chapter-label label-compact" htmlFor="head-email-input">
              Official Head Email Address
            </label>
            <input
              id="head-email-input"
              type="email"
              disabled={isLoading}
              className="create-chapter-input"
              value={headEmail}
              onChange={(e) => setHeadEmail(e.target.value)}
            />
          </div>

          <div className="create-chapter-group group-last-input">
            <label className="create-chapter-label label-compact" htmlFor="initial-password-input">
              Create Initial Master Password
            </label>
            <input
              id="initial-password-input"
              type="password"
              disabled={isLoading}
              className="create-chapter-input"
              value={initialPassword}
              onChange={(e) => setInitialPassword(e.target.value)}
            />
          </div>

          <div className="create-chapter-btn-stack">
            <PhotoButton
              type="submit"
              disabled={isLoading}
              unclickedSrc="/assets/kamunggay/save-and-invite-officers.png"
              clickedSrc="/assets/kamunggay/save-and-invite-officers-when-clicked.png"
              alt={isLoading ? 'Establishing...' : 'Save & Invite Officers'}
            />
            <PhotoButton
              type="button"
              disabled={isLoading}
              unclickedSrc="/assets/kamunggay/return.png"
              clickedSrc="/assets/kamunggay/return-when-clicked.png"
              alt="Return"
              onClick={onNavigateToLogin}
            />
          </div>
        </form>
      </section>
    </div>
  );
}

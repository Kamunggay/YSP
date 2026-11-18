import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import './login.css';
import './create-chapter.css';
import { BatCaveShell, useBatCaveToast } from './BatCaveShell';
import { NavFlowHeader } from './NavFlowHeader';
import { generateChapterCode } from './chapterCode';
import {
  getInitialSoundsEnabled,
  handleGuardedHover,
  playApplePay,
  playClickPen,
  playErrorTone,
  playScribblenauts,
} from './batcaveAudio';
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

const DUTY_ITEMS: ChapterDuty[] = [
  'Inventory Custodian',
  'Committee Requester',
  'Finance Officer',
  'Sales & Dispatch',
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
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => getInitialSoundsEnabled());
  const { toast, isExiting, showToast, dismissToast } = useBatCaveToast();

  // Frame 1: Create Chapter & Appoint Chapter Head state
  const [chapterName, setChapterName] = useState(initialData?.chapterName ?? '');
  const [hasCustomChapterCode, setHasCustomChapterCode] = useState<boolean>(() =>
    Boolean(initialData?.chapterCode?.trim())
  );
  const [chapterCode, setChapterCode] = useState(
    () =>
      initialData?.chapterCode ??
      (initialData?.chapterName ? generateChapterCode(initialData.chapterName) : '')
  );
  const [headName, setHeadName] = useState(initialData?.headName ?? '');
  const [headEmail, setHeadEmail] = useState(initialData?.headEmail ?? '');
  const [initialPassword, setInitialPassword] = useState(initialData?.initialPassword ?? '');
  const [showInitialPassword, setShowInitialPassword] = useState(false);

  // Frame 2: Connect Google Authenticator state (Chapter Head)
  const [headEnrollmentId, setHeadEnrollmentId] = useState<string>('');
  const [headSetupKey, setHeadSetupKey] = useState<string>('');
  const [headSetupUri, setHeadSetupUri] = useState<string | undefined>();
  const [headOtp, setHeadOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [headRecoveryCodes, setHeadRecoveryCodes] = useState<string[]>(() => generateUniqueRecoveryCodes(6));
  const [headPaired, setHeadPaired] = useState(false);

  // Frame 4: Invite New Chapter Officer state
  const [officerName, setOfficerName] = useState('');
  const [officerEmail, setOfficerEmail] = useState('');
  const [selectedDuties, setSelectedDuties] = useState<ChapterDuty[]>([]);

  // Frame 5: Create Officer Account state
  const [officerFullName, setOfficerFullName] = useState('');
  const [officerAccountEmail, setOfficerAccountEmail] = useState('');
  const [officerPassword, setOfficerPassword] = useState('');
  const [officerConfirmPassword, setOfficerConfirmPassword] = useState('');
  const [showOfficerPassword, setShowOfficerPassword] = useState(false);
  const [showOfficerConfirm, setShowOfficerConfirm] = useState(false);

  // Frame 6: Officer MFA state
  const [officerEnrollmentId, setOfficerEnrollmentId] = useState<string>('');
  const [officerSetupKey, setOfficerSetupKey] = useState<string>('');
  const [officerSetupUri, setOfficerSetupUri] = useState<string | undefined>();
  const [officerOtp, setOfficerOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [officerRecoveryCodes, setOfficerRecoveryCodes] = useState<string[]>(() => generateUniqueRecoveryCodes(6));
  const [officerPaired, setOfficerPaired] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('/assets/kamunggay/authenticator-qr.png');
  const [copiedKey, setCopiedKey] = useState(false);

  // Inline invalid field highlights
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({});

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  function clearInvalid(field?: string) {
    setErrorMessage(null);
    if (!field) {
      setInvalidFields({});
      return;
    }
    setInvalidFields((prev) => (prev[field] ? { ...prev, [field]: false } : prev));
  }

  function changeStep(
    next: SignupStepMode,
    toastInfo?: { tone: 'success' | 'warning' | 'error' | 'info'; text: string }
  ) {
    setErrorMessage(null);
    setInvalidFields({});
    setStep(next);
    if (toastInfo) {
      showToast(toastInfo);
    }
  }

  // Generate scannable Base32 QR code for authenticator app pairing
  useEffect(() => {
    const isOfficer = step === 'officer-connect-auth';
    const activeKey = isOfficer ? officerSetupKey : headSetupKey;
    const activeEmail = isOfficer ? officerAccountEmail : headEmail;
    const serverUri = isOfficer ? officerSetupUri : headSetupUri;
    if (!activeKey && !serverUri) return;

    const cleanKey = activeKey.replace(/\s+/g, '').toUpperCase();
    const otpUri =
      serverUri ||
      encodeURI(`otpauth://totp/Kamunggay YSP:${activeEmail || 'account'}?secret=${cleanKey}&issuer=Kamunggay YSP`);

    let isMounted = true;
    void QRCode.toDataURL(otpUri, {
      margin: 1,
      width: 500,
      color: { dark: '#0A0A0A', light: '#FFFFFF' },
    })
      .then((url) => {
        if (isMounted) setQrCodeUrl(url);
      })
      .catch(() => {
        if (isMounted) {
          setQrCodeUrl(isOfficer ? '/assets/kamunggay/officer-authenticator-qr.png' : '/assets/kamunggay/authenticator-qr.png');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [step, headSetupKey, officerSetupKey, headEmail, officerAccountEmail, headSetupUri, officerSetupUri]);

  useEffect(() => {
    if (step === 'connect-auth' && !headSetupKey) {
      void prepareAuthenticatorEnrollment('begin', undefined, undefined, 'KMGY 2345 YSPE 7762').then((res) => {
        if (res.kind === 'success') {
          setHeadEnrollmentId(res.enrollmentId);
          setHeadSetupKey(res.setupKey);
          if (res.setupUri) setHeadSetupUri(res.setupUri);
        }
      });
    } else if (step === 'officer-connect-auth' && !officerSetupKey) {
      void prepareAuthenticatorEnrollment('begin', undefined, undefined, 'OFCB 3456 KMGC 7624').then((res) => {
        if (res.kind === 'success') {
          setOfficerEnrollmentId(res.enrollmentId);
          setOfficerSetupKey(res.setupKey);
          if (res.setupUri) setOfficerSetupUri(res.setupUri);
        }
      });
    }
  }, [step, headSetupKey, officerSetupKey]);

  async function handleChapterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    clearInvalid();

    const trimmedName = chapterName.trim();
    const normalizedCode = chapterCode.trim().toUpperCase();
    const trimmedHeadName = headName.trim();
    const trimmedHeadEmail = headEmail.trim();

    if (!trimmedName || !normalizedCode || !trimmedHeadName || !trimmedHeadEmail || !initialPassword) {
      playErrorTone(soundEnabled);
      setInvalidFields({
        chapterName: !trimmedName,
        chapterCode: !normalizedCode,
        headName: !trimmedHeadName,
        headEmail: !trimmedHeadEmail,
        initialPassword: !initialPassword,
      });
      setErrorMessage('Please complete all required fields to establish the Chapter entity.');
      showToast({ tone: 'warning', text: 'Complete all required chapter fields' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedHeadEmail)) {
      playErrorTone(soundEnabled);
      setInvalidFields({ headEmail: true });
      setErrorMessage('Please enter a valid email address for the Chapter Head.');
      showToast({ tone: 'warning', text: 'Invalid Chapter Head email format' });
      return;
    }

    const codeRegex = /^[A-Z][A-Z0-9_-]{0,31}$/;
    if (!codeRegex.test(normalizedCode)) {
      playErrorTone(soundEnabled);
      setInvalidFields({ chapterCode: true });
      setErrorMessage('Chapter Code must start with an uppercase letter and contain only uppercase letters, numbers, hyphens, or underscores (up to 32 characters).');
      showToast({ tone: 'warning', text: 'Invalid Chapter Code format' });
      return;
    }

    if (initialPassword.length < 10 || !/[A-Z]/.test(initialPassword) || !/[0-9]/.test(initialPassword)) {
      playErrorTone(soundEnabled);
      setInvalidFields({ initialPassword: true });
      setErrorMessage('Master Password must be at least 10 characters and include an uppercase letter and a number.');
      showToast({ tone: 'warning', text: 'Password needs 10+ chars, uppercase & number' });
      return;
    }

    playApplePay(soundEnabled);
    setIsLoading(true);
    try {
      const data: CreateChapterFormData = {
        chapterName: trimmedName,
        chapterCode: normalizedCode,
        headName: trimmedHeadName,
        headEmail: trimmedHeadEmail,
        initialPassword,
      };
      onSaveAndInvite?.(data);

      const provResult = await provisionChapter(data);
      if (provResult.kind === 'success') {
        if (!headPaired) {
          const enrollResult = await prepareAuthenticatorEnrollment('begin', undefined, undefined, 'KMGY 2345 YSPE 7762');
          if (enrollResult.kind === 'success') {
            setHeadEnrollmentId(enrollResult.enrollmentId);
            setHeadSetupKey(enrollResult.setupKey);
            if (enrollResult.setupUri) setHeadSetupUri(enrollResult.setupUri);
          }
        }
        changeStep('connect-auth', { tone: 'success', text: 'Chapter created • Pair Authenticator' });
      } else {
        playErrorTone(soundEnabled);
        setErrorMessage(provResult.message);
        showToast({ tone: 'error', text: 'Chapter provisioning rejected' });
      }
    } catch {
      playErrorTone(soundEnabled);
      setErrorMessage('An unexpected error occurred while provisioning the chapter.');
      showToast({ tone: 'error', text: 'Provisioning service unavailable' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirmPairing(isOfficer: boolean) {
    if (isLoading) return;
    if (isOfficer ? officerPaired : headPaired) {
      playApplePay(soundEnabled);
      changeStep(isOfficer ? 'officer-save-recovery' : 'save-recovery');
      return;
    }
    const currentOtp = isOfficer ? officerOtp : headOtp;
    const enrollmentId = (isOfficer ? officerEnrollmentId : headEnrollmentId) || 'enr_active';
    const code = currentOtp.join('');

    if (code.length < 6) {
      playErrorTone(soundEnabled);
      setInvalidFields({ otp: true });
      setErrorMessage('Please enter all 6 verification digits from Google Authenticator.');
      showToast({ tone: 'warning', text: 'Enter all 6 verification digits' });
      return;
    }

    playApplePay(soundEnabled);
    clearInvalid();
    setIsLoading(true);
    try {
      const result = await confirmAuthenticatorEnrollment(enrollmentId, code);
      if (result.kind === 'success') {
        if (isOfficer) {
          setOfficerPaired(true);
          setOfficerRecoveryCodes(result.recoveryCodes);
          changeStep('officer-save-recovery', { tone: 'success', text: 'Officer 2FA paired • Save recovery codes' });
        } else {
          setHeadPaired(true);
          setHeadRecoveryCodes(result.recoveryCodes);
          changeStep('save-recovery', { tone: 'success', text: 'Chapter Head 2FA paired • Save recovery codes' });
        }
      } else {
        playErrorTone(soundEnabled);
        setInvalidFields({ otp: true });
        setErrorMessage(result.message);
        showToast({ tone: 'error', text: 'TOTP pairing confirmation rejected' });
      }
    } catch {
      playErrorTone(soundEnabled);
      setInvalidFields({ otp: true });
      setErrorMessage('Pairing verification failed. Please try again.');
      showToast({ tone: 'error', text: 'Pairing verification failed' });
    } finally {
      setIsLoading(false);
    }
  }

  function handleOtpChange(
    index: number,
    value: string,
    currentOtp: string[],
    setOtpFn: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    clearInvalid('otp');
    const cleaned = value.replace(/\D/g, '').slice(-1);
    const next = [...currentOtp];
    next[index] = cleaned;
    setOtpFn(next);
    if (cleaned) {
      playScribblenauts(soundEnabled);
      if (index < 5) {
        otpRefs.current[index + 1]?.focus();
      }
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
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (e.key === 'Enter') {
      void handleConfirmPairing(isOfficer);
    }
  }

  function handleOtpPaste(
    e: React.ClipboardEvent<HTMLInputElement>,
    setOtpFn: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    clearInvalid('otp');
    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i] ?? '';
    }
    setOtpFn(next);
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  }

  function toggleDuty(duty: ChapterDuty) {
    playClickPen(soundEnabled);
    clearInvalid('duties');
    setSelectedDuties((prev) =>
      prev.includes(duty) ? prev.filter((d) => d !== duty) : [...prev, duty]
    );
  }

  function handleDownloadRecoveryTxt(targetLabel: string, codes: string[]) {
    playClickPen(soundEnabled);
    showToast({ tone: 'success', text: 'Recovery codes (.TXT) downloaded' });
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
      const safeName = (targetLabel || 'account')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      a.download = `kamunggay-recovery-codes-${safeName || 'account'}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    }
  }

  function fallbackCopyText(text: string) {
    if (typeof document === 'undefined') return;
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore
    }
    document.body.removeChild(textArea);
  }

  function handleCopyRecoveryCodes(codes: string[]) {
    playScribblenauts(soundEnabled);
    showToast({ tone: 'info', text: 'Recovery codes copied to clipboard' }, 2200);
    const text = codes.join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopyText(text);
      });
    } else {
      fallbackCopyText(text);
    }
  }

  function handleCopySetupKey(keyValue: string) {
    playScribblenauts(soundEnabled);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(keyValue).catch(() => fallbackCopyText(keyValue));
    } else {
      fallbackCopyText(keyValue);
    }
    setCopiedKey(true);
    showToast({ tone: 'info', text: `Copied setup key: ${keyValue}` }, 2000);
    window.setTimeout(() => setCopiedKey(false), 1500);
  }

  async function handleInviteProceed(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    clearInvalid();

    const trimmedOfficerName = officerName.trim();
    const trimmedOfficerEmail = officerEmail.trim();

    if (!trimmedOfficerName || !trimmedOfficerEmail) {
      playErrorTone(soundEnabled);
      setInvalidFields({
        officerName: !trimmedOfficerName,
        officerEmail: !trimmedOfficerEmail,
      });
      setErrorMessage('Please enter both the Officer Full Name and Email Address.');
      showToast({ tone: 'warning', text: 'Officer name and email required' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedOfficerEmail)) {
      playErrorTone(soundEnabled);
      setInvalidFields({ officerEmail: true });
      setErrorMessage('Please enter a valid email address for the Officer.');
      showToast({ tone: 'warning', text: 'Invalid officer email format' });
      return;
    }

    if (headEmail.trim() && trimmedOfficerEmail.toLowerCase() === headEmail.trim().toLowerCase()) {
      playErrorTone(soundEnabled);
      setInvalidFields({ officerEmail: true });
      setErrorMessage('Officer must use an individual email distinct from the Founding Chapter Head account.');
      showToast({ tone: 'warning', text: 'Officer email must differ from Chapter Head' });
      return;
    }

    if (selectedDuties.length === 0) {
      playErrorTone(soundEnabled);
      setInvalidFields({ duties: true });
      setErrorMessage('Please select at least one Granted Chapter Duty.');
      showToast({ tone: 'warning', text: 'Select at least one chapter duty' });
      return;
    }

    playApplePay(soundEnabled);
    setIsLoading(true);
    try {
      await inviteChapterOfficer({
        officerName: trimmedOfficerName,
        officerEmail: trimmedOfficerEmail,
        duties: selectedDuties,
      });

      setOfficerFullName(trimmedOfficerName);
      setOfficerAccountEmail(trimmedOfficerEmail);
      changeStep('create-officer', { tone: 'success', text: 'Officer membership authorized' });
    } catch {
      playErrorTone(soundEnabled);
      setErrorMessage('Unable to register officer invitation. Please try again.');
      showToast({ tone: 'error', text: 'Officer authorization failed' });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateOfficerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading) return;
    clearInvalid();

    const trimmedFullName = officerFullName.trim();
    const trimmedEmail = officerAccountEmail.trim();

    if (!trimmedFullName || !trimmedEmail || !officerPassword || !officerConfirmPassword) {
      playErrorTone(soundEnabled);
      setInvalidFields({
        officerFullName: !trimmedFullName,
        officerAccountEmail: !trimmedEmail,
        officerPassword: !officerPassword,
        officerConfirm: !officerConfirmPassword,
      });
      setErrorMessage('Please fill in all officer account fields.');
      showToast({ tone: 'warning', text: 'Complete all officer account fields' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      playErrorTone(soundEnabled);
      setInvalidFields({ officerAccountEmail: true });
      setErrorMessage('Please enter a valid email address.');
      showToast({ tone: 'warning', text: 'Invalid email address format' });
      return;
    }

    if (headEmail.trim() && trimmedEmail.toLowerCase() === headEmail.trim().toLowerCase()) {
      playErrorTone(soundEnabled);
      setInvalidFields({ officerAccountEmail: true });
      setErrorMessage('Officer email must be distinct from the Founding Chapter Head email.');
      showToast({ tone: 'warning', text: 'Use a distinct officer email' });
      return;
    }

    if (officerPassword.length < 10 || !/[A-Z]/.test(officerPassword) || !/[0-9]/.test(officerPassword)) {
      playErrorTone(soundEnabled);
      setInvalidFields({ officerPassword: true });
      setErrorMessage('Password must be at least 10 characters and contain at least one uppercase letter and one number.');
      showToast({ tone: 'warning', text: 'Password needs 10+ chars, uppercase & number' });
      return;
    }

    if (officerPassword !== officerConfirmPassword) {
      playErrorTone(soundEnabled);
      setInvalidFields({ officerConfirm: true });
      setErrorMessage('Passwords do not match. Please re-enter.');
      showToast({ tone: 'warning', text: 'Passwords do not match' });
      return;
    }

    playApplePay(soundEnabled);
    setIsLoading(true);
    try {
      const result = await createOfficerAccount({
        fullName: trimmedFullName,
        email: trimmedEmail,
        password: officerPassword,
        confirmPassword: officerConfirmPassword,
      });

      if (result.kind === 'success') {
        if (!officerPaired) {
          const enrollResult = await prepareAuthenticatorEnrollment('begin', undefined, undefined, 'OFCB 3456 KMGC 7624');
          if (enrollResult.kind === 'success') {
            setOfficerEnrollmentId(enrollResult.enrollmentId);
            setOfficerSetupKey(enrollResult.setupKey);
            if (enrollResult.setupUri) setOfficerSetupUri(enrollResult.setupUri);
          }
        }
        changeStep('officer-connect-auth', { tone: 'success', text: 'Officer account created • Pair Authenticator' });
      } else {
        playErrorTone(soundEnabled);
        setErrorMessage(result.message);
        showToast({ tone: 'error', text: 'Officer creation rejected' });
      }
    } catch {
      playErrorTone(soundEnabled);
      setErrorMessage('Failed to create officer account.');
      showToast({ tone: 'error', text: 'Failed to create officer account' });
    } finally {
      setIsLoading(false);
    }
  }

  const isOfficerConnect = step === 'officer-connect-auth';
  const activeOtp = isOfficerConnect ? officerOtp : headOtp;
  const setActiveOtp = isOfficerConnect ? setOfficerOtp : setHeadOtp;
  const activeSetupKey = isOfficerConnect ? officerSetupKey : headSetupKey;
  const activePaired = isOfficerConnect ? officerPaired : headPaired;

  const isOfficerRecovery = step === 'officer-save-recovery';
  const targetPerson = isOfficerRecovery ? officerFullName || officerName : headName;
  const activeCodes = isOfficerRecovery ? officerRecoveryCodes : headRecoveryCodes;

  return (
    <BatCaveShell
      soundEnabled={soundEnabled}
      onToggleSound={setSoundEnabled}
      toast={toast}
      toastExiting={isExiting}
      onDismissToast={dismissToast}
    >
      <main className="onboarding-stage">
        {/* Frame 2 or Frame 6: Connect Google Authenticator */}
        {(step === 'connect-auth' || step === 'officer-connect-auth') && (
          <section
            className="onboarding-card is-compact"
            aria-labelledby="connect-auth-title"
          >
            <NavFlowHeader
              headingId="connect-auth-title"
              title="Connect Google Authenticator"
              subtitle="Scan this QR code using Google Authenticator on your mobile phone."
              disabled={isLoading}
              onBack={() => {
                playClickPen(soundEnabled);
                changeStep(isOfficerConnect ? 'create-officer' : 'create-chapter');
              }}
            />

            <div className="form-stack">
              {errorMessage && (
                <div className="callout-banner is-error" role="alert" aria-live="polite">
                  <span className="callout-dot dot-error" aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="qr-glass-panel">
                <div className="qr-white-frame">
                  <img
                    src={qrCodeUrl}
                    alt="Scan QR code using Google Authenticator"
                    className="qr-code-image"
                    draggable={false}
                  />
                </div>
                {activeSetupKey && (
                  <div className="setup-key-meta">
                    <span className="setup-key-label">Manual Base32 Setup Key</span>
                    <span
                      className="setup-key-chip"
                      aria-label={`Manual setup key: ${activeSetupKey}`}
                      onClick={() => handleCopySetupKey(activeSetupKey)}
                    >
                      {activeSetupKey}
                      <button
                        type="button"
                        className={`btn-copy-key ${copiedKey ? 'copied' : ''}`}
                        title="Copy setup key"
                        aria-label="Copy setup key"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopySetupKey(activeSetupKey);
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12a1.5 1.5 0 01.439 1.061V16.5A1.5 1.5 0 0115.5 18h-7A1.5 1.5 0 017 16.5v-13z" />
                          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-.5h-6A2.5 2.5 0 014.5 13.5V6z" />
                        </svg>
                      </button>
                    </span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="connect-auth-otp-0">
                    <span>Enter 6-Digits Verification Code from App.</span>
                    <span className="required-star" aria-hidden="true">*</span>
                  </label>
                </div>
                <div className="otp-digit-grid" role="group" aria-label="6-Digit Verification Code">
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
                      className={`otp-digit-input ${invalidFields['otp'] ? 'input-invalid' : ''}`}
                      aria-label={`Verification digit ${idx + 1}`}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value, activeOtp, setActiveOtp)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e, activeOtp, isOfficerConnect)}
                      onPaste={(e) => handleOtpPaste(e, setActiveOtp)}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={isLoading}
                className="btn-batcave-primary"
                aria-label={
                  isLoading
                    ? 'Verifying...'
                    : activePaired
                      ? 'Continue to Recovery Codes'
                      : 'Confirm Pairing'
                }
                onClick={() => void handleConfirmPairing(isOfficerConnect)}
              >
                <span>
                  {isLoading
                    ? 'Verifying...'
                    : activePaired
                      ? 'Continue to Recovery Codes'
                      : 'Confirm Pairing'}
                </span>
              </button>
            </div>
          </section>
        )}

        {/* Frame 3 or Frame 7: Save Recovery Codes */}
        {(step === 'save-recovery' || step === 'officer-save-recovery') && (
          <section
            className="onboarding-card is-compact"
            aria-labelledby="save-recovery-title"
          >
            <NavFlowHeader
              headingId="save-recovery-title"
              title="Save Recovery Codes"
              subtitle={
                <>
                  <span>Emergency backup codes for</span>
                  {targetPerson ? <strong> {targetPerson}</strong> : null}
                </>
              }
              disabled={isLoading}
              onBack={() => {
                playClickPen(soundEnabled);
                changeStep(isOfficerRecovery ? 'officer-connect-auth' : 'connect-auth');
              }}
            />

            <div className="form-stack">
              <div className="callout-banner">
                <span className="callout-dot dot-warning" aria-hidden="true" />
                <span>
                  Each code is single-use. Store them in a secure password manager or offline safe.
                </span>
              </div>

              <div className="recovery-codes-grid" aria-label="Emergency backup codes">
                {activeCodes.map((code, idx) => (
                  <div key={idx} className="recovery-code-cell" data-code={code}>
                    <span>{code}</span>
                  </div>
                ))}
              </div>

              <div className="auth-secondary-row">
                <button
                  type="button"
                  className="btn-batcave-secondary"
                  onClick={() => handleDownloadRecoveryTxt(targetPerson, activeCodes)}
                >
                  Download (.TXT)
                </button>
                <button
                  type="button"
                  className="btn-batcave-secondary"
                  onClick={() => handleCopyRecoveryCodes(activeCodes)}
                >
                  Copy Codes
                </button>
              </div>

              <button
                type="button"
                className="btn-batcave-primary"
                onClick={() => {
                  playApplePay(soundEnabled);
                  if (isOfficerRecovery) {
                    const verifiedData: VerifiedSessionData = {
                      userName: officerFullName.trim() || officerName.trim() || headName.trim() || 'Verified Officer',
                      authenticatedUnder:
                        officerAccountEmail.trim() || officerEmail.trim() || headEmail.trim() || 'Verified Officer',
                      tierSummary: selectedDuties.length > 0 ? selectedDuties.join(', ') : 'Chapter Operations',
                      activeChapter: chapterName.trim()
                        ? `${chapterName.trim()}${chapterCode.trim() ? ` (${chapterCode.trim()})` : ''}`
                        : 'Assigned Chapter',
                      grantedDuties:
                        selectedDuties.length > 0 ? selectedDuties.join(', ') : 'Chapter Operations',
                      governanceConstraints:
                        'Requires dual-custody verification for transactions over PHP 50,000.00',
                    };
                    if (onCompleteSignup) {
                      onCompleteSignup(verifiedData);
                    } else {
                      onNavigateToLogin?.();
                    }
                  } else {
                    changeStep('invite-officer');
                  }
                }}
              >
                <span>Proceed</span>
              </button>
            </div>
          </section>
        )}

        {/* Frame 4: Invite New Chapter Officer */}
        {step === 'invite-officer' && (
          <section
            className="onboarding-card"
            aria-labelledby="invite-officer-title"
          >
            <NavFlowHeader
              headingId="invite-officer-title"
              title="Invite New Chapter Officer"
              subtitle="Chapter Head authorizes membership and assigns canonical duties to a new officer."
              disabled={isLoading}
              onBack={() => {
                playClickPen(soundEnabled);
                changeStep('save-recovery');
              }}
            />

            <form className="form-stack" onSubmit={handleInviteProceed} noValidate>
              {errorMessage && (
                <div className="callout-banner is-error" role="alert" aria-live="polite">
                  <span className="callout-dot dot-error" aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="callout-banner">
                <span className="callout-dot dot-info" aria-hidden="true" />
                <span>
                  Assigning membership to{' '}
                  <strong>{chapterName.trim() || 'your chapter'}</strong>. Officers must use individual accounts.
                </span>
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="officer-full-name-input">
                    <span>Officer Full Name</span>
                    <span className="required-star" aria-hidden="true">*</span>
                  </label>
                </div>
                <input
                  id="officer-full-name-input"
                  type="text"
                  disabled={isLoading}
                  className={`form-control ${invalidFields['officerName'] ? 'input-invalid' : ''}`}
                  placeholder="Enter full name"
                  value={officerName}
                  onChange={(e) => {
                    clearInvalid('officerName');
                    setOfficerName(e.target.value);
                  }}
                />
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="officer-email-input">
                    <span>Officer Email Address</span>
                    <span className="required-star" aria-hidden="true">*</span>
                  </label>
                </div>
                <input
                  id="officer-email-input"
                  type="email"
                  disabled={isLoading}
                  className={`form-control ${invalidFields['officerEmail'] ? 'input-invalid' : ''}`}
                  placeholder="name@example.org"
                  value={officerEmail}
                  onChange={(e) => {
                    clearInvalid('officerEmail');
                    setOfficerEmail(e.target.value);
                  }}
                />
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <span className="form-label">
                    Granted Chapter Duties<span className="required-star" aria-hidden="true">*</span>
                  </span>
                </div>
                <div
                  className={`duties-checkbox-grid ${invalidFields['duties'] ? 'is-invalid' : ''}`}
                  role="group"
                  aria-label="Granted Chapter Duties"
                >
                  {DUTY_ITEMS.map((duty) => {
                    const checked = selectedDuties.includes(duty);
                    return (
                      <button
                        key={duty}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        aria-label={duty}
                        className={`duty-checkbox-card ${checked ? 'is-checked' : ''}`}
                        onPointerEnter={(e) => handleGuardedHover(e, soundEnabled)}
                        onClick={() => toggleDuty(duty)}
                      >
                        <span className="duty-check-box" aria-hidden="true">
                          {checked ? (
                            <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : null}
                        </span>
                        <span>{duty}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-batcave-primary"
                aria-label={isLoading ? 'Processing...' : 'Proceed'}
              >
                <span>{isLoading ? 'Processing...' : 'Proceed'}</span>
              </button>
            </form>
          </section>
        )}

        {/* Frame 5: Create Officer Account */}
        {step === 'create-officer' && (
          <section
            className="onboarding-card"
            aria-labelledby="create-officer-title"
          >
            <NavFlowHeader
              headingId="create-officer-title"
              title="Create Officer Account"
              subtitle="Complete personal credentials to activate delegated chapter duties."
              disabled={isLoading}
              onBack={() => {
                playClickPen(soundEnabled);
                changeStep('invite-officer');
              }}
            />

            <form className="form-stack" onSubmit={handleCreateOfficerSubmit} noValidate>
              {errorMessage && (
                <div className="callout-banner is-error" role="alert" aria-live="polite">
                  <span className="callout-dot dot-error" aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="callout-banner">
                <span className="callout-dot dot-info" aria-hidden="true" />
                <span>
                  Authorized under <strong>{chapterName.trim() || 'your chapter'}</strong>
                  {selectedDuties.length > 0 ? ` — ${selectedDuties.join(', ')}` : ''}
                </span>
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="co-full-name-input">
                    <span>Full Name</span>
                    <span className="required-star" aria-hidden="true">*</span>
                  </label>
                </div>
                <input
                  id="co-full-name-input"
                  type="text"
                  disabled={isLoading}
                  className={`form-control ${invalidFields['officerFullName'] ? 'input-invalid' : ''}`}
                  placeholder="Enter full name"
                  value={officerFullName}
                  onChange={(e) => {
                    clearInvalid('officerFullName');
                    setOfficerFullName(e.target.value);
                  }}
                />
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="co-email-input">
                    <span>Email</span>
                    <span className="required-star" aria-hidden="true">*</span>
                  </label>
                </div>
                <input
                  id="co-email-input"
                  type="email"
                  disabled={isLoading}
                  className={`form-control ${invalidFields['officerAccountEmail'] ? 'input-invalid' : ''}`}
                  placeholder="name@example.org"
                  value={officerAccountEmail}
                  onChange={(e) => {
                    clearInvalid('officerAccountEmail');
                    setOfficerAccountEmail(e.target.value);
                  }}
                />
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="co-password-input">
                    <span>Create Password (Min. 10 chars, uppercase &amp; numbers)</span>
                    <span className="required-star" aria-hidden="true">*</span>
                  </label>
                </div>
                <div className="input-control-wrap">
                  <input
                    id="co-password-input"
                    type={showOfficerPassword ? 'text' : 'password'}
                    maxLength={72}
                    disabled={isLoading}
                    className={`form-control has-toggle ${invalidFields['officerPassword'] ? 'input-invalid' : ''}`}
                    placeholder="Minimum 10 characters"
                    value={officerPassword}
                    onChange={(e) => {
                      clearInvalid('officerPassword');
                      setOfficerPassword(e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    aria-label={showOfficerPassword ? 'Hide officer password' : 'Show officer password'}
                    onClick={() => {
                      playClickPen(soundEnabled);
                      setShowOfficerPassword((prev) => !prev);
                    }}
                  >
                    {showOfficerPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="co-confirm-input">
                    <span>Confirm Password</span>
                    <span className="required-star" aria-hidden="true">*</span>
                  </label>
                </div>
                <div className="input-control-wrap">
                  <input
                    id="co-confirm-input"
                    type={showOfficerConfirm ? 'text' : 'password'}
                    maxLength={72}
                    disabled={isLoading}
                    className={`form-control has-toggle ${invalidFields['officerConfirm'] ? 'input-invalid' : ''}`}
                    placeholder="Re-enter password"
                    value={officerConfirmPassword}
                    onChange={(e) => {
                      clearInvalid('officerConfirm');
                      setOfficerConfirmPassword(e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    aria-label={showOfficerConfirm ? 'Hide confirmed password' : 'Show confirmed password'}
                    onClick={() => {
                      playClickPen(soundEnabled);
                      setShowOfficerConfirm((prev) => !prev);
                    }}
                  >
                    {showOfficerConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-batcave-primary"
                aria-label={isLoading ? 'Saving...' : 'Save & Setup 2FA'}
              >
                <span>{isLoading ? 'Saving...' : 'Save & Setup 2FA'}</span>
              </button>
            </form>
          </section>
        )}

        {/* Default Frame 1: Create Chapter & Appoint Chapter Head */}
        {step === 'create-chapter' && (
          <section
            className="onboarding-card"
            aria-labelledby="create-chapter-title"
          >
            <NavFlowHeader
              headingId="create-chapter-title"
              title="Create Chapter & Appoint Chapter Head"
              subtitle="Establish your chapter entity and designate its founding Chapter Head."
              disabled={isLoading}
              onBack={() => {
                playClickPen(soundEnabled);
                onNavigateToLogin?.();
              }}
            />

            <form className="form-stack" onSubmit={handleChapterSubmit} noValidate>
              {errorMessage && (
                <div className="callout-banner is-error" role="alert" aria-live="polite">
                  <span className="callout-dot dot-error" aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="callout-banner">
                <span className="callout-dot dot-info" aria-hidden="true" />
                <span>
                  The appointed Chapter Head possesses authority to invite, assign duties, and manage officer memberships in this chapter.
                </span>
              </div>

              <div className="onboarding-row-2col">
                <div className="form-group">
                  <div className="form-label-row">
                    <label className="form-label" htmlFor="chapter-name-input">
                      <span>Chapter Name</span>
                      <span className="required-star" aria-hidden="true">*</span>
                    </label>
                  </div>
                  <input
                    id="chapter-name-input"
                    type="text"
                    disabled={isLoading}
                    className={`form-control ${invalidFields['chapterName'] ? 'input-invalid' : ''}`}
                    placeholder="Enter your chapter name"
                    value={chapterName}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      clearInvalid('chapterName');
                      setChapterName(nextName);
                      if (!hasCustomChapterCode) {
                        clearInvalid('chapterCode');
                        setChapterCode(generateChapterCode(nextName));
                      }
                    }}
                  />
                </div>

                <div className="form-group">
                  <div className="form-label-row">
                    <label className="form-label" htmlFor="chapter-code-input">
                      <span>Chapter Code</span>
                      <span className="required-star" aria-hidden="true">*</span>
                    </label>
                    {hasCustomChapterCode && chapterName.trim() ? (
                      <button
                        type="button"
                        className="chapter-code-auto-btn"
                        disabled={isLoading}
                        onClick={() => {
                          playClickPen(soundEnabled);
                          clearInvalid('chapterCode');
                          setHasCustomChapterCode(false);
                          setChapterCode(generateChapterCode(chapterName));
                        }}
                      >
                        Auto
                      </button>
                    ) : (
                      <span className="form-label-hint">Auto</span>
                    )}
                  </div>
                  <input
                    id="chapter-code-input"
                    type="text"
                    maxLength={32}
                    disabled={isLoading}
                    className={`form-control is-mono ${invalidFields['chapterCode'] ? 'input-invalid' : ''}`}
                    placeholder="Auto-generated"
                    value={chapterCode}
                    onChange={(e) => {
                      const nextCode = e.target.value.toUpperCase();
                      clearInvalid('chapterCode');
                      setChapterCode(nextCode);
                      setHasCustomChapterCode(nextCode.trim().length > 0);
                    }}
                  />
                </div>
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="head-name-input">
                    <span>Founding Chapter Head Full Name</span>
                    <span className="required-star" aria-hidden="true">*</span>
                  </label>
                </div>
                <input
                  id="head-name-input"
                  type="text"
                  disabled={isLoading}
                  className={`form-control ${invalidFields['headName'] ? 'input-invalid' : ''}`}
                  placeholder="Enter full name"
                  value={headName}
                  onChange={(e) => {
                    clearInvalid('headName');
                    setHeadName(e.target.value);
                  }}
                />
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="head-email-input">
                    <span>Official Head Email Address</span>
                    <span className="required-star" aria-hidden="true">*</span>
                  </label>
                </div>
                <input
                  id="head-email-input"
                  type="email"
                  disabled={isLoading}
                  className={`form-control ${invalidFields['headEmail'] ? 'input-invalid' : ''}`}
                  placeholder="name@example.org"
                  value={headEmail}
                  onChange={(e) => {
                    clearInvalid('headEmail');
                    setHeadEmail(e.target.value);
                  }}
                />
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label" htmlFor="initial-password-input">
                    <span>Create Initial Master Password (Min. 10 chars, uppercase &amp; numbers)</span>
                    <span className="required-star" aria-hidden="true">*</span>
                  </label>
                </div>
                <div className="input-control-wrap">
                  <input
                    id="initial-password-input"
                    type={showInitialPassword ? 'text' : 'password'}
                    maxLength={72}
                    disabled={isLoading}
                    className={`form-control has-toggle ${invalidFields['initialPassword'] ? 'input-invalid' : ''}`}
                    placeholder="Minimum 10 characters"
                    value={initialPassword}
                    onChange={(e) => {
                      clearInvalid('initialPassword');
                      setInitialPassword(e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    aria-label={showInitialPassword ? 'Hide master password' : 'Show master password'}
                    onClick={() => {
                      playClickPen(soundEnabled);
                      setShowInitialPassword((prev) => !prev);
                    }}
                  >
                    {showInitialPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-batcave-primary"
                aria-label={isLoading ? 'Establishing...' : 'Save & Invite Officers'}
              >
                <span>{isLoading ? 'Establishing...' : 'Save & Invite Officers'}</span>
              </button>
            </form>
          </section>
        )}
      </main>
    </BatCaveShell>
  );
}

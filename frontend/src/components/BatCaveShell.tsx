import { useCallback } from 'react';
import type { MouseEvent } from 'react';
import { HalftoneWaveCanvas } from './HalftoneWaveCanvas.tsx';
import type { ToastState } from './batcaveToast.ts';
import {
  handleGuardedHover,
  persistSoundsEnabled,
  playApplePay,
  playClickPen,
} from '../theme/batcaveAudio.ts';
import { useBatCaveTheme, type ThemePreference } from '../theme/batcaveTheme.ts';

interface BatCaveShellProps {
  soundEnabled: boolean;
  onToggleSound: (next: boolean) => void;
  toast: ToastState | null;
  toastExiting: boolean;
  onDismissToast: () => void;
  children: React.ReactNode;
}

export function BatCaveShell({
  soundEnabled,
  onToggleSound,
  toast,
  toastExiting,
  onDismissToast,
  children,
}: BatCaveShellProps) {
  const { preference, resolvedTheme, setThemeWithTransition } = useBatCaveTheme();

  const handleThemeSelect = useCallback(
    (nextTheme: ThemePreference, e: MouseEvent<HTMLButtonElement>) => {
      playClickPen(soundEnabled);
      setThemeWithTransition(nextTheme, e);
    },
    [soundEnabled, setThemeWithTransition],
  );

  function handleSoundToggle() {
    const next = !soundEnabled;
    onToggleSound(next);
    persistSoundsEnabled(next);
    playApplePay(true, true);
  }

  return (
    <>
      <div aria-hidden="true" className="backdrop-halftone-container has-canvas">
        <div className="stitch-flare-layer">
          <div className="stitch-flare stitch-flare-left" />
          <div className="stitch-flare stitch-flare-right" />
          <div className="stitch-flare stitch-flare-ambient" />
        </div>
        <HalftoneWaveCanvas theme={resolvedTheme} />
        <div className="halftone halftone-wide mask-tr" />
        <div className="halftone mask-bl" />
      </div>

      <header id="app-header" onPointerEnter={(e) => handleGuardedHover(e, soundEnabled)}>
        <div className="header-inner">
          <div className="brand-group" aria-label="Youth Service Philippines x 3 of Clubs">
            <img
              src="/assets/kamunggay/ysp-logo.png"
              alt="Youth Service Philippines Cebu"
              className="brand-ysp-mark"
              draggable={false}
            />
            <span className="brand-collab-x" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                <path
                  d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <img
              src="/assets/kamunggay/3-of-clubs.png"
              alt="3 of Clubs"
              className="brand-clubs-mark"
              draggable={false}
            />
          </div>

          <div className="system-controls">

            <div className="theme-switch" role="radiogroup" aria-label="Color theme">
              <button
                type="button"
                className={`theme-opt ${preference === 'system' ? 'is-active' : ''}`}
                id="theme-system-btn"
                data-theme="system"
                role="radio"
                aria-checked={preference === 'system'}
                title="System theme"
                aria-label="System theme"
                onClick={(e) => handleThemeSelect('system', e)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                className={`theme-opt ${preference === 'light' ? 'is-active' : ''}`}
                id="theme-light-btn"
                data-theme="light"
                role="radio"
                aria-checked={preference === 'light'}
                title="Light theme"
                aria-label="Light theme"
                onClick={(e) => handleThemeSelect('light', e)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
                  <path
                    d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className={`theme-opt ${preference === 'dark' ? 'is-active' : ''}`}
                id="theme-dark-btn"
                data-theme="dark"
                role="radio"
                aria-checked={preference === 'dark'}
                title="Dark theme"
                aria-label="Dark theme"
                onClick={(e) => handleThemeSelect('dark', e)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M20 13.6A8 8 0 1 1 10.4 4a6.2 6.2 0 0 0 9.6 9.6z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <button
              type="button"
              className={`sound-toggle-btn ${soundEnabled ? 'is-active' : ''}`}
              id="sound-toggle-btn"
              data-sound-toggle
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? 'Disable interface sounds' : 'Enable interface sounds'}
              title={soundEnabled ? 'Sound On' : 'Sound Off'}
              onClick={handleSoundToggle}
            >
              <svg
                data-sound-on
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className={soundEnabled ? undefined : 'hidden'}
              >
                <path
                  d="M5 10v4h3l4 3V7L8 10H5zM16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <svg
                data-sound-off
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className={soundEnabled ? 'hidden' : undefined}
              >
                <path
                  d="M5 10v4h3l4 3V7L8 10H5zM16 10l5 5M21 10l-5 5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {children}

      <div id="toast-container" aria-live="assertive" aria-atomic="true">
        {toast && (
          <div
            key={toast.id}
            className={`toast-pill toast-${toast.tone} ${toastExiting ? 'toast-exit' : ''}`}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <span className={`toast-dot toast-dot-${toast.tone}`} aria-hidden="true" />
            <span className="toast-message">{toast.text}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => {
                playClickPen(soundEnabled);
                onDismissToast();
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

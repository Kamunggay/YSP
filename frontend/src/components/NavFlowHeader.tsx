import type { ReactNode } from 'react';

interface NavFlowHeaderProps {
  headingId: string;
  title: string;
  subtitle: ReactNode;
  onBack?: (() => void) | undefined;
  disabled?: boolean | undefined;
}

/**
 * Shared borderless navigation header matching the BatCave onboarding/auth layout:
 * subtle top-left return chevron, bold pixel title & concise subtitle.
 */
export function NavFlowHeader({
  headingId,
  title,
  subtitle,
  onBack,
  disabled = false,
}: NavFlowHeaderProps) {
  return (
    <header className="nav-flow-header">
      {onBack ? (
        <button
          type="button"
          className="nav-back-btn"
          aria-label="Return"
          title="Return"
          disabled={disabled}
          onClick={onBack}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      ) : null}

      <div>
        <h1 id={headingId} className="form-card-title">
          {title}
        </h1>
        <p className="form-card-subtitle">{subtitle}</p>
      </div>
    </header>
  );
}

import { useState } from 'react';
import './login.css';
import './create-chapter.css';

export interface CreateChapterFormData {
  chapterName: string;
  chapterCode: string;
  headName: string;
  headEmail: string;
  initialPassword: string;
}

interface CreateChapterPageProps {
  initialData?: Partial<CreateChapterFormData>;
  onNavigateToLogin?: () => void;
  onSaveAndInvite?: (data: CreateChapterFormData) => void;
}

interface PhotoButtonProps {
  type?: 'button' | 'submit';
  unclickedSrc: string;
  clickedSrc: string;
  alt: string;
  className?: string;
  onClick?: (() => void) | undefined;
}

function PhotoButton({
  type = 'button',
  unclickedSrc,
  clickedSrc,
  alt,
  className = '',
  onClick,
}: PhotoButtonProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type={type}
      className={`kamunggay-photo-btn ${pressed ? 'is-active' : ''} ${className}`.trim()}
      aria-label={alt}
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') setPressed(true);
      }}
      onKeyUp={() => setPressed(false)}
      onBlur={() => setPressed(false)}
    >
      <img src={unclickedSrc} alt={alt} className="btn-unclicked" draggable={false} />
      <img src={clickedSrc} alt="" aria-hidden="true" className="btn-clicked" draggable={false} />
    </button>
  );
}

export function CreateChapterPage({
  initialData,
  onNavigateToLogin,
  onSaveAndInvite,
}: CreateChapterPageProps) {
  const [chapterName, setChapterName] = useState(initialData?.chapterName ?? '');
  const [chapterCode, setChapterCode] = useState(initialData?.chapterCode ?? '');
  const [headName, setHeadName] = useState(initialData?.headName ?? '');
  const [headEmail, setHeadEmail] = useState(initialData?.headEmail ?? '');
  const [initialPassword, setInitialPassword] = useState(initialData?.initialPassword ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (onSaveAndInvite) {
      onSaveAndInvite({
        chapterName,
        chapterCode,
        headName,
        headEmail,
        initialPassword,
      });
    }
  }

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

        <img
          src="/assets/kamunggay/the-appointed-message.png"
          alt="The appointed Chapter Head possesses exclusive operational authority to invite, assign duties, and revoke officer memberships in this chapter."
          className="create-chapter-banner"
          draggable={false}
        />

        <form className="create-chapter-form" onSubmit={handleSubmit} noValidate>
          <div className="create-chapter-row">
            <div className="create-chapter-group group-chapter-name">
              <label className="create-chapter-label" htmlFor="chapter-name-input">
                Chapter Name
              </label>
              <input
                id="chapter-name-input"
                type="text"
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
              className="create-chapter-input"
              value={initialPassword}
              onChange={(e) => setInitialPassword(e.target.value)}
            />
          </div>

          <div className="create-chapter-btn-stack">
            <PhotoButton
              type="submit"
              unclickedSrc="/assets/kamunggay/save-and-invite-officers.png"
              clickedSrc="/assets/kamunggay/save-and-invite-officers-when-clicked.png"
              alt="Save & Invite Officers"
            />
            <PhotoButton
              type="button"
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

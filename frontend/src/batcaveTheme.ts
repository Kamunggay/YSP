import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'smartdesk_theme';

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'system' || raw === 'light' || raw === 'dark') {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return 'system';
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyThemeToDom(isDark: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isDark ? '#0C0C0F' : '#FFFFFF');
  }
}

export function resolveIsDark(pref: ThemePreference, systemPrefersDark: boolean): boolean {
  return pref === 'dark' || (pref === 'system' && systemPrefersDark);
}

/** Synchronously apply persisted or system theme before React mounts. */
export function initInitialThemeClass(): void {
  applyThemeToDom(resolveIsDark(getStoredThemePreference(), getSystemPrefersDark()));
}

type DocumentWithTransition = Document & {
  startViewTransition?: (callback: () => void) => {
    ready: Promise<void>;
  };
};

export function useBatCaveTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => getStoredThemePreference());
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => getSystemPrefersDark());

  const resolvedTheme: ResolvedTheme = resolveIsDark(preference, systemPrefersDark) ? 'dark' : 'light';

  useEffect(() => {
    applyThemeToDom(resolvedTheme === 'dark');
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemPrefersDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  function setThemeWithTransition(
    nextPref: ThemePreference,
    event?: MouseEvent<HTMLButtonElement>
  ) {
    try {
      window.localStorage.setItem(STORAGE_KEY, nextPref);
    } catch {
      // ignore storage errors
    }

    const currentlyDark =
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    const nextDark = resolveIsDark(nextPref, systemPrefersDark);
    const needsVisualFlip = currentlyDark !== nextDark;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const doc = (typeof document !== 'undefined' ? document : null) as DocumentWithTransition | null;

    if (!needsVisualFlip || reducedMotion || !doc?.startViewTransition || !event) {
      setPreference(nextPref);
      applyThemeToDom(nextDark);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = doc.startViewTransition(() => {
      setPreference(nextPref);
      applyThemeToDom(nextDark);
    });

    void transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 520,
          easing: 'cubic-bezier(0.32, 0.08, 0.24, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    });
  }

  return { preference, resolvedTheme, setThemeWithTransition };
}

import { useEffect, useRef, useState } from 'react';
import { registerAudioUnlock } from '../theme/batcaveAudio.ts';

export interface ToastState {
  id: number;
  tone: 'success' | 'warning' | 'error' | 'info';
  text: string;
}

export function useBatCaveToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const idRef = useRef(0);

  function clearTimers() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }

  useEffect(() => {
    registerAudioUnlock();
    return () => clearTimers();
  }, []);

  function dismissToast() {
    clearTimers();
    setIsExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      setToast(null);
      setIsExiting(false);
      exitTimerRef.current = null;
    }, 180);
  }

  function showToast(next: Omit<ToastState, 'id'>, durationMs = 3400) {
    clearTimers();
    setIsExiting(false);
    idRef.current += 1;
    setToast({ id: idRef.current, ...next });
    timerRef.current = window.setTimeout(() => {
      dismissToast();
    }, durationMs);
  }

  return { toast, isExiting, showToast, dismissToast };
}

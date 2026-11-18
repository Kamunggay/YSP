import type { PointerEvent as ReactPointerEvent } from 'react';

const SOUND_STORAGE_KEY = 'smartdesk_sounds_enabled';

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let unlockBound = false;
let lastHoverTime = 0;
let lastScribblenautsTime = 0;
let lastOutageSoundTime = 0;

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getShortNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    // Exponentially decaying impulse noise for crisp mechanical switch transients.
    data[i] = (Math.random() * 2 - 1) * Math.exp((-i / length) * 7.5);
  }
  noiseBuffer = buffer;
  return buffer;
}

/**
 * Registers one-time passive pointerdown and keydown listeners to unlock AudioContext
 * early per BatCave Design v1.4.0 §9.1.
 */
export function registerAudioUnlock(): void {
  if (typeof window === 'undefined' || unlockBound) return;
  unlockBound = true;
  const unlock = () => {
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === 'running') {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

export function getInitialSoundsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const saved = window.localStorage.getItem(SOUND_STORAGE_KEY);
    if (saved === 'false') return false;
  } catch {
    // ignore storage errors
  }
  return true;
}

export function persistSoundsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
}

/**
 * Shimmer Reverb Chain per BatCave Design v1.4.0 §9.3:
 * Delay(0.1s) -> BiquadFilter(lowpass 4200Hz) -> Feedback(0.24) + Wet(0.18).
 */
function applyShimmerReverb(ctx: AudioContext, masterNode: AudioNode): void {
  const delay = ctx.createDelay(0.5);
  delay.delayTime.setValueAtTime(0.1, ctx.currentTime);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(4200, ctx.currentTime);

  const feedback = ctx.createGain();
  feedback.gain.setValueAtTime(0.24, ctx.currentTime);

  const wet = ctx.createGain();
  wet.gain.setValueAtTime(0.18, ctx.currentTime);

  masterNode.connect(delay);
  delay.connect(filter);
  filter.connect(feedback);
  feedback.connect(delay);
  filter.connect(wet);
  wet.connect(ctx.destination);

  window.setTimeout(() => {
    try {
      masterNode.disconnect();
      delay.disconnect();
      filter.disconnect();
      feedback.disconnect();
      wet.disconnect();
    } catch {
      // ignore already disconnected nodes
    }
  }, 780);
}

/** Synthesizes the exact 2-note Apple Pay confirmation chime (§9.3). */
export function playApplePay(enabled = true, forcePlay = false): void {
  if (!enabled && !forcePlay) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.38, t);
  master.connect(ctx.destination);
  applyShimmerReverb(ctx, master);

  const partials: ReadonlyArray<{
    freq: number;
    offset: number;
    decay: number;
    peak: number;
    stop: number;
  }> = [
    { freq: 1046.5, offset: 0.0, decay: 0.22, peak: 0.2, stop: 0.245 },
    { freq: 2093.0, offset: 0.0, decay: 0.15, peak: 0.05, stop: 0.175 },
    { freq: 1568.0, offset: 0.085, decay: 0.35, peak: 0.24, stop: 0.46 },
    { freq: 3136.0, offset: 0.085, decay: 0.28, peak: 0.06, stop: 0.39 },
  ];

  for (const part of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = t + part.offset;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(part.freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(part.peak, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + part.decay);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(t + part.stop);
  }
}

/** Mechanical typewriter tick (gain 0.40, 100ms throttle, §9.2). */
export function playTypewriter(enabled = true): void {
  if (!enabled) return;
  const now = performance.now();
  if (now - lastHoverTime < 100) return;
  lastHoverTime = now;

  const ctx = ensureAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.4, t);
  master.connect(ctx.destination);

  // Crisp striker noise transient
  const src = ctx.createBufferSource();
  src.buffer = getShortNoiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2850, t);
  bp.Q.setValueAtTime(2.4, t);
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.32, t);
  nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.022);
  src.connect(bp);
  bp.connect(nGain);
  nGain.connect(master);
  src.start(t);
  src.stop(t + 0.025);

  // Subtle keybed body thud
  const body = ctx.createOscillator();
  const bGain = ctx.createGain();
  body.type = 'triangle';
  body.frequency.setValueAtTime(420, t);
  body.frequency.exponentialRampToValueAtTime(140, t + 0.018);
  bGain.gain.setValueAtTime(0.18, t);
  bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
  body.connect(bGain);
  bGain.connect(master);
  body.start(t);
  body.stop(t + 0.022);
}

/** Boundary-guarded hover helper (§12) so child pointer moves never re-trigger. */
export function handleGuardedHover(
  e: ReactPointerEvent<HTMLElement>,
  enabled: boolean
): void {
  const related = e.relatedTarget;
  if (related instanceof Node && e.currentTarget.contains(related)) {
    return;
  }
  playTypewriter(enabled);
}

/** Retractable ballpoint pen click (gain 0.55, §9.2) for theme, navigation & button controls. */
export function playClickPen(enabled = true): void {
  if (!enabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.55, t);
  master.connect(ctx.destination);

  // Two-stage spring latch click (press + latch seat)
  const stages = [
    { offset: 0.0, freq: 3400, q: 3.0, gain: 0.45 },
    { offset: 0.022, freq: 2150, q: 3.8, gain: 0.65 },
  ];

  for (const s of stages) {
    const src = ctx.createBufferSource();
    src.buffer = getShortNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(s.freq, t + s.offset);
    filter.Q.setValueAtTime(s.q, t + s.offset);

    const g = ctx.createGain();
    g.gain.setValueAtTime(s.gain, t + s.offset);
    g.gain.exponentialRampToValueAtTime(0.001, t + s.offset + 0.018);

    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t + s.offset);
    src.stop(t + s.offset + 0.022);
  }
}

/** Tactile key-pop / copy chime (gain 0.65, 100ms throttle, §9.2). */
export function playScribblenauts(enabled = true): void {
  if (!enabled) return;
  const now = performance.now();
  if (now - lastScribblenautsTime < 100) return;
  lastScribblenautsTime = now;

  const ctx = ensureAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.65, t);
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(740, t);
  osc.frequency.exponentialRampToValueAtTime(1420, t + 0.032);
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.28, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + 0.075);
}

/** Switch notification cue (gain 0.60, 200ms throttle, §9.2). */
export function playOutageSwitch(enabled = true): void {
  if (!enabled) return;
  const now = performance.now();
  if (now - lastOutageSoundTime < 200) return;
  lastOutageSoundTime = now;

  const ctx = ensureAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.6, t);
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(820, t);
  osc.frequency.exponentialRampToValueAtTime(1120, t + 0.05);
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + 0.085);
}

/** Soft lowpulse warning tone for rejected credentials / validation errors. */
export function playErrorTone(enabled = true): void {
  if (!enabled) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(210, t);
  osc.frequency.exponentialRampToValueAtTime(135, t + 0.14);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(720, t);

  g.gain.setValueAtTime(0.14, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

  osc.connect(filter);
  filter.connect(g);
  g.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.17);
}

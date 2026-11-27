import { useEffect, useRef } from 'react';
import type { ResolvedTheme } from '../theme/batcaveTheme.ts';

const GRID_SPACING = 15;
const DOT_RADIUS = 0.75;
const POINTER_RADIUS = 173;
const POINTER_RADIUS_SQ = POINTER_RADIUS * POINTER_RADIUS;
const REPULSION = 21.9;
const GROWTH = 1.18;
const LUMINESCENCE = 0.86;
const TIME_STEP = 0.024;
const WAVE_AMPLITUDE = 2.25;
const WAVE_FREQUENCY = 0.024;
const SHIMMER_TIME_MULT = 1.4;
const SHIMMER_X_FREQ = 0.018;
const SHIMMER_AMP = 0.08;
const SPRING_LERP = 0.12;
const HIGHLIGHT_THRESHOLD = 0.08;
const MAX_DPR = 2;
const RESIZE_DEBOUNCE_MS = 100;

// Quantize alpha [0.12..1.00] into 12 steps * 2 color states (24 static buckets) for zero per-frame allocations.
const ALPHA_STEPS = 12;
const TOTAL_BUCKETS = ALPHA_STEPS * 2;

function buildStylePalette(rgb: string): string[] {
  const styles: string[] = [];
  for (let i = 0; i < ALPHA_STEPS; i++) {
    const alpha = 0.12 + (i / (ALPHA_STEPS - 1)) * 0.88;
    styles.push(`rgba(${rgb}, ${alpha.toFixed(3)})`);
  }
  return styles;
}

const DARK_BASE_STYLES = buildStylePalette('167, 139, 250');
const DARK_GLOW_STYLES = buildStylePalette('196, 181, 253');
const LIGHT_BASE_STYLES = buildStylePalette('139, 92, 246');
const LIGHT_GLOW_STYLES = buildStylePalette('99, 102, 241');

interface HalftoneWaveCanvasProps {
  theme: ResolvedTheme;
}

/**
 * Interactive Halftone Canvas Engine matching BatCave Design System v1.4.0 §8.2
 * with YSP Cebu palette luminescence & pre-allocated bucketed path batching.
 */
export function HalftoneWaveCanvas({ theme }: HalftoneWaveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef<ResolvedTheme>(theme);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let count = 0;
    let time = 0;
    let animId = 0;
    let resizeTimer: number | null = null;
    let isHidden = document.hidden;

    let originX = new Float32Array(0);
    let originY = new Float32Array(0);
    let posX = new Float32Array(0);
    let posY = new Float32Array(0);
    let baseAlpha = new Float32Array(0);
    let dotRadius = new Float32Array(0);
    let bucketNext = new Int32Array(0);
    const bucketHead = new Int32Array(TOTAL_BUCKETS);

    const mouse = { x: -9999, y: -9999, active: false };
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      if (!canvas || !ctx) return;
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.ceil(width / GRID_SPACING) + 2;
      const rows = Math.ceil(height / GRID_SPACING) + 2;
      const startX = (width % GRID_SPACING) / 2;
      const startY = (height % GRID_SPACING) / 2;
      count = cols * rows;

      originX = new Float32Array(count);
      originY = new Float32Array(count);
      posX = new Float32Array(count);
      posY = new Float32Array(count);
      baseAlpha = new Float32Array(count);
      dotRadius = new Float32Array(count);
      bucketNext = new Int32Array(count);

      let idx = 0;
      for (let r = 0; r < rows; r++) {
        const y = startY + (r - 0.5) * GRID_SPACING;
        for (let c = 0; c < cols; c++) {
          const x = startX + (c - 0.5) * GRID_SPACING;
          originX[idx] = x;
          originY[idx] = y;
          posX[idx] = x;
          posY[idx] = y;
          baseAlpha[idx] = 0.22 + (Math.sin(0.5 * c) * Math.cos(0.5 * r) + 1) * 0.08;
          idx++;
        }
      }
    }

    function tick(advanceTime: boolean) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      if (advanceTime) {
        time += TIME_STEP;
      }

      const mx = mouse.x;
      const my = mouse.y;
      const pointerActive = mouse.active;
      const isDark = themeRef.current === 'dark';

      for (let b = 0; b < TOTAL_BUCKETS; b++) {
        bucketHead[b] = -1;
      }

      for (let i = 0; i < count; i++) {
        const ox = originX[i] ?? 0;
        const oy = originY[i] ?? 0;

        const waveX = Math.sin(time + WAVE_FREQUENCY * oy) * WAVE_AMPLITUDE;
        const waveY = Math.cos(time + WAVE_FREQUENCY * ox) * WAVE_AMPLITUDE;

        let targetX = ox + waveX;
        let targetY = oy + waveY;
        let proximityForce = 0;

        if (pointerActive) {
          const dx = mx - targetX;
          const dy = my - targetY;
          const distSq = dx * dx + dy * dy;

          if (distSq < POINTER_RADIUS_SQ && distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const force = 1 - dist / POINTER_RADIUS;
            proximityForce = force * force;
            const invDist = 1 / dist;
            targetX -= dx * invDist * force * REPULSION;
            targetY -= dy * invDist * force * REPULSION;
          }
        }

        const x = (posX[i] ?? ox) + (targetX - (posX[i] ?? ox)) * SPRING_LERP;
        const y = (posY[i] ?? oy) + (targetY - (posY[i] ?? oy)) * SPRING_LERP;
        posX[i] = x;
        posY[i] = y;

        dotRadius[i] = DOT_RADIUS + GROWTH * proximityForce;
        const waveShimmer = Math.sin(SHIMMER_TIME_MULT * time + SHIMMER_X_FREQ * ox) * SHIMMER_AMP;
        const rawAlpha = (baseAlpha[i] ?? 0.22) + waveShimmer + LUMINESCENCE * proximityForce;
        const alpha = Math.min(1.0, Math.max(0.12, rawAlpha));

        let step = Math.round(((alpha - 0.12) / 0.88) * (ALPHA_STEPS - 1));
        if (step < 0) step = 0;
        if (step >= ALPHA_STEPS) step = ALPHA_STEPS - 1;

        const bucketIdx = proximityForce > HIGHLIGHT_THRESHOLD ? ALPHA_STEPS + step : step;
        bucketNext[i] = bucketHead[bucketIdx] ?? -1;
        bucketHead[bucketIdx] = i;
      }

      const basePalette = isDark ? DARK_BASE_STYLES : LIGHT_BASE_STYLES;
      const glowPalette = isDark ? DARK_GLOW_STYLES : LIGHT_GLOW_STYLES;

      for (let b = 0; b < TOTAL_BUCKETS; b++) {
        let idx = bucketHead[b] ?? -1;
        if (idx === -1) continue;

        ctx.fillStyle =
          b >= ALPHA_STEPS
            ? (glowPalette[b - ALPHA_STEPS] ?? glowPalette[0] ?? 'rgba(196, 181, 253, 0.5)')
            : (basePalette[b] ?? basePalette[0] ?? 'rgba(139, 92, 246, 0.5)');

        ctx.beginPath();
        while (idx !== -1) {
          const x = posX[idx] ?? 0;
          const y = posY[idx] ?? 0;
          const r = dotRadius[idx] ?? DOT_RADIUS;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
          idx = bucketNext[idx] ?? -1;
        }
        ctx.fill();
      }
    }

    function loop() {
      if (isHidden) return;
      tick(true);
      animId = window.requestAnimationFrame(loop);
    }

    function onPointerMove(e: PointerEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    }

    function onPointerLeave() {
      mouse.active = false;
    }

    function onResize() {
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(() => {
        resize();
        if (prefersReducedMotion) {
          tick(false);
        }
      }, RESIZE_DEBOUNCE_MS);
    }

    function onVisibilityChange() {
      isHidden = document.hidden;
      window.cancelAnimationFrame(animId);
      if (!isHidden && !prefersReducedMotion) {
        animId = window.requestAnimationFrame(loop);
      }
    }

    resize();
    if (prefersReducedMotion) {
      tick(false);
    } else if (!isHidden) {
      animId = window.requestAnimationFrame(loop);
    }

    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.cancelAnimationFrame(animId);
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return <canvas id="halftone-canvas" ref={canvasRef} className="halftone-canvas" />;
}

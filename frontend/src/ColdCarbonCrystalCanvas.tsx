import { useEffect, useRef } from 'react';

const MAX_DPR = 2;
const SMOKE_PUFF_COUNT = 44;
const FIELD_W = 256;
const FIELD_H = 384;

// Exact 64-slice horizontal crystal contour [leftU, rightU, uvY] measured from the reference crystal image
const CRYSTAL_CONTOUR_SLICES: ReadonlyArray<readonly [number, number, number]> = [
  [0.7500, 0.7656, 0.0651], [0.6895, 0.7910, 0.0794], [0.5977, 0.8086, 0.0924], [0.5723, 0.8184, 0.1068],
  [0.5391, 0.8359, 0.1198], [0.4551, 0.8496, 0.1341], [0.4395, 0.8496, 0.1484], [0.4258, 0.8477, 0.1615],
  [0.4082, 0.8477, 0.1758], [0.3965, 0.8496, 0.1888], [0.3848, 0.8535, 0.2031], [0.3770, 0.8574, 0.2174],
  [0.3711, 0.8711, 0.2305], [0.3574, 0.8750, 0.2448], [0.3477, 0.8730, 0.2578], [0.3320, 0.8730, 0.2721],
  [0.3086, 0.8848, 0.2865], [0.2773, 0.8965, 0.2995], [0.2617, 0.9023, 0.3138], [0.2344, 0.9023, 0.3268],
  [0.2090, 0.9043, 0.3411], [0.1992, 0.9082, 0.3555], [0.1934, 0.9043, 0.3685], [0.1914, 0.8965, 0.3828],
  [0.1875, 0.8887, 0.3958], [0.1836, 0.8789, 0.4102], [0.1758, 0.8711, 0.4245], [0.1680, 0.8652, 0.4375],
  [0.1621, 0.8574, 0.4518], [0.1563, 0.8496, 0.4648], [0.1504, 0.8398, 0.4792], [0.1328, 0.8301, 0.4935],
  [0.1230, 0.8242, 0.5065], [0.1152, 0.8223, 0.5208], [0.1074, 0.8223, 0.5352], [0.1016, 0.8203, 0.5482],
  [0.0938, 0.8164, 0.5625], [0.1016, 0.8125, 0.5755], [0.1191, 0.8164, 0.5898], [0.1328, 0.8223, 0.6042],
  [0.1484, 0.8281, 0.6172], [0.1680, 0.8340, 0.6315], [0.1777, 0.8281, 0.6445], [0.1836, 0.8164, 0.6589],
  [0.1914, 0.8125, 0.6732], [0.1973, 0.7988, 0.6862], [0.2051, 0.7891, 0.7005], [0.2266, 0.7832, 0.7135],
  [0.2637, 0.7832, 0.7279], [0.2813, 0.7832, 0.7422], [0.2930, 0.7852, 0.7552], [0.2988, 0.7871, 0.7695],
  [0.3066, 0.7813, 0.7826], [0.3223, 0.7754, 0.7969], [0.3359, 0.7695, 0.8112], [0.3438, 0.7695, 0.8242],
  [0.3613, 0.7559, 0.8385], [0.3848, 0.7305, 0.8516], [0.4180, 0.6875, 0.8659], [0.4453, 0.6738, 0.8802],
  [0.4648, 0.6582, 0.8932], [0.4824, 0.6406, 0.9076], [0.4961, 0.5664, 0.9206], [0.5176, 0.5293, 0.9349],
];

interface CrystalMeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  perimeterPoints: Float32Array;
  perimeterNormals: Float32Array;
  perimeterCount: number;
}

interface SmokePuff {
  localX: number;
  localY: number;
  localZ: number;
  normX: number;
  normY: number;
  normZ: number;
  driftOut: number;
  sinkY: number;
  swirlAngle: number;
  vSwirl: number;
  size: number;
  spin: number;
  vSpin: number;
  phase: number;
  life: number;
  maxLife: number;
  alpha: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sampleContourAtUvY(uvY: number): { leftU: number; rightU: number; inside: boolean } {
  const minY = 0.0651;
  const maxY = 0.9349;
  if (uvY < minY || uvY > maxY) {
    const edgeSlice = uvY < minY ? CRYSTAL_CONTOUR_SLICES[0] : CRYSTAL_CONTOUR_SLICES[CRYSTAL_CONTOUR_SLICES.length - 1];
    const uMid = edgeSlice ? 0.5 * (edgeSlice[0] + edgeSlice[1]) : 0.5;
    return { leftU: uMid, rightU: uMid, inside: false };
  }

  const t = clamp((uvY - minY) / (maxY - minY), 0, 1);
  const maxIdx = CRYSTAL_CONTOUR_SLICES.length - 1;
  const f = t * maxIdx;
  const i0 = Math.max(0, Math.floor(f) - 1);
  const i1 = Math.floor(f);
  const i2 = Math.min(maxIdx, i1 + 1);
  const i3 = Math.min(maxIdx, i1 + 2);
  const frac = f - i1;

  const s0 = CRYSTAL_CONTOUR_SLICES[i0] ?? [0.5, 0.5, 0.5];
  const s1 = CRYSTAL_CONTOUR_SLICES[i1] ?? [0.5, 0.5, 0.5];
  const s2 = CRYSTAL_CONTOUR_SLICES[i2] ?? [0.5, 0.5, 0.5];
  const s3 = CRYSTAL_CONTOUR_SLICES[i3] ?? [0.5, 0.5, 0.5];

  const l1 = s0[0] * 0.2 + s1[0] * 0.6 + s2[0] * 0.2;
  const l2 = s1[0] * 0.2 + s2[0] * 0.6 + s3[0] * 0.2;
  const r1 = s0[1] * 0.2 + s1[1] * 0.6 + s2[1] * 0.2;
  const r2 = s1[1] * 0.2 + s2[1] * 0.6 + s3[1] * 0.2;

  return {
    leftU: lerp(l1, l2, frac),
    rightU: lerp(r1, r2, frac),
    inside: true,
  };
}

// Separable 1D + 1D Gaussian blur on a 2D Float32 grid for C-infinity smooth, zero-pixelation smoke fields
function gaussianBlur2D(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const radius = Math.min(48, Math.ceil(sigma * 2.8));
  const kernel = new Float32Array(radius * 2 + 1);
  let kSum = 0;
  const inv2SigmaSq = 1 / (2 * sigma * sigma);
  for (let k = -radius; k <= radius; k++) {
    const wgt = Math.exp(-k * k * inv2SigmaSq);
    kernel[k + radius] = wgt;
    kSum += wgt;
  }
  for (let k = 0; k < kernel.length; k++) {
    kernel[k] = (kernel[k] ?? 0) / kSum;
  }

  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = clamp(x + k, 0, w - 1);
        acc += (src[rowOff + sx] ?? 0) * (kernel[k + radius] ?? 0);
      }
      tmp[rowOff + x] = acc;
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = clamp(y + k, 0, h - 1);
        acc += (tmp[sy * w + x] ?? 0) * (kernel[k + radius] ?? 0);
      }
      dst[y * w + x] = acc;
    }
  }

  return dst;
}

/**
 * Precomputes a 4-channel ultra-smooth Gaussian smoke emission field directly from the crystal contour:
 * R = tight boundary skin, G = close sublimation aura, B = mid cold plume, A = sinking dry-ice cascade
 */
function buildSmoothSmokeFieldTexture(): Uint8Array {
  const rawMask = new Float32Array(FIELD_W * FIELD_H);
  const rimMask = new Float32Array(FIELD_W * FIELD_H);

  for (let y = 0; y < FIELD_H; y++) {
    const uvY = y / (FIELD_H - 1);
    const { leftU, rightU, inside } = sampleContourAtUvY(uvY);
    if (!inside) continue;

    for (let x = 0; x < FIELD_W; x++) {
      const u = x / (FIELD_W - 1);
      const halfW = Math.max(0.005, 0.5 * (rightU - leftU));
      const midU = 0.5 * (leftU + rightU);
      const normDist = Math.abs(u - midU) / halfW;

      // Smooth anti-aliased interior mask
      const bodyCov = smoothstep(1.04, 0.90, normDist);
      rawMask[y * FIELD_W + x] = bodyCov;

      // Concentrate primary cold-carbon sublimation right along the crystal perimeter & facets
      const edgeRing = Math.exp(-Math.pow((normDist - 0.86) / 0.28, 2)) * smoothstep(1.22, 0.85, normDist);
      rimMask[y * FIELD_W + x] = Math.max(edgeRing, bodyCov * 0.42);
    }
  }

  const tightLayer = gaussianBlur2D(rimMask, FIELD_W, FIELD_H, 4.2);
  const midLayer = gaussianBlur2D(rimMask, FIELD_W, FIELD_H, 11.5);
  const wideLayer = gaussianBlur2D(rawMask, FIELD_W, FIELD_H, 22.0);

  const out = new Uint8Array(FIELD_W * FIELD_H * 4);
  for (let y = 0; y < FIELD_H; y++) {
    const v = y / (FIELD_H - 1);
    // Smooth window that guarantees 0.0 at the top and bottom texture borders so CLAMP_TO_EDGE never smears
    const vFade = smoothstep(0.01, 0.11, v) * smoothstep(0.99, 0.89, v);
    // Shift cascade channel slightly upward in source lookup so smoke drapes downward below crystal
    const srcUpY = Math.max(0, y - 10);
    for (let x = 0; x < FIELD_W; x++) {
      const u = x / (FIELD_W - 1);
      const uFade = smoothstep(0.01, 0.12, u) * smoothstep(0.99, 0.88, u);
      const borderFade = uFade * vFade;

      const i = y * FIELD_W + x;
      const iUp = srcUpY * FIELD_W + x;
      out[i * 4] = Math.min(255, Math.round((tightLayer[i] ?? 0) * borderFade * 255));
      out[i * 4 + 1] = Math.min(255, Math.round((midLayer[i] ?? 0) * borderFade * 255));
      out[i * 4 + 2] = Math.min(255, Math.round((wideLayer[i] ?? 0) * borderFade * 255));
      out[i * 4 + 3] = Math.min(255, Math.round((wideLayer[iUp] ?? 0) * borderFade * 255));
    }
  }
  return out;
}

/**
 * Builds a 1:1 UV-mapped 3D sculpted relief crystal mesh so the photo texture is 100% undistorted
 * while providing genuine 3D facet depth and perspective parallax during gentle left-right turning.
 */
function buildReliefCrystalMesh(): CrystalMeshData {
  const cols = 96;
  const rows = 144;
  const vCount = (cols + 1) * (rows + 1);

  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);

  const heightScale = 2.18;
  const widthScale = heightScale * (512 / 768);

  const perimeterListPos: number[] = [];
  const perimeterListNorm: number[] = [];

  function computeReliefZ(u: number, v: number): number {
    const { leftU, rightU, inside } = sampleContourAtUvY(v);
    if (!inside) return 0;

    const midU = 0.5 * (leftU + rightU);
    const halfU = Math.max(0.008, 0.5 * (rightU - leftU));
    const c = (u - midU) / halfU;
    if (Math.abs(c) >= 1.05) return 0;

    const radialIn = clamp(1.0 - c * c, 0, 1);
    const baseDome = Math.pow(radialIn, 0.62);

    // Sculpt the prominent crystal facet ridges matching the photo's central kite plane & side bevels
    const tY = clamp((v - 0.0651) / (0.9349 - 0.0651), 0, 1);
    const leftRidgeC = -0.22 + 0.14 * (tY - 0.5);
    const rightRidgeC = 0.36 - 0.10 * (tY - 0.5);

    const ridgeL = Math.exp(-Math.pow((c - leftRidgeC) / 0.28, 2)) * 0.12;
    const ridgeR = Math.exp(-Math.pow((c - rightRidgeC) / 0.26, 2)) * 0.10;
    const centerFacet = smoothstep(0.48, 0.0, Math.abs(c - 0.05)) * 0.08;
    const upperStep = Math.exp(-Math.pow((tY - 0.36) / 0.09, 2)) * 0.05;
    const lowerStep = Math.exp(-Math.pow((tY - 0.74) / 0.08, 2)) * 0.04;

    const tipFade = smoothstep(0.0, 0.07, tY) * smoothstep(1.0, 0.92, tY);
    const thickness = (0.18 + 0.24 * (rightU - leftU)) * (0.35 + 0.65 * tipFade);

    return thickness * baseDome * (0.85 + ridgeL + ridgeR + centerFacet + upperStep + lowerStep);
  }

  for (let r = 0; r <= rows; r++) {
    const v = 0.03 + (r / rows) * 0.94;
    const worldY = (0.5 - v) * heightScale;
    const { leftU, rightU, inside } = sampleContourAtUvY(v);
    const midU = 0.5 * (leftU + rightU);
    const halfU = Math.max(0.008, 0.5 * (rightU - leftU));

    for (let c = 0; c <= cols; c++) {
      const u = 0.05 + (c / cols) * 0.90;
      const worldX = (u - 0.5) * widthScale;
      const worldZ = computeReliefZ(u, v);

      const idx = r * (cols + 1) + c;
      positions[idx * 3] = worldX;
      positions[idx * 3 + 1] = worldY;
      positions[idx * 3 + 2] = worldZ;

      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;

      // Record points right along the crystal contour & facet ridges for surface-locked vapor puffs
      if (inside && (r % 2 === 0) && (c % 2 === 0)) {
        const rel = Math.abs(u - midU) / halfU;
        if (rel >= 0.45 && rel <= 0.98) {
          perimeterListPos.push(worldX, worldY, worldZ);
          const nx = clamp((u - midU) / halfU, -1, 1) * 0.85;
          const ny = (0.5 - v) * 0.35;
          const nz = 0.52;
          const nLen = Math.hypot(nx, ny, nz) || 1;
          perimeterListNorm.push(nx / nLen, ny / nLen, nz / nLen);
        }
      }
    }
  }

  const quadCount = cols * rows;
  const indices = new Uint16Array(quadCount * 6);
  let ptr = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i00 = r * (cols + 1) + c;
      const i10 = i00 + 1;
      const i01 = (r + 1) * (cols + 1) + c;
      const i11 = i01 + 1;

      indices[ptr++] = i00;
      indices[ptr++] = i01;
      indices[ptr++] = i10;

      indices[ptr++] = i10;
      indices[ptr++] = i01;
      indices[ptr++] = i11;
    }
  }

  // Compute smooth vertex normals from the 3D relief surface
  const totalTris = quadCount * 2;
  for (let tIdx = 0; tIdx < totalTris; tIdx++) {
    const a = indices[tIdx * 3] ?? 0;
    const b = indices[tIdx * 3 + 1] ?? 0;
    const d = indices[tIdx * 3 + 2] ?? 0;

    const ax = positions[a * 3] ?? 0;
    const ay = positions[a * 3 + 1] ?? 0;
    const az = positions[a * 3 + 2] ?? 0;
    const bx = positions[b * 3] ?? 0;
    const by = positions[b * 3 + 1] ?? 0;
    const bz = positions[b * 3 + 2] ?? 0;
    const dx = positions[d * 3] ?? 0;
    const dy = positions[d * 3 + 1] ?? 0;
    const dz = positions[d * 3 + 2] ?? 0;

    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = dx - ax;
    const e2y = dy - ay;
    const e2z = dz - az;

    const fnx = e1y * e2z - e1z * e2y;
    const fny = e1z * e2x - e1x * e2z;
    const fnz = e1x * e2y - e1y * e2x;

    normals[a * 3] = (normals[a * 3] ?? 0) + fnx;
    normals[a * 3 + 1] = (normals[a * 3 + 1] ?? 0) + fny;
    normals[a * 3 + 2] = (normals[a * 3 + 2] ?? 0) + fnz;

    normals[b * 3] = (normals[b * 3] ?? 0) + fnx;
    normals[b * 3 + 1] = (normals[b * 3 + 1] ?? 0) + fny;
    normals[b * 3 + 2] = (normals[b * 3 + 2] ?? 0) + fnz;

    normals[d * 3] = (normals[d * 3] ?? 0) + fnx;
    normals[d * 3 + 1] = (normals[d * 3 + 1] ?? 0) + fny;
    normals[d * 3 + 2] = (normals[d * 3 + 2] ?? 0) + fnz;
  }

  for (let i = 0; i < vCount; i++) {
    const nx = normals[i * 3] ?? 0;
    const ny = normals[i * 3 + 1] ?? 0;
    const nz = normals[i * 3 + 2] ?? 1;
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = ny / len;
    normals[i * 3 + 2] = nz / len;
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    perimeterPoints: new Float32Array(perimeterListPos),
    perimeterNormals: new Float32Array(perimeterListNorm),
    perimeterCount: Math.floor(perimeterListPos.length / 3),
  };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Unable to create WebGL2 shader');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error(`WebGL2 shader compile failed: ${info}`);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error('Unable to create WebGL2 program');
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? 'Unknown link error';
    gl.deleteProgram(program);
    throw new Error(`WebGL2 program link failed: ${info}`);
  }
  return program;
}

// ---------------------------------------------------------------------------
// Pass 0 — Silky Grid-Free Volumetric Cold-Carbon Smoke Shader
// Uses pre-blurred Gaussian contour fields + C-infinity trigonometric curl billows
// ---------------------------------------------------------------------------
const AURA_VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 aQuadPos;
out vec2 vUv;
void main() {
  vUv = aQuadPos * 0.5 + 0.5;
  gl_Position = vec4(aQuadPos, 0.0, 1.0);
}
`;

const AURA_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;

uniform sampler2D uSmokeFieldTex;
uniform float uTime;
uniform float uIsDark;
uniform vec2 uAspectScale;
uniform float uYaw;
uniform float uBobY;
uniform float uGlowPulse;

out vec4 fragColor;

// 100% Grid-Free C-Infinity Smooth Harmonic Curl Waves (zero floor/hash pixelation!)
vec2 smoothCurlField(vec2 p, float t) {
  vec2 p1 = p * 2.1 + vec2(0.0, t * 0.24);
  float wx1 = sin(p1.y * 1.4 + cos(p1.x * 1.3 - t * 0.18));
  float wy1 = cos(p1.x * 1.4 + sin(p1.y * 1.2 + t * 0.21));

  mat2 rot1 = mat2(0.766, -0.643, 0.643, 0.766);
  vec2 p2 = rot1 * p * 3.5 + vec2(wx1 * 0.55, t * 0.36);
  float wx2 = sin(p2.y * 1.3 - sin(p2.x * 1.2 + t * 0.27));
  float wy2 = cos(p2.x * 1.3 + cos(p2.y * 1.2 - t * 0.23));

  mat2 rot2 = mat2(0.540, 0.841, -0.841, 0.540);
  vec2 p3 = rot2 * p * 5.4 + vec2(wy2 * 0.45, t * 0.48);
  float wx3 = sin(p3.y + cos(p3.x - t * 0.32));
  float wy3 = cos(p3.x - sin(p3.y + t * 0.29));

  return vec2(
    0.52 * wx1 + 0.31 * wx2 + 0.17 * wx3,
    0.52 * wy1 + 0.31 * wy2 + 0.17 * wy3
  );
}

void main() {
  vec2 edgeAbs = abs(vUv - 0.5) * 2.0;
  float outerFade = smoothstep(0.98, 0.62, edgeAbs.x) * smoothstep(0.98, 0.62, edgeAbs.y);

  // Convert screen UV into crystal texture UV space locked to current bob & gentle yaw turn
  vec2 worldXY = (vUv - 0.5) * uAspectScale * 2.78;
  worldXY.y -= uBobY;

  float heightScale = 2.18;
  float widthScale = heightScale * (512.0 / 768.0);
  float cosYaw = max(0.85, cos(uYaw));

  // Notice: in texture space v=0 is top, v=1 is bottom
  vec2 crystalUv = vec2(
    0.5 + (worldXY.x / (widthScale * cosYaw)) + sin(uYaw) * 0.04,
    0.5 - (worldXY.y / heightScale)
  );

  // Smooth analytical bounds fade in crystal UV space so vapor never reaches or clamps at UV 0..1 edges
  float crystalBoundsFade =
    smoothstep(0.01, 0.13, crystalUv.x) *
    smoothstep(0.99, 0.87, crystalUv.x) *
    smoothstep(0.01, 0.11, crystalUv.y) *
    smoothstep(0.99, 0.89, crystalUv.y);

  // Evaluate silky laminar cold-carbon curl billows around the crystal
  vec2 curlA = smoothCurlField(worldXY * 1.15, uTime * 0.95);
  vec2 curlB = smoothCurlField(worldXY * 2.05 + curlA * 0.48, uTime * 1.25);

  float wispA = clamp(0.5 + 0.5 * (curlA.x * 0.65 + curlB.y * 0.35), 0.0, 1.0);
  float wispB = clamp(0.5 + 0.5 * (curlB.x * 0.60 - curlA.y * 0.40), 0.0, 1.0);
  // High-contrast silky ribbons so individual dry-ice smoke curls are clearly visible without any pixel grain
  float billow = pow(smoothstep(0.22, 0.86, wispA * 0.62 + wispB * 0.38), 1.45);
  float ribbonCrest = pow(smoothstep(0.38, 0.92, 1.0 - abs(curlA.x - curlB.y)), 1.6);

  // Advect lookup UVs softly along the laminar curl field & upward (so vapor sinks downward off the crystal)
  vec2 uvTight = clamp(crystalUv + curlA * vec2(0.022, 0.018), 0.005, 0.995);
  vec2 uvMid = clamp(crystalUv + curlA * vec2(0.052, 0.042) + vec2(0.0, -0.020 * billow), 0.005, 0.995);
  vec2 uvWide = clamp(crystalUv + (curlA * 0.6 + curlB * 0.4) * vec2(0.082, 0.068) + vec2(0.0, -0.046 * wispA), 0.005, 0.995);

  float skinField = texture(uSmokeFieldTex, uvTight).r;
  float midField = texture(uSmokeFieldTex, uvMid).g;
  float plumeField = texture(uSmokeFieldTex, uvWide).b;
  float cascadeField = texture(uSmokeFieldTex, uvWide).a;

  // Combine the 4 smooth Gaussian distance layers with defined laminar smoke ribbons + 12s glow bloom
  float vaporDensity = (
    skinField * (0.36 + 0.72 * billow + 0.35 * uGlowPulse) +
    midField * (0.18 + 0.88 * billow + 0.42 * ribbonCrest) +
    plumeField * (0.55 * billow + 0.48 * ribbonCrest) +
    cascadeField * pow(wispA, 1.35) * 0.65
  ) * outerFade * crystalBoundsFade;

  float pulseBoost = 1.0 + uGlowPulse * 0.68;

  vec3 darkCyan = vec3(0.42, 0.86, 1.00);
  vec3 darkFrost = vec3(0.88, 0.96, 1.00);
  vec3 darkViolet = vec3(0.52, 0.66, 0.98);

  vec3 lightSapphire = vec3(0.26, 0.48, 0.88);
  vec3 lightFrost = vec3(0.50, 0.72, 0.96);
  vec3 lightMist = vec3(0.66, 0.79, 0.97);

  vec3 colDark = mix(darkViolet, darkCyan, clamp(skinField + uGlowPulse * 0.45, 0.0, 1.0));
  colDark = mix(colDark, darkFrost, clamp(billow * 0.55 + ribbonCrest * 0.35, 0.0, 1.0));

  vec3 colLight = mix(lightMist, lightSapphire, clamp(billow * 0.82 + uGlowPulse * 0.30, 0.0, 1.0));
  colLight = mix(colLight, lightFrost, skinField * 0.52);

  vec3 smokeColor = mix(colLight, colDark, uIsDark);
  float baseStrength = mix(0.36, 0.56, uIsDark) * pulseBoost;
  float alpha = clamp(vaporDensity * baseStrength, 0.0, 0.78);

  fragColor = vec4(smokeColor * alpha, alpha);
}
`;

// ---------------------------------------------------------------------------
// Pass 1 — 3D Relief Crystal Using Exact Photo Texture & 12-Second Glow Pulse
// ---------------------------------------------------------------------------
const CRYSTAL_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 aPosition;
in vec3 aNormal;
in vec2 aUv;

uniform mat4 uModelMatrix;
uniform mat4 uViewProjMatrix;
uniform mat3 uNormalMatrix;

out vec3 vWorldPos;
out vec3 vWorldNormal;
out vec2 vUv;

void main() {
  vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(uNormalMatrix * aNormal);
  vUv = aUv;
  gl_Position = uViewProjMatrix * worldPos;
}
`;

const CRYSTAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vWorldNormal;
in vec2 vUv;

uniform sampler2D uCrystalTex;
uniform vec3 uCameraPos;
uniform float uIsDark;
uniform float uGlowPulse;
uniform float uSweepY;

out vec4 fragColor;

void main() {
  vec4 rawSample = texture(uCrystalTex, vUv);
  // Decode exact anti-aliased crystal silhouette (outside minimum alpha was 3/255 = 0.0117)
  float maskAlpha = smoothstep(0.025, 0.92, rawSample.a);
  if (maskAlpha < 0.005) discard;

  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 N = normalize(vWorldNormal);

  // Subtle interior refraction parallax as the crystal gently turns left and right
  vec3 refracted = refract(-V, N, 1.0 / 1.34);
  vec2 refractUv = clamp(vUv + refracted.xy * 0.014, 0.02, 0.98);

  vec3 photoColor = rawSample.rgb;
  vec3 deepColor = texture(uCrystalTex, refractUv).rgb;

  // Fine normal perturbation from the photo's own facet ridges
  float lum = dot(photoColor, vec3(0.299, 0.587, 0.114));
  N = normalize(N + vec3(-dFdx(lum) * 1.8, -dFdy(lum) * 1.8, 0.0));

  float NdotV = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - NdotV, 2.3);

  vec3 baseTex = mix(photoColor, deepColor, 0.22);

  // Studio 3D directional lighting that shifts across facets during the left-right turn
  vec3 L1 = normalize(vec3(-0.52, 0.68, 0.65));
  vec3 L2 = normalize(vec3(0.68, -0.25, 0.58));
  float diff1 = max(dot(N, L1), 0.0);
  float diff2 = max(dot(N, L2), 0.0);

  vec3 H1 = normalize(L1 + V);
  vec3 H2 = normalize(L2 + V);
  float specSoft = pow(max(dot(N, H1), 0.0), 18.0);
  float specSharp = pow(max(dot(N, H1), 0.0), 64.0) + pow(max(dot(N, H2), 0.0), 44.0) * 0.45;

  float shade3D = 0.91 + 0.13 * diff1 + 0.06 * diff2;
  vec3 surface = baseTex * shade3D;

  // 12-Second Cryo-Luminescence Pulse:
  // Enriches internal cyan-cobalt-lavender radiance & facet rim glow without washing out facet detail
  float waveBand = exp(-pow((vUv.y - uSweepY) / 0.26, 2.0));
  float cyanness = clamp((photoColor.b + photoColor.g * 0.5) - photoColor.r * 0.85, 0.0, 1.0);
  vec3 pulseTint = mix(vec3(0.22, 0.82, 1.00), vec3(0.66, 0.86, 1.00), waveBand * 0.5);
  surface += pulseTint * uGlowPulse * (0.10 + 0.16 * cyanness + 0.12 * waveBand);

  // Subtle Light Mode grazing rim contrast so pale icy edges read sharply against alabaster
  vec3 lightEdgeTint = vec3(0.46, 0.62, 0.92);
  surface = mix(
    mix(surface, lightEdgeTint, (1.0 - maskAlpha * 0.65) * 0.22),
    surface,
    uIsDark
  );

  surface += vec3(0.92, 0.97, 1.00) * (specSoft * 0.08 + specSharp * 0.20) * (1.0 + uGlowPulse * 0.28);
  surface += vec3(0.68, 0.88, 1.00) * fresnel * (0.12 + uGlowPulse * 0.14) * uIsDark;

  fragColor = vec4(clamp(surface, 0.0, 1.0) * maskAlpha, maskAlpha);
}
`;

// ---------------------------------------------------------------------------
// Pass 2 — Ultra-Smooth Grid-Free Cold Vapor Puffs Spawned on Crystal Perimeter
// ---------------------------------------------------------------------------
const PUFF_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 aCorner;
in vec4 aOffsetSizeRot;
in vec3 aAlphaPhaseLayer;

uniform mat4 uViewProjMatrix;

out vec2 vQuadUv;
out float vRot;
out float vAlpha;
out float vPhase;

void main() {
  vQuadUv = aCorner * 0.5 + 0.5;
  vRot = aOffsetSizeRot.w;
  vAlpha = aAlphaPhaseLayer.x;
  vPhase = aAlphaPhaseLayer.y;

  float s = aOffsetSizeRot.z;
  vec3 worldPos = vec3(
    aOffsetSizeRot.x + aCorner.x * s,
    aOffsetSizeRot.y + aCorner.y * s,
    aAlphaPhaseLayer.z
  );
  gl_Position = uViewProjMatrix * vec4(worldPos, 1.0);
}
`;

const PUFF_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vQuadUv;
in float vRot;
in float vAlpha;
in float vPhase;

uniform float uIsDark;
uniform float uGlowPulse;

out vec4 fragColor;

void main() {
  vec2 centered = vQuadUv - 0.5;
  float c = cos(vRot);
  float s = sin(vRot);
  vec2 rUv = mat2(c, -s, s, c) * centered;

  float rSq = dot(centered, centered) * 4.0;
  if (rSq >= 1.0) discard;

  // Silky Gaussian radial falloff + C-infinity harmonic curl wisps (zero grid noise!)
  float gaussian = exp(-rSq * 3.1) * (1.0 - rSq);

  vec2 p1 = rUv * 4.2 + vec2(vPhase, vPhase * 0.6);
  float w1 = sin(p1.x + cos(p1.y * 1.3)) * cos(p1.y - sin(p1.x * 1.2));
  vec2 p2 = rUv * 7.4 + vec2(w1 * 0.65 - vPhase * 0.4, vPhase * 0.8);
  float w2 = sin(p2.x + sin(p2.y)) * cos(p2.y + cos(p2.x));

  float wisp = clamp(0.62 + 0.26 * w1 + 0.12 * w2, 0.0, 1.0);
  float alpha = gaussian * wisp * vAlpha * (1.0 + uGlowPulse * 0.35);
  if (alpha < 0.002) discard;

  vec3 darkVapor = mix(vec3(0.56, 0.80, 1.00), vec3(0.90, 0.97, 1.00), wisp);
  vec3 lightVapor = mix(vec3(0.32, 0.56, 0.88), vec3(0.72, 0.86, 0.99), wisp);
  vec3 col = mix(lightVapor, darkVapor, uIsDark);

  fragColor = vec4(col * alpha, alpha);
}
`;

function buildModelAndNormalMatrix(
  rx: number,
  ry: number,
  rz: number,
  ty: number,
  scale: number
): { model: Float32Array; normal: Float32Array } {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  const m00 = cz * cy - sz * sx * sy;
  const m01 = -sz * cx;
  const m02 = cz * sy + sz * sx * cy;

  const m10 = sz * cy + cz * sx * sy;
  const m11 = cz * cx;
  const m12 = sz * sy - cz * sx * cy;

  const m20 = -cx * sy;
  const m21 = sx;
  const m22 = cx * cy;

  const model = new Float32Array([
    m00 * scale, m10 * scale, m20 * scale, 0,
    m01 * scale, m11 * scale, m21 * scale, 0,
    m02 * scale, m12 * scale, m22 * scale, 0,
    0, ty, 0, 1,
  ]);

  const normal = new Float32Array([
    m00, m10, m20,
    m01, m11, m21,
    m02, m12, m22,
  ]);

  return { model, normal };
}

function transformVec3(
  m: Float32Array,
  x: number,
  y: number,
  z: number,
  translate: boolean
): [number, number, number] {
  const m00 = m[0] ?? 1;
  const m10 = m[1] ?? 0;
  const m20 = m[2] ?? 0;
  const m01 = m[4] ?? 0;
  const m11 = m[5] ?? 1;
  const m21 = m[6] ?? 0;
  const m02 = m[8] ?? 0;
  const m12 = m[9] ?? 0;
  const m22 = m[10] ?? 1;
  const tx = translate ? (m[12] ?? 0) : 0;
  const ty = translate ? (m[13] ?? 0) : 0;
  const tz = translate ? (m[14] ?? 0) : 0;

  return [
    m00 * x + m01 * y + m02 * z + tx,
    m10 * x + m11 * y + m12 * z + ty,
    m20 * x + m21 * y + m22 * z + tz,
  ];
}

function createViewProjExact(aspect: number, camZ: number): Float32Array {
  const fovRad = (34 * Math.PI) / 180;
  const f = 1 / Math.tan(fovRad * 0.5);
  const near = 1.5;
  const far = 12.0;
  const a = (far + near) / (near - far);
  const b = (2 * far * near) / (near - far);

  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, a, -1,
    0, 0, b - a * camZ, camZ,
  ]);
}

function spawnPerimeterSmokePuff(
  mesh: CrystalMeshData,
  rand: () => number,
  prewarm: boolean
): SmokePuff {
  const pIdx = Math.floor(rand() * Math.max(1, mesh.perimeterCount));
  const lx = mesh.perimeterPoints[pIdx * 3] ?? 0;
  const ly = mesh.perimeterPoints[pIdx * 3 + 1] ?? 0;
  const lz = mesh.perimeterPoints[pIdx * 3 + 2] ?? 0;
  const nx = mesh.perimeterNormals[pIdx * 3] ?? 0;
  const ny = mesh.perimeterNormals[pIdx * 3 + 1] ?? 0;
  const nz = mesh.perimeterNormals[pIdx * 3 + 2] ?? 1;

  const maxLife = 3.2 + rand() * 2.4;
  const life = prewarm ? rand() * maxLife : 0;

  return {
    localX: lx,
    localY: ly,
    localZ: lz,
    normX: nx,
    normY: ny,
    normZ: nz,
    driftOut: 0.036 + rand() * 0.035,
    sinkY: 0.055 + rand() * 0.05,
    swirlAngle: rand() * Math.PI * 2,
    vSwirl: (rand() - 0.5) * 0.9,
    size: 0.24 + rand() * 0.20,
    spin: rand() * Math.PI * 2,
    vSpin: (rand() - 0.5) * 0.28,
    phase: rand() * 32,
    life,
    maxLife,
    alpha: 0.14 + rand() * 0.12,
  };
}

// Evaluates the 12-second periodic cryo-luminescence pulse (0..1) and sweep wave position
function evaluate12SecondGlow(time: number): { glowPulse: number; sweepY: number } {
  const period = 12.0;
  const cycleTime = time % period;
  // Peak at 1.5s into each 12-second cycle (1.5s, 13.5s, 25.5s...)
  const dt = cycleTime - 1.5;
  const sigma = dt < 0 ? 0.62 : 1.35;
  const glowPulse = Math.exp(-(dt * dt) / (2 * sigma * sigma));
  // Sweep wave travels upward from bottom (v=0.95) to top (v=0.05) across the pulse window
  const sweepY = clamp(0.95 - (cycleTime / 3.4) * 0.92, 0.0, 1.0);
  return { glowPulse, sweepY };
}

/**
 * 3D Cold-Carbon Crystal & Smooth Laminar Cryogenic Vapor Canvas
 * - Exact reference photo texture & silhouette
 * - Gentle left-right 3D turn without exposing sides or reacting to mouse
 * - 12-second periodic cryo-luminescence glow pulse
 * - Silky, non-pixelated Gaussian + harmonic curl cold smoke locked to the crystal
 */
export function ColdCarbonCrystalCanvas() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });

    if (!gl) return;
    const ctx: WebGL2RenderingContext = gl;

    const mesh = buildReliefCrystalMesh();
    const smokeFieldBytes = buildSmoothSmokeFieldTexture();
    const rand = createSeededRandom(20261117);

    const puffs: SmokePuff[] = Array.from({ length: SMOKE_PUFF_COUNT }, () =>
      spawnPerimeterSmokePuff(mesh, rand, true)
    );

    const auraProgram = createProgram(ctx, AURA_VERTEX_SHADER, AURA_FRAGMENT_SHADER);
    const crystalProgram = createProgram(ctx, CRYSTAL_VERTEX_SHADER, CRYSTAL_FRAGMENT_SHADER);
    const puffProgram = createProgram(ctx, PUFF_VERTEX_SHADER, PUFF_FRAGMENT_SHADER);

    // Pre-blurred 4-channel Gaussian smoke field texture
    const smokeFieldTex = ctx.createTexture();
    ctx.bindTexture(ctx.TEXTURE_2D, smokeFieldTex);
    ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, false);
    ctx.texImage2D(
      ctx.TEXTURE_2D,
      0,
      ctx.RGBA,
      FIELD_W,
      FIELD_H,
      0,
      ctx.RGBA,
      ctx.UNSIGNED_BYTE,
      smokeFieldBytes
    );
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);

    // Reference crystal texture
    const crystalTex = ctx.createTexture();
    ctx.bindTexture(ctx.TEXTURE_2D, crystalTex);
    ctx.texImage2D(
      ctx.TEXTURE_2D,
      0,
      ctx.RGBA,
      1,
      1,
      0,
      ctx.RGBA,
      ctx.UNSIGNED_BYTE,
      new Uint8Array([172, 214, 252, 255])
    );
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR_MIPMAP_LINEAR);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);

    let disposed = false;
    const img = new Image();
    img.src = '/assets/kamunggay/cold-carbon-crystal.png';
    img.onload = () => {
      if (disposed) return;
      ctx.bindTexture(ctx.TEXTURE_2D, crystalTex);
      ctx.pixelStorei(ctx.UNPACK_FLIP_Y_WEBGL, false);
      ctx.pixelStorei(ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, ctx.RGBA, ctx.UNSIGNED_BYTE, img);
      ctx.generateMipmap(ctx.TEXTURE_2D);
      if (prefersReducedMotion) {
        renderFrame(0);
      }
    };

    // 1. Aura full-screen quad VAO
    const auraVao = ctx.createVertexArray();
    const auraVbo = ctx.createBuffer();
    ctx.bindVertexArray(auraVao);
    ctx.bindBuffer(ctx.ARRAY_BUFFER, auraVbo);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), ctx.STATIC_DRAW);
    const auraLoc = ctx.getAttribLocation(auraProgram, 'aQuadPos');
    ctx.enableVertexAttribArray(auraLoc);
    ctx.vertexAttribPointer(auraLoc, 2, ctx.FLOAT, false, 0, 0);

    // 2. Crystal geometry VAO
    const crystalVao = ctx.createVertexArray();
    const posBuf = ctx.createBuffer();
    const normBuf = ctx.createBuffer();
    const uvBuf = ctx.createBuffer();
    const idxBuf = ctx.createBuffer();

    ctx.bindVertexArray(crystalVao);

    ctx.bindBuffer(ctx.ARRAY_BUFFER, posBuf);
    ctx.bufferData(ctx.ARRAY_BUFFER, mesh.positions, ctx.STATIC_DRAW);
    const crystalPosLoc = ctx.getAttribLocation(crystalProgram, 'aPosition');
    ctx.enableVertexAttribArray(crystalPosLoc);
    ctx.vertexAttribPointer(crystalPosLoc, 3, ctx.FLOAT, false, 0, 0);

    ctx.bindBuffer(ctx.ARRAY_BUFFER, normBuf);
    ctx.bufferData(ctx.ARRAY_BUFFER, mesh.normals, ctx.STATIC_DRAW);
    const crystalNormLoc = ctx.getAttribLocation(crystalProgram, 'aNormal');
    ctx.enableVertexAttribArray(crystalNormLoc);
    ctx.vertexAttribPointer(crystalNormLoc, 3, ctx.FLOAT, false, 0, 0);

    ctx.bindBuffer(ctx.ARRAY_BUFFER, uvBuf);
    ctx.bufferData(ctx.ARRAY_BUFFER, mesh.uvs, ctx.STATIC_DRAW);
    const crystalUvLoc = ctx.getAttribLocation(crystalProgram, 'aUv');
    ctx.enableVertexAttribArray(crystalUvLoc);
    ctx.vertexAttribPointer(crystalUvLoc, 2, ctx.FLOAT, false, 0, 0);

    ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, idxBuf);
    ctx.bufferData(ctx.ELEMENT_ARRAY_BUFFER, mesh.indices, ctx.STATIC_DRAW);

    // 3. Instanced perimeter-spawned cold smoke puff VAO
    const puffVao = ctx.createVertexArray();
    const puffCornerBuf = ctx.createBuffer();
    const puffInstanceOffsetBuf = ctx.createBuffer();
    const puffInstanceAlphaBuf = ctx.createBuffer();
    const puffOffsetData = new Float32Array(SMOKE_PUFF_COUNT * 4);
    const puffAlphaData = new Float32Array(SMOKE_PUFF_COUNT * 3);

    ctx.bindVertexArray(puffVao);
    ctx.bindBuffer(ctx.ARRAY_BUFFER, puffCornerBuf);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), ctx.STATIC_DRAW);
    const puffCornerLoc = ctx.getAttribLocation(puffProgram, 'aCorner');
    ctx.enableVertexAttribArray(puffCornerLoc);
    ctx.vertexAttribPointer(puffCornerLoc, 2, ctx.FLOAT, false, 0, 0);

    ctx.bindBuffer(ctx.ARRAY_BUFFER, puffInstanceOffsetBuf);
    ctx.bufferData(ctx.ARRAY_BUFFER, puffOffsetData, ctx.DYNAMIC_DRAW);
    const puffOffsetLoc = ctx.getAttribLocation(puffProgram, 'aOffsetSizeRot');
    ctx.enableVertexAttribArray(puffOffsetLoc);
    ctx.vertexAttribPointer(puffOffsetLoc, 4, ctx.FLOAT, false, 0, 0);
    ctx.vertexAttribDivisor(puffOffsetLoc, 1);

    ctx.bindBuffer(ctx.ARRAY_BUFFER, puffInstanceAlphaBuf);
    ctx.bufferData(ctx.ARRAY_BUFFER, puffAlphaData, ctx.DYNAMIC_DRAW);
    const puffAlphaLoc = ctx.getAttribLocation(puffProgram, 'aAlphaPhaseLayer');
    ctx.enableVertexAttribArray(puffAlphaLoc);
    ctx.vertexAttribPointer(puffAlphaLoc, 3, ctx.FLOAT, false, 0, 0);
    ctx.vertexAttribDivisor(puffAlphaLoc, 1);

    ctx.bindVertexArray(null);

    const uAuraFieldTex = ctx.getUniformLocation(auraProgram, 'uSmokeFieldTex');
    const uAuraTime = ctx.getUniformLocation(auraProgram, 'uTime');
    const uAuraDark = ctx.getUniformLocation(auraProgram, 'uIsDark');
    const uAuraAspect = ctx.getUniformLocation(auraProgram, 'uAspectScale');
    const uAuraYaw = ctx.getUniformLocation(auraProgram, 'uYaw');
    const uAuraBobY = ctx.getUniformLocation(auraProgram, 'uBobY');
    const uAuraGlow = ctx.getUniformLocation(auraProgram, 'uGlowPulse');

    const uCrystalModel = ctx.getUniformLocation(crystalProgram, 'uModelMatrix');
    const uCrystalViewProj = ctx.getUniformLocation(crystalProgram, 'uViewProjMatrix');
    const uCrystalNormal = ctx.getUniformLocation(crystalProgram, 'uNormalMatrix');
    const uCrystalTexLoc = ctx.getUniformLocation(crystalProgram, 'uCrystalTex');
    const uCrystalCam = ctx.getUniformLocation(crystalProgram, 'uCameraPos');
    const uCrystalDark = ctx.getUniformLocation(crystalProgram, 'uIsDark');
    const uCrystalGlow = ctx.getUniformLocation(crystalProgram, 'uGlowPulse');
    const uCrystalSweep = ctx.getUniformLocation(crystalProgram, 'uSweepY');

    const uPuffViewProj = ctx.getUniformLocation(puffProgram, 'uViewProjMatrix');
    const uPuffDark = ctx.getUniformLocation(puffProgram, 'uIsDark');
    const uPuffGlow = ctx.getUniformLocation(puffProgram, 'uGlowPulse');

    let width = 1;
    let height = 1;
    let dpr = 1;
    let time = 0;
    let lastTimestamp = performance.now();
    let animId = 0;
    let isHidden = document.hidden;
    let isDarkTheme = document.documentElement.classList.contains('dark');
    let smoothDark = isDarkTheme ? 1.0 : 0.0;

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      if (!wrap || !canvas) return;
      const rect = wrap.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

      const pixelW = Math.floor(width * dpr);
      const pixelH = Math.floor(height * dpr);
      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
      }
      ctx.viewport(0, 0, pixelW, pixelH);
    }

    function stepPerimeterPuffs(dt: number, model: Float32Array) {
      for (let i = 0; i < SMOKE_PUFF_COUNT; i++) {
        let puff = puffs[i];
        if (!puff) continue;
        puff.life += dt;
        if (puff.life >= puff.maxLife) {
          puff = spawnPerimeterSmokePuff(mesh, rand, false);
          puffs[i] = puff;
        }
        puff.spin += puff.vSpin * dt;

        const age = puff.life;
        const normLife = age / puff.maxLife;
        const envelope = Math.sin(normLife * Math.PI);

        const [wx, wy, wz] = transformVec3(model, puff.localX, puff.localY, puff.localZ, true);
        const [wnx, wny, wnz] = transformVec3(model, puff.normX, puff.normY, puff.normZ, false);

        const outDist = age * puff.driftOut;
        const swirlX = Math.cos(puff.swirlAngle + age * puff.vSwirl) * 0.024 * age;
        const px = wx + wnx * outDist + swirlX;
        const py = wy + wny * outDist * 0.35 - age * puff.sinkY;
        const pz = wz + wnz * outDist * 0.3;

        puffOffsetData[i * 4] = px;
        puffOffsetData[i * 4 + 1] = py;
        puffOffsetData[i * 4 + 2] = puff.size + age * 0.065;
        puffOffsetData[i * 4 + 3] = puff.spin;

        // Smoothly feather sinking puffs before they approach the top/bottom stage bounds
        const verticalBoundsFade = smoothstep(-1.05, -0.72, py) * smoothstep(1.08, 0.76, py);
        puffAlphaData[i * 3] = puff.alpha * envelope * verticalBoundsFade;
        puffAlphaData[i * 3 + 1] = puff.phase + time * 0.14;
        puffAlphaData[i * 3 + 2] = pz;
      }
    }

    function renderFrame(dt: number) {
      time += dt;
      smoothDark += ((isDarkTheme ? 1.0 : 0.0) - smoothDark) * Math.min(1, dt * 8);

      const bobY = 0.02 + Math.sin(time * 0.55) * 0.022;
      const aspect = width / Math.max(1, height);
      const camZ = 4.55 / Math.min(1, aspect * 1.08);
      const viewProj = createViewProjExact(aspect, camZ);

      // Gentle, slow left-to-right 3D turn (~±12.6 degrees) without ever exposing the sides
      const ry = Math.sin(time * 0.42) * 0.22;
      const rx = Math.cos(time * 0.30) * 0.042;
      const rz = Math.sin(time * 0.24) * 0.018;
      const { model, normal } = buildModelAndNormalMatrix(rx, ry, rz, bobY, 1.0);

      const { glowPulse, sweepY } = evaluate12SecondGlow(time);
      stepPerimeterPuffs(dt, model);

      ctx.viewport(0, 0, canvas?.width ?? width, canvas?.height ?? height);
      ctx.clearColor(0, 0, 0, 0);
      ctx.clearDepth(1);
      ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);

      ctx.enable(ctx.BLEND);
      ctx.blendFunc(ctx.ONE, ctx.ONE_MINUS_SRC_ALPHA);

      // --- Pass 0: Silky Grid-Free Volumetric Cold-Carbon Smoke Locked to Crystal ---
      ctx.disable(ctx.DEPTH_TEST);
      ctx.disable(ctx.CULL_FACE);
      ctx.useProgram(auraProgram);
      ctx.bindVertexArray(auraVao);
      ctx.activeTexture(ctx.TEXTURE0);
      ctx.bindTexture(ctx.TEXTURE_2D, smokeFieldTex);
      ctx.uniform1i(uAuraFieldTex, 0);
      ctx.uniform1f(uAuraTime, time);
      ctx.uniform1f(uAuraDark, smoothDark);
      const scaleNorm = camZ / 4.55;
      ctx.uniform2f(uAuraAspect, aspect * scaleNorm, scaleNorm);
      ctx.uniform1f(uAuraYaw, ry);
      ctx.uniform1f(uAuraBobY, bobY);
      ctx.uniform1f(uAuraGlow, glowPulse);
      ctx.drawArrays(ctx.TRIANGLE_STRIP, 0, 4);

      // --- Pass 1: 3D Relief Crystal Following Exact Reference Photo Texture ---
      ctx.enable(ctx.DEPTH_TEST);
      ctx.depthFunc(ctx.LEQUAL);
      ctx.depthMask(true);
      ctx.useProgram(crystalProgram);
      ctx.bindVertexArray(crystalVao);
      ctx.activeTexture(ctx.TEXTURE0);
      ctx.bindTexture(ctx.TEXTURE_2D, crystalTex);
      ctx.uniform1i(uCrystalTexLoc, 0);
      ctx.uniformMatrix4fv(uCrystalModel, false, model);
      ctx.uniformMatrix4fv(uCrystalViewProj, false, viewProj);
      ctx.uniformMatrix3fv(uCrystalNormal, false, normal);
      ctx.uniform3f(uCrystalCam, 0, 0, camZ);
      ctx.uniform1f(uCrystalDark, smoothDark);
      ctx.uniform1f(uCrystalGlow, glowPulse);
      ctx.uniform1f(uCrystalSweep, sweepY);
      ctx.drawElements(ctx.TRIANGLES, mesh.indices.length, ctx.UNSIGNED_SHORT, 0);

      // --- Pass 2: Silky Perimeter-Locked Cold Vapor Plumes ---
      ctx.disable(ctx.DEPTH_TEST);
      ctx.depthMask(false);
      ctx.useProgram(puffProgram);
      ctx.bindVertexArray(puffVao);
      ctx.uniformMatrix4fv(uPuffViewProj, false, viewProj);
      ctx.uniform1f(uPuffDark, smoothDark);
      ctx.uniform1f(uPuffGlow, glowPulse);

      ctx.bindBuffer(ctx.ARRAY_BUFFER, puffInstanceOffsetBuf);
      ctx.bufferSubData(ctx.ARRAY_BUFFER, 0, puffOffsetData);
      ctx.bindBuffer(ctx.ARRAY_BUFFER, puffInstanceAlphaBuf);
      ctx.bufferSubData(ctx.ARRAY_BUFFER, 0, puffAlphaData);
      ctx.drawArraysInstanced(ctx.TRIANGLE_STRIP, 0, 4, SMOKE_PUFF_COUNT);

      ctx.depthMask(true);
      ctx.bindVertexArray(null);
    }

    function frame(now: number) {
      if (isHidden) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTimestamp) / 1000));
      lastTimestamp = now;
      renderFrame(dt);
      animId = window.requestAnimationFrame(frame);
    }

    function onVisibilityChange() {
      isHidden = document.hidden;
      window.cancelAnimationFrame(animId);
      if (!isHidden && !prefersReducedMotion) {
        lastTimestamp = performance.now();
        animId = window.requestAnimationFrame(frame);
      }
    }

    const themeObserver = new MutationObserver(() => {
      isDarkTheme = document.documentElement.classList.contains('dark');
      if (prefersReducedMotion) {
        smoothDark = isDarkTheme ? 1.0 : 0.0;
        renderFrame(0);
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (prefersReducedMotion) {
        renderFrame(0);
      }
    });
    resizeObserver.observe(wrap);

    resize();
    if (prefersReducedMotion) {
      renderFrame(0);
    } else {
      lastTimestamp = performance.now();
      animId = window.requestAnimationFrame(frame);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animId);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);

      ctx.deleteTexture(smokeFieldTex);
      ctx.deleteTexture(crystalTex);
      ctx.deleteBuffer(auraVbo);
      ctx.deleteVertexArray(auraVao);
      ctx.deleteBuffer(posBuf);
      ctx.deleteBuffer(normBuf);
      ctx.deleteBuffer(uvBuf);
      ctx.deleteBuffer(idxBuf);
      ctx.deleteVertexArray(crystalVao);
      ctx.deleteBuffer(puffCornerBuf);
      ctx.deleteBuffer(puffInstanceOffsetBuf);
      ctx.deleteBuffer(puffInstanceAlphaBuf);
      ctx.deleteVertexArray(puffVao);
      ctx.deleteProgram(auraProgram);
      ctx.deleteProgram(crystalProgram);
      ctx.deleteProgram(puffProgram);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="login-crystal-stage"
      role="img"
      aria-label="Gently turning 3D cold-carbon crystal emitting cryogenic smoke"
    >
      <canvas ref={canvasRef} className="login-crystal-canvas" />
    </div>
  );
}

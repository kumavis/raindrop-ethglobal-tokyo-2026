// Visual tokens and small math helpers shared by the canvas view.
//
// Colors mirror the films and the paper; easing is the films' `eo` curve.

export const COLORS = Object.freeze({
  ink: '#0A1A2F',
  ink2: '#0E2240',
  surface: '#13294A',
  paper: '#EAF2F8',
  muted: '#8FB3D9',
  rain: '#2F8CFF',
  rainLight: '#5FB0FF',
  rainGlow: '#CFE6FF',
  amber: '#FFB547',
  mint: '#4FD1A5',
  rose: '#FF6B81',
  gold: '#F5C542',
  violet: '#A78BFA',
});

export const TONES = Object.freeze({
  rain: COLORS.rainLight,
  amber: COLORS.amber,
  mint: COLORS.mint,
  rose: COLORS.rose,
  gold: COLORS.gold,
  violet: COLORS.violet,
});

export const FONT_MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
export const FONT_DISPLAY = 'Poppins, system-ui, sans-serif';
export const FONT_UI = 'Inter, system-ui, sans-serif';

export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, p) => a + (b - a) * p;
export const TAU = Math.PI * 2;

function bezier(a, b, c, d) {
  const X = (t) => 3 * a * t * (1 - t) * (1 - t) + 3 * c * t * t * (1 - t) + t * t * t;
  const Y = (t) => 3 * b * t * (1 - t) * (1 - t) + 3 * d * t * t * (1 - t) + t * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let m = 0.5;
    for (let i = 0; i < 20; i++) {
      m = (lo + hi) / 2;
      if (X(m) < x) lo = m;
      else hi = m;
    }
    return Y(m);
  };
}

export const easeOut = bezier(0.2, 0.8, 0.2, 1);
export const easeInOut = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const easeIn = (x) => { x = clamp(x); return x * x; };
export const easeOutBack = (x) => {
  x = clamp(x);
  const c = 1.9;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};

/** Deterministic hash of (k, seed) → [0, 1). Same mixer as the films. */
export function hash(k, s = 0) {
  let x = Math.imul((k + 1013904223) ^ s, 2654435761);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  x = Math.imul(x, 3266489917);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** '#rrggbb' + alpha → rgba() string (memoized; the palette is small). */
const rgbaCache = new Map();
export function rgba(hex, a) {
  const key = hex + a.toFixed(3);
  let v = rgbaCache.get(key);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
    if (rgbaCache.size > 4000) rgbaCache.clear();
    rgbaCache.set(key, v);
  }
  return v;
}

export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

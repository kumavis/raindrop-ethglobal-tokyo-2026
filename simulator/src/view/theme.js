// Visual tokens and small math helpers shared by the canvas view.
//
// Colors follow the Raindrop design system (design-system/tokens); easing is the films' `eo` curve.

export const COLORS = Object.freeze({
  ink: '#0F2438',
  ink2: '#1A3B52',
  surface: '#1A3B52',
  paper: '#DCF0FA',
  muted: '#9CC3D5',
  rain: '#6AB8D8',
  rainLight: '#97CDE4',
  rainGlow: '#DCF0FA',
  amber: '#FFB547',
  mint: '#8DD4B7',
  rose: '#E8B5C7',
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

// Raindrop design system type; it has no monospace, so canvas labels use Albert Sans.
export const FONT_MONO = '"Albert Sans", system-ui, sans-serif';
export const FONT_DISPLAY = 'Manrope, system-ui, sans-serif';
export const FONT_UI = '"Albert Sans", system-ui, sans-serif';

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

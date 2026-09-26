// Number formatting shared by the canvas (view/) and the DOM chrome (ui/), so the same
// quantity reads the same everywhere: a node label, a '+x' rain label, the HUD, the inspector.

/** Token amounts: 0.42 · 12.35 · 146.4 · 12,345 · 1.23M · 2.53B · 4.50e14 */
export function fmtNum(x) {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a === 0) return '0';
  if (a >= 1e12) return x.toExponential(2).replace('e+', 'e');
  if (a >= 1e9) return (x / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return Math.round(x).toLocaleString('en-US');
  if (a >= 100) return x.toFixed(1);
  if (a >= 0.01) return x.toFixed(2);
  return x.toPrecision(2);
}

/** A fraction as a percentage with sensible precision. */
export function fmtPct(f, signed = false) {
  if (!Number.isFinite(f)) return '—';
  const p = f * 100;
  const a = Math.abs(p);
  const s = a === 0 ? '0' : a >= 10 ? p.toFixed(1) : a >= 0.1 ? p.toFixed(2) : p.toPrecision(2);
  return (signed && p > 0 ? '+' : '') + s + '%';
}

/** A difference of two fractions in percentage points: +30.0 pts, −2.33 pts. */
export function fmtPts(f) {
  if (!Number.isFinite(f)) return '—';
  const s = fmtPct(Math.abs(f)).replace('%', '');
  return `${f > 0 ? '+' : f < 0 ? '−' : ''}${s} pts`;
}

/** Scientific notation like 3.2e-4 (or 1e-6 for exact powers of ten). */
export function fmtSci(x, digits = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const [m, e] = x.toExponential(digits).split('e');
  return `${+m}e${+e}`;
}

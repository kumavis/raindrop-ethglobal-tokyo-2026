// Canvas drawing for one frame: background, halos, edges, trust particles, disks,
// labels, rain ripples, coins and the hover tooltip. Works in CSS px on a DPR-scaled context.
//
// `geo` (from the stage) gives each node's screen position and radii; everything
// else comes from the frame built by frame.js.

import { COLORS, FONT_MONO, TAU, TONES, clamp, easeIn, easeOut, hash, rgba } from './theme.js';
import { fmtNum as fmt, fmtPct as pct } from '../format.js';

const PARTICLE_BUDGET = 900;
const PARTICLE_CAP = 16; // particles on the iteration's biggest flow; the rest in proportion
const EMPTY_R = 1.5; // screen px: a disk smaller than this is drawn as an empty account
const MIN_DOT = 3; // screen px: smallest solid disk
const SELF_DOTS = 4; // at most this many (smaller) dots on a self-loop

function makeSprite(inner, outer, size = 48) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, rgba(inner, 1));
  grad.addColorStop(0.18, rgba(inner, 0.95));
  grad.addColorStop(0.4, rgba(outer, 0.45));
  grad.addColorStop(1, rgba(outer, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

// Quadratic curve helpers.
const qx = (G, u) => (1 - u) * (1 - u) * G.x0 + 2 * (1 - u) * u * G.cx + u * u * G.x2;
const qy = (G, u) => (1 - u) * (1 - u) * G.y0 + 2 * (1 - u) * u * G.cy + u * u * G.y2;

/** Curved edge from disk edge to disk edge; bows to the left of travel so reciprocal pairs separate. */
function edgeGeom(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const off = Math.min(L * 0.16, 80);
  const cx = (a.x + b.x) / 2 + nx * off;
  const cy = (a.y + b.y) / 2 + ny * off;
  const d0 = Math.hypot(cx - a.x, cy - a.y) || 1;
  const d2 = Math.hypot(cx - b.x, cy - b.y) || 1;
  const ra = Math.max(a.r, a.minR) + 3;
  const rb = Math.max(b.r, b.minR) + 3;
  return {
    x0: a.x + ((cx - a.x) / d0) * ra,
    y0: a.y + ((cy - a.y) / d0) * ra,
    cx,
    cy,
    x2: b.x + ((cx - b.x) / d2) * rb,
    y2: b.y + ((cy - b.y) / d2) * rb,
    ok: L > ra + rb + 4,
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(ctx) {
  const glow = makeSprite(COLORS.rainGlow, COLORS.rainLight);
  const goldGlow = makeSprite('#FFF4C9', COLORS.gold);
  const hasLetterSpacing = 'letterSpacing' in ctx;
  let bg = null;
  let bgKey = '';

  const spacing = (px) => { if (hasLetterSpacing) ctx.letterSpacing = px; };

  function background(w, h) {
    const key = `${w}x${h}`;
    if (key !== bgKey) {
      bgKey = key;
      bg = document.createElement('canvas');
      const s = Math.min(2, window.devicePixelRatio || 1);
      bg.width = Math.max(1, Math.round(w * s));
      bg.height = Math.max(1, Math.round(h * s));
      const g = bg.getContext('2d');
      g.scale(s, s);
      const lin = g.createLinearGradient(0, 0, 0, h);
      lin.addColorStop(0, COLORS.ink2);
      lin.addColorStop(1, COLORS.ink);
      g.fillStyle = lin;
      g.fillRect(0, 0, w, h);
      const R = Math.max(w, h);
      const blue = g.createRadialGradient(w * 0.88, h * 0.02, 0, w * 0.88, h * 0.02, R * 0.75);
      blue.addColorStop(0, rgba(COLORS.rain, 0.2));
      blue.addColorStop(1, rgba(COLORS.rain, 0));
      g.fillStyle = blue;
      g.fillRect(0, 0, w, h);
      const amber = g.createRadialGradient(w * 0.05, h * 1.02, 0, w * 0.05, h * 1.02, R * 0.6);
      amber.addColorStop(0, rgba(COLORS.amber, 0.09));
      amber.addColorStop(1, rgba(COLORS.amber, 0));
      g.fillStyle = amber;
      g.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bg, 0, 0, w, h);
  }

  function draw(frame, geo, opt) {
    const { view, selectedId, hoverId, zoom, insets, width, K, reduced } = opt;
    const nodes = frame.nodes;
    const byId = geo;
    const sel = selectedId && byId.has(selectedId) ? selectedId : null;
    const focus = sel ?? null;
    const neighbors = new Set();
    if (focus) {
      neighbors.add(focus);
      for (const e of frame.edges) {
        if (e.from === focus) neighbors.add(e.to);
        if (e.to === focus) neighbors.add(e.from);
      }
    }
    const dimOf = (id) => (focus && !neighbors.has(id) ? 0.32 : 1);
    const widthScale = clamp(Math.sqrt(zoom), 0.7, 1.5);

    // ---- group outlines (scenario groups), behind everything else ----
    const hulls = frame.groups ? groupHulls(frame.groups, byId, view) : null;
    if (hulls) drawHulls(hulls, focus ? 0.4 : 1);

    // ---- halos (fill) ----
    const flash = frame.flash?.alpha ?? 0;
    if (view.showHalos) {
      for (const n of nodes) {
        const g = byId.get(n.id);
        if (!g || g.rh < 0.5) continue;
        const a = n.appear * dimOf(n.id);
        ctx.fillStyle = rgba(COLORS.rain, (0.17 + 0.12 * flash) * a);
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.rh, 0, TAU);
        ctx.fill();
      }
    }

    // ---- edges ----
    const edgeGeoms = new Map();
    ctx.lineCap = 'round';
    for (const e of frame.edges) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b || e.grow <= 0.001) continue;
      const G = edgeGeom(a, b);
      edgeGeoms.set(e.key, G);
      if (!G.ok) continue;
      const incident = focus && (e.from === focus || e.to === focus);
      const hoverInc = !focus && hoverId && (e.from === hoverId || e.to === hoverId);
      let alpha = (0.34 + 0.3 * e.c) * e.alpha * Math.min(a.appear, b.appear);
      if (focus) alpha = incident ? 0.95 : 0.07;
      else if (hoverInc) alpha = Math.min(1, alpha + 0.3);
      const hot = incident ? 1 : e.hot;
      const w = (1 + 4.2 * e.c) * widthScale + (incident ? 0.8 : 0);
      const u = clamp(e.grow);
      // Partial curve up to u (de Casteljau split), so edges grow from the source.
      const x1 = G.x0 + (G.cx - G.x0) * u;
      const y1 = G.y0 + (G.cy - G.y0) * u;
      const xe = qx(G, u);
      const ye = qy(G, u);
      const head = u > 0.9;
      const hs = (6 + 5 * e.c) * widthScale;
      let tx = xe;
      let ty = ye;
      if (head) {
        const ang = Math.atan2(G.y2 - G.cy, G.x2 - G.cx);
        tx = xe - Math.cos(ang) * hs * 0.7;
        ty = ye - Math.sin(ang) * hs * 0.7;
      }
      const color = hot > 0.02 ? mix(COLORS.paper, COLORS.amber, hot) : COLORS.paper;
      ctx.strokeStyle = rgba(color, alpha);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(G.x0, G.y0);
      ctx.quadraticCurveTo(x1, y1, tx, ty);
      ctx.stroke();
      if (!head) {
        ctx.fillStyle = rgba(color, alpha);
        ctx.beginPath();
        ctx.arc(xe, ye, w * 0.9 + 1, 0, TAU);
        ctx.fill();
        continue;
      }
      const ang = Math.atan2(G.y2 - G.cy, G.x2 - G.cx);
      ctx.fillStyle = rgba(color, Math.min(1, alpha * 1.25));
      ctx.beginPath();
      ctx.moveTo(xe, ye);
      ctx.lineTo(xe - Math.cos(ang - 0.42) * hs, ye - Math.sin(ang - 0.42) * hs);
      ctx.lineTo(xe - Math.cos(ang + 0.42) * hs, ye - Math.sin(ang + 0.42) * hs);
      ctx.closePath();
      ctx.fill();
    }

    // ---- self loops: accounts that endorse no one keep their own weight ----
    if (frame.showSelf) {
      ctx.lineWidth = 1.5 * widthScale;
      for (const n of nodes) {
        if (!n.self) continue;
        const g = byId.get(n.id);
        if (!g) continue;
        const L = selfLoop(g);
        ctx.strokeStyle = rgba(COLORS.paper, 0.55 * dimOf(n.id));
        ctx.beginPath();
        ctx.arc(L.x, L.y, L.r, L.a0, L.a1);
        ctx.stroke();
        const ex = L.x + Math.cos(L.a1) * L.r;
        const ey = L.y + Math.sin(L.a1) * L.r;
        const ta = L.a1 + Math.PI / 2;
        ctx.fillStyle = rgba(COLORS.paper, 0.65 * dimOf(n.id));
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(ta) * 5, ey + Math.sin(ta) * 5);
        ctx.lineTo(ex + Math.cos(ta + 2.5) * 5, ey + Math.sin(ta + 2.5) * 5);
        ctx.lineTo(ex + Math.cos(ta - 2.5) * 5, ey + Math.sin(ta - 2.5) * 5);
        ctx.fill();
      }
    }

    // ---- trust particles: (1 − α) g_i C_ij flowing along each edge ----
    const flows = frame.flows;
    if (flows && flows.alpha > 0.01 && flows.edges.length) {
      // Counts ∝ flow (normalized to this iteration's biggest), so ratios read directly.
      let maxAmount = 0;
      let sum = 0;
      for (const f of flows.edges) {
        maxAmount = Math.max(maxAmount, f.amount);
        sum += f.amount;
      }
      const perUnit = (PARTICLE_CAP / maxAmount) * Math.min(1, PARTICLE_BUDGET / ((PARTICLE_CAP * sum) / maxAmount)) * (reduced ? 0.4 : 1);
      ctx.globalCompositeOperation = 'lighter';
      for (const f of flows.edges) {
        const cnt = Math.max(1, Math.round(f.amount * perUnit));
        const size = (14 + 22 * Math.sqrt(f.amount)) * clamp(Math.sqrt(zoom), 0.75, 1.4);
        const ph = hash(f.from.length * 131 + f.to.length, (byId.get(f.from)?.seed ?? 0) ^ (byId.get(f.to)?.seed ?? 0));
        const a = flows.alpha * (focus ? (f.from === focus || f.to === focus ? 1 : 0.15) : 1);
        if (f.from === f.to) {
          // The self-loop is tiny, so a few small dots sized to the loop: full-size glows
          // would merge into one blob and hide the loop and its arrowhead.
          const g = byId.get(f.from);
          if (!g) continue;
          const L = selfLoop(g);
          const n = Math.min(cnt, SELF_DOTS);
          const ds = Math.min(size, L.r * 1.1);
          for (let k = 0; k < n; k++) {
            const u = (flows.t * 0.6 + k / n + ph) % 1;
            const ang = L.a0 + (L.a1 - L.a0) * u;
            ctx.globalAlpha = a * (0.4 + 0.6 * Math.sin(u * Math.PI));
            const px = L.x + Math.cos(ang) * L.r;
            const py = L.y + Math.sin(ang) * L.r;
            ctx.drawImage(glow, px - ds / 2, py - ds / 2, ds, ds);
          }
          continue;
        }
        const G = edgeGeoms.get(`${f.from}>${f.to}`);
        if (!G || !G.ok) continue;
        for (let k = 0; k < cnt; k++) {
          const u = (flows.t * 0.7 + k / cnt + ph) % 1;
          ctx.globalAlpha = a * (0.35 + 0.65 * Math.sin(u * Math.PI));
          const px = qx(G, u);
          const py = qy(G, u);
          ctx.drawImage(glow, px - size / 2, py - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // ---- disks ----
    for (const n of nodes) {
      const g = byId.get(n.id);
      if (!g || n.appear <= 0.001) continue;
      // Dimmed disks stay opaque (mixed toward the sky) so edges don't show through.
      const dim = dimOf(n.id);
      const a = clamp(n.appear * 1.5);
      const tone = n.tone ? TONES[n.tone] ?? COLORS.paper : COLORS.paper;
      const fill = dim < 1 ? mix(tone, COLORS.ink2, 0.68) : tone;
      if (g.r < EMPTY_R) {
        // Zero or dust balance: a dotted ring at the minimum radius so the account is
        // visible (dots, so it never reads as the dashed 'diluted' halo ring).
        ctx.setLineDash([0.1, 3.4]);
        ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(fill, 0.9 * a);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.minR, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        if (g.r > 0.3) {
          ctx.fillStyle = rgba(fill, a);
          ctx.beginPath();
          ctx.arc(g.x, g.y, g.r, 0, TAU);
          ctx.fill();
        }
        continue;
      }
      // Small but real (a zoomed-out view): a solid dot, never the empty-account ring.
      ctx.fillStyle = rgba(fill, a);
      ctx.beginPath();
      ctx.arc(g.x, g.y, Math.max(g.r, MIN_DOT), 0, TAU);
      ctx.fill();
    }

    // ---- α·b anchor core during iterations ----
    if (flows && flows.anchor && flows.anchorAlpha > 0.01) {
      for (const n of nodes) {
        const g = byId.get(n.id);
        const v = flows.anchor.get(n.id);
        if (!g || !(v > 0)) continue;
        const r = K * Math.sqrt(v * frame.supply) * zoom * n.appear;
        if (r < 1) continue;
        // amber, like the α·b term in the EigenTrust panel: the part kept from balance
        const a = flows.anchorAlpha * dimOf(n.id);
        ctx.fillStyle = rgba(COLORS.amber, (0.26 + 0.22 * flows.anchorPulse) * a);
        ctx.beginPath();
        ctx.arc(g.x, g.y, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = rgba(COLORS.amber, 0.8 * a);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // ---- halo rings (drawn over disks so a halo smaller than its disk still reads) ----
    if (view.showHalos) {
      for (const n of nodes) {
        const g = byId.get(n.id);
        if (!g || g.rh < 0.8) continue;
        const a = n.appear * dimOf(n.id);
        const inner = g.rh < g.r * (1 - 1e-4); // a tie (pro-rata) stays solid, not flickering
        ctx.strokeStyle = rgba(inner ? COLORS.rain : COLORS.rainLight, (inner ? 0.8 : 0.62) * a + 0.3 * flash);
        ctx.lineWidth = (inner ? 1.6 : 1.5) + 2.5 * flash;
        if (inner) ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.rh, 0, TAU);
        ctx.stroke();
        if (inner) ctx.setLineDash([]);
      }
    }

    // ---- rain ripples, event pulses, selection and hover rings ----
    for (const n of nodes) {
      const g = byId.get(n.id);
      if (!g) continue;
      const r = Math.max(g.r, g.minR);
      if (n.gain && n.gain.p < 1) {
        // Two soft rings spreading from the disk as it is credited, like rain on water:
        // wider and brighter for a bigger share of the rain.
        const { p, strength } = n.gain;
        ctx.lineWidth = 1.2 + 0.6 * strength;
        for (let k = 0; k < 2; k++) {
          const q = (p - k * 0.3) / 0.7;
          if (q <= 0 || q >= 1) continue;
          ctx.strokeStyle = rgba(COLORS.rainLight, (0.12 + 0.43 * strength) * (1 - q) * clamp(q * 6) * dimOf(n.id));
          ctx.beginPath();
          ctx.arc(g.x, g.y, r + 3 + easeOut(q) * (6 + 16 * Math.sqrt(strength)), 0, TAU);
          ctx.stroke();
        }
      }
      if (n.pulse) {
        const { q, color } = n.pulse;
        const col = COLORS[color] ?? COLORS.amber;
        ctx.strokeStyle = rgba(col, (1 - q) * 0.95);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(g.x, g.y, r + 6 + easeIn(q) * 22, 0, TAU);
        ctx.stroke();
      }
      if (n.id === sel) {
        ctx.strokeStyle = COLORS.amber;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(g.x, g.y, Math.max(r, g.rh * (view.showHalos ? 1 : 0)) + 6, 0, TAU);
        ctx.stroke();
      } else if (n.id === hoverId) {
        ctx.strokeStyle = rgba(COLORS.paper, 0.6);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(g.x, g.y, r + 5, 0, TAU);
        ctx.stroke();
      }
    }

    // ---- labels (screen-space, culled so they never pile up; group tags go first) ----
    const tags = hulls ? layoutGroupTags(hulls, { insets, width, height: opt.height }) : null;
    drawLabels(nodes, byId, { view, sel, hoverId, dimOf, insets, width, height: opt.height, blocked: tags ?? [] });

    if (tags) drawGroupTags(tags);

    // ---- rain: '+x' credited to each account, floating up ----
    for (const n of nodes) {
      if (!n.gain || n.gain.alpha <= 0.01) continue;
      const g = byId.get(n.id);
      if (!g || g.labelRank > 14) continue;
      ctx.font = `600 11px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const text = '+' + fmt(n.gain.amount);
      const hw = ctx.measureText(text).width / 2 + 2;
      const top = g.y - Math.max(g.r, g.minR);
      const base = top - 8 - (n.newTag > 0.05 ? 18 : 0);
      let y = base - n.gain.rise * 16;
      // Never under a group tag: stop rising just below it, or sit above it if there is no room.
      for (const t of tags ?? []) {
        if (g.x + hw < t.x0 || g.x - hw > t.x1 || t.y0 > base + 3) continue;
        if (t.y1 + 11 <= base) y = Math.max(y, t.y1 + 11);
        else y = Math.min(y, t.y0 - 4);
      }
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = rgba(COLORS.ink, 0.85 * n.gain.alpha);
      ctx.strokeText(text, g.x, y);
      ctx.fillStyle = rgba(COLORS.rainGlow, n.gain.alpha);
      ctx.fillText(text, g.x, y);
    }

    if (frame.coins) drawCoins(frame.coins, byId);

    const tipId = hoverId && byId.has(hoverId) ? hoverId : null;
    if (tipId && opt.tooltip) drawTooltip(nodes.find((n) => n.id === tipId), byId.get(tipId), frame, opt);
  }

  // Screen boxes around each group's disks (and halos), with room for the labels below.
  function groupHulls(groups, byId, view) {
    const out = [];
    for (const grp of groups) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const id of grp.ids) {
        const g = byId.get(id);
        if (!g) continue;
        const r = Math.max(g.r, g.minR, view.showHalos ? g.rh : 0);
        x0 = Math.min(x0, g.x - r);
        x1 = Math.max(x1, g.x + r);
        y0 = Math.min(y0, g.y - r);
        y1 = Math.max(y1, g.y + r);
      }
      if (!Number.isFinite(x0)) continue;
      const pad = 14;
      // room above for the '+x' rain labels, below for the name labels
      out.push({ grp, x0: x0 - pad, y0: y0 - pad - 20, x1: x1 + pad, y1: y1 + pad + (view.showLabels ? 26 : 0) });
    }
    return out;
  }

  function drawHulls(hulls, a) {
    ctx.save();
    ctx.lineWidth = 1.3;
    ctx.setLineDash([6, 5]);
    for (const hl of hulls) {
      const col = TONES[hl.grp.tone] ?? COLORS.paper;
      roundRect(ctx, hl.x0, hl.y0, hl.x1 - hl.x0, hl.y1 - hl.y0, 18);
      ctx.fillStyle = rgba(col, 0.05 * a);
      ctx.fill();
      ctx.strokeStyle = rgba(col, 0.42 * a);
      ctx.stroke();
    }
    ctx.restore();
  }

  // One tag per group, on the box's top edge (or its bottom edge when the top is under
  // the chrome): name × count, then its share of supply and of the rain, or while it rains,
  // the group's rain counting up. Laid out before the node labels, which then avoid it.
  function layoutGroupTags(hulls, { insets, width, height }) {
    return hulls.map((hl) => {
      const { grp } = hl;
      const col = TONES[grp.tone] ?? COLORS.paper;
      const name = `${String(grp.label).toUpperCase()}${grp.ids.length > 1 ? ` × ${grp.ids.length}` : ''}`;
      const line2 = grp.rain
        ? `+${fmt(grp.rain.credited)} of +${fmt(grp.rain.minted)} rain · ${pct(grp.rain.minted > 0 ? grp.rain.total / grp.rain.minted : 0)}`
        : `${pct(grp.supplyShare)} of supply · ${pct(grp.rainShare)} of rain`;
      ctx.font = `600 10.5px ${FONT_MONO}`;
      spacing('1.2px');
      const w1 = ctx.measureText(name).width;
      spacing('0px');
      ctx.font = `500 10.5px ${FONT_MONO}`;
      const w = Math.max(w1, ctx.measureText(line2).width) + 20;
      const h = 34;
      const cx = clamp((hl.x0 + hl.x1) / 2, insets.left + w / 2 + 10, width - insets.right - w / 2 - 10);
      // above the box, overlapping its dashed edge; below it if the chrome is in the way
      let y = hl.y0 - h + 10;
      if (y < insets.top + 4) y = Math.min(hl.y1 - 8, height - insets.bottom - h - 4);
      return { col, name, line2, cx, y, w, h, rain: !!grp.rain, x0: cx - w / 2, x1: cx + w / 2, y0: y, y1: y + h };
    });
  }

  function drawGroupTags(tags) {
    for (const { col, name, line2, cx, y, w, h, rain } of tags) {
      ctx.fillStyle = rgba(COLORS.ink, 0.88);
      roundRect(ctx, cx - w / 2, y, w, h, 9);
      ctx.fill();
      ctx.strokeStyle = rgba(col, 0.6);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `600 10.5px ${FONT_MONO}`;
      spacing('1.2px');
      ctx.fillStyle = col;
      ctx.fillText(name, cx, y + 14);
      spacing('0px');
      ctx.font = `500 10.5px ${FONT_MONO}`;
      ctx.fillStyle = rain ? COLORS.rainGlow : COLORS.paper;
      ctx.fillText(line2, cx, y + 27);
    }
  }

  function selfLoop(g) {
    const r = Math.max(g.r, g.minR);
    const rr = clamp(r * 0.35, 6, 14);
    const ang = -Math.PI / 4;
    const d = r + rr * 0.55;
    return { x: g.x + Math.cos(ang) * d, y: g.y + Math.sin(ang) * d, r: rr, a0: ang + Math.PI + 0.7, a1: ang + Math.PI + TAU - 0.7 };
  }

  // Does a label box sit on top of a node's disk? (Its own node is cleared by the offset.)
  function coversDisk(box, order) {
    for (const { g } of order) {
      const r = Math.max(g.r, g.minR) - 2;
      if (r <= 0) continue;
      const cx = clamp(g.x, box.x0, box.x1);
      const cy = clamp(g.y, box.y0, box.y1);
      if ((cx - g.x) ** 2 + (cy - g.y) ** 2 < r * r) return true;
    }
    return false;
  }

  // Candidate label boxes around a node, in order of preference: centered below, beside
  // (right, left) and above, then the name alone below or beside. `o` clears the disk,
  // halo and selection ring. `ny` is the name's baseline, `bal` whether the balance fits.
  function labelSpots(g, o, nw, bw, top) {
    const w = Math.max(nw, bw, 30) + 6;
    const wn = Math.max(nw, 30) + 6;
    const side = (dir, ww, ny, h0, h1) => {
      const x = g.x + dir * (o + 6 + ww / 2);
      return { x, ny, x0: x - ww / 2, x1: x + ww / 2, y0: ny - h0, y1: ny + h1 };
    };
    const spots = [
      { ...side(0, w, g.y + o + 15, 11, 14), bal: true },
      { ...side(1, w, g.y - 1, 11, 14), bal: true },
      { ...side(-1, w, g.y - 1, 11, 14), bal: true },
    ];
    if (top) spots.push({ ...side(0, w, g.y - o - 18, 11, 14), bal: true });
    spots.push(
      { ...side(0, wn, g.y + o + 15, 11, 3), bal: false },
      { ...side(1, wn, g.y + 4, 11, 3), bal: false },
      { ...side(-1, wn, g.y + 4, 11, 3), bal: false },
    );
    return spots;
  }

  function drawLabels(nodes, byId, { view, sel, hoverId, dimOf, insets, width, height, blocked = [] }) {
    const placed = [...blocked];
    const order = nodes.map((n) => ({ n, g: byId.get(n.id) })).filter((x) => x.g);
    const pri = (x) => (x.n.id === sel ? 1e9 : x.n.id === hoverId ? 1e8 : x.g.r + x.n.newTag * 50);
    order.sort((a, b) => pri(b) - pri(a));
    // Labels stay inside the safe area, so the chrome never cuts one in half.
    const safe = { x0: insets.left + 2, x1: width - insets.right - 2, y0: insets.top + 2, y1: height - insets.bottom - 2 };
    const fits = (box) =>
      box.x0 >= safe.x0 && box.x1 <= safe.x1 && box.y0 >= safe.y0 && box.y1 <= safe.y1 &&
      !placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1) &&
      !coversDisk(box, order);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    let rank = 0;
    for (const { n, g } of order) {
      g.labelRank = rank++;
      const always = n.id === sel || n.id === hoverId;
      if (!view.showLabels && !always) continue;
      const keep = always || n.newTag > 0.5;
      if (n.appear < 0.2) continue;
      const a = clamp(n.appear) * (always ? 1 : dimOf(n.id));
      const r = Math.max(g.r, g.minR);
      const o = Math.max(r, view.showHalos ? g.rh : 0) + (n.id === sel ? 8 : 0);
      const name = String(n.label).toUpperCase();
      const bal = fmt(n.balance);
      ctx.font = `500 10.5px ${FONT_MONO}`;
      const bw = ctx.measureText(bal).width;
      ctx.font = `600 11px ${FONT_MONO}`;
      spacing('1.2px');
      const spots = labelSpots(g, o, ctx.measureText(name).width, bw, n.newTag <= 0.01);
      const box = spots.find(fits) ?? (keep ? spots[0] : null);
      if (!box) {
        spacing('0px');
        continue;
      }
      placed.push(box);
      ctx.lineWidth = 4;
      ctx.strokeStyle = rgba(COLORS.ink, 0.9 * a);
      ctx.strokeText(name, box.x, box.ny);
      ctx.fillStyle = rgba(n.id === sel ? COLORS.amber : COLORS.paper, a);
      ctx.fillText(name, box.x, box.ny);
      spacing('0px');
      if (box.bal) {
        ctx.font = `500 10.5px ${FONT_MONO}`;
        ctx.strokeText(bal, box.x, box.ny + 13);
        ctx.fillStyle = rgba(COLORS.muted, a);
        ctx.fillText(bal, box.x, box.ny + 13);
      }
      if (n.newTag > 0.01) {
        const ty = g.y - r - 12;
        ctx.font = `600 9.5px ${FONT_MONO}`;
        spacing('1px');
        const tw = ctx.measureText('NEW').width + 10;
        ctx.fillStyle = rgba(COLORS.mint, 0.95 * n.newTag * a);
        roundRect(ctx, g.x - tw / 2, ty - 9, tw, 14, 7);
        ctx.fill();
        ctx.fillStyle = rgba(COLORS.ink, n.newTag * a);
        ctx.fillText('NEW', g.x, ty + 1.5);
        spacing('0px');
      }
    }
  }

  function drawCoins(coins, byId) {
    const a = byId.get(coins.from);
    const b = byId.get(coins.to);
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const G = { x0: a.x, y0: a.y, x2: b.x, y2: b.y, cx: (a.x + b.x) / 2 + (dy / L) * L * 0.22, cy: (a.y + b.y) / 2 - (dx / L) * L * 0.22 };
    for (const c of coins.list) {
      const q = (coins.t - c.depart) / c.flight;
      if (q < 0 || q > 1) continue;
      const u = q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2;
      const x = qx(G, u);
      const y = qy(G, u);
      const al = clamp(Math.min(q, 1 - q) * 8);
      ctx.globalAlpha = al * 0.8;
      ctx.drawImage(goldGlow, x - 14, y - 14, 28, 28);
      ctx.globalAlpha = al;
      ctx.fillStyle = COLORS.gold;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#B8871B';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#FFF4C9';
      ctx.beginPath();
      ctx.arc(x - 1.5, y - 1.5, 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Amount label rides above the arc's midpoint.
    const fade = clamp(coins.t / 0.2) * (1 - clamp((coins.t - 1.05) / 0.25));
    if (fade > 0.01) {
      const mx = qx(G, 0.5);
      const my = qy(G, 0.5) - 14;
      ctx.font = `600 12px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = rgba(COLORS.ink, 0.9 * fade);
      ctx.strokeText(fmt(coins.amount), mx, my);
      ctx.fillStyle = rgba(COLORS.gold, fade);
      ctx.fillText(fmt(coins.amount), mx, my);
    }
  }

  function drawTooltip(n, g, frame, opt) {
    if (!n) return;
    const share = frame.supply > 0 ? n.balance / frame.supply : 0;
    // Mid-iteration the halo shows the current iterate g_k, not the final score.
    const ph = frame.phase?.name;
    const it = ph === 'iterate' ? frame.phase.iteration : ph === 'pretrust' ? 0 : null;
    const gLabel = it === null ? 'Trust g' : `Trust g${String(it).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[d])}`;
    const rows = [['Balance', fmt(n.balance)], ['Share', pct(share)], [gLabel, pct(n.score)]];
    const pad = 10;
    const w = 150;
    const h = 24 + rows.length * 17 + pad;
    const r = Math.max(g.r, g.minR, opt.view.showHalos ? g.rh : 0);
    let x = g.x + r + 14;
    let y = g.y - h / 2;
    if (x + w > opt.width - opt.insets.right - 8) x = g.x - r - 14 - w;
    y = clamp(y, opt.insets.top + 8, opt.height - opt.insets.bottom - h - 8);
    ctx.fillStyle = rgba(COLORS.surface, 0.94);
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.paper, 0.14);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 11px ${FONT_MONO}`;
    spacing('1.4px');
    ctx.fillStyle = COLORS.amber;
    ctx.fillText(String(n.label).toUpperCase(), x + pad + 2, y + 20);
    spacing('0px');
    rows.forEach(([k, v], i) => {
      const yy = y + 20 + 18 * (i + 1);
      ctx.font = `500 11px ${FONT_MONO}`;
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'left';
      ctx.fillText(k, x + pad + 2, yy);
      ctx.fillStyle = COLORS.paper;
      ctx.textAlign = 'right';
      ctx.fillText(v, x + w - pad - 2, yy);
    });
  }

  return { background, draw };
}

// Mixes two '#rrggbb' colors; returns '#rrggbb'.
const mixCache = new Map();
function mix(a, b, p) {
  const q = Math.round(p * 20) / 20;
  const key = a + b + q;
  let v = mixCache.get(key);
  if (!v) {
    const x = parseInt(a.slice(1), 16);
    const y = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((x >> s) & 255) * (1 - q) + ((y >> s) & 255) * q);
    v = '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
    mixCache.set(key, v);
  }
  return v;
}

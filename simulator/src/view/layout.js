// Node positions in world units, persisted per node id for the life of a scenario.
//
// 'force': a small continuous simulation — repulsion, springs along endorsements,
// weak centering, weak pull toward x/y hints, and radius-aware collision. It cools to
// rest and then sleeps (no ticks, no drift) until the graph, the viewport shape or the
// node sizes change enough to reheat it.
// 'fixed': nodes ease toward their x/y hints (scaled by `spread`), no forces.

import { hash, lerp } from './theme.js';

const TICK = 1 / 60;
const GOLDEN = 2.399963;
const COOL = 0.018; // alpha decays toward 0 by this fraction per tick
const SLEEP_ALPHA = 0.02; // sleep once this cool...
const SLEEP_MOVE = 0.01; // ...and no node moved more than this (world units) in a tick
const RESIZE_WAKE = 0.03; // a node's radius changing by this fraction wakes it again

export function createLayout() {
  const pos = new Map(); // id → { x, y, vx, vy, active }
  let mode = 'force';
  let alpha = 1;
  let signature = '';
  let spread = 300; // world units per hint unit
  // Stretch applied to hints and centering so the layout roughly matches the
  // viewport's shape (tall on phones, wide on desktops).
  let sx = 1;
  let sy = 1;
  const hx = (h) => h.x * spread * sx;
  const hy = (h) => h.y * spread * sy;
  let acc = 0;
  let placed = 0;
  let asleep = false;
  let lastMove = Infinity;
  const restR = new Map(); // radius per id when the layout last settled
  let synced = null; // the frame arrays last synced (a paused frame is reused as is)

  function place(n, edges, radius) {
    if (n.hint) return { x: hx(n.hint), y: hy(n.hint) };
    const neighbors = [];
    for (const e of edges) {
      const other = e.from === n.id ? e.to : e.to === n.id ? e.from : null;
      const p = other && pos.get(other);
      if (p?.active) neighbors.push(p);
    }
    if (neighbors.length) {
      let cx = 0;
      let cy = 0;
      for (const p of neighbors) { cx += p.x; cy += p.y; }
      cx /= neighbors.length;
      cy /= neighbors.length;
      // Step outward, away from the crowd's centroid, with a hashed jitter.
      let gx = 0;
      let gy = 0;
      let m = 0;
      for (const p of pos.values()) if (p.active) { gx += p.x; gy += p.y; m++; }
      gx /= m || 1;
      gy /= m || 1;
      let a = Math.atan2(cy - gy, cx - gx);
      if (!Number.isFinite(a) || (Math.abs(cx - gx) < 1 && Math.abs(cy - gy) < 1)) a = hash(n.seed, 3) * Math.PI * 2;
      a += (hash(n.seed, 5) - 0.5) * 1.2;
      const d = radius(n.id) + 90;
      return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
    }
    const i = placed;
    const r = 80 * Math.sqrt(i + 0.5);
    const a = i * GOLDEN + hash(n.seed, 7) * 0.4;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  function tickForce(nodes, edges, radius) {
    const act = nodes.map((n) => pos.get(n.id));
    const R = nodes.map((n) => radius(n.id));
    const n = act.length;
    const a = alpha;
    // Repulsion + collision, O(n²).
    for (let i = 0; i < n; i++) {
      const p = act[i];
      for (let j = i + 1; j < n; j++) {
        const q = act[j];
        let dx = q.x - p.x;
        let dy = q.y - p.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-4) { dx = hash(i, j) - 0.5; dy = hash(j, i) - 0.5; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2);
        // Firm short-range push (keeps neighbors a readable distance apart) plus a weak
        // long-range one (separates components); both fade as the layout cools.
        const reach = R[i] + R[j] + 140;
        const f = a * ((d < reach ? 0.09 * (reach - d) : 0) + 500 / (n * Math.max(d, 30)));
        const ux = dx / d;
        const uy = dy / d;
        p.vx -= ux * f * 0.5;
        p.vy -= uy * f * 0.5;
        q.vx += ux * f * 0.5;
        q.vy += uy * f * 0.5;
      }
    }
    // Springs along endorsements (either direction counts once).
    const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
    const seen = new Set();
    const degree = new Array(n).fill(0);
    const links = [];
    for (const e of edges) {
      const i = idx.get(e.from);
      const j = idx.get(e.to);
      if (i === undefined || j === undefined || i === j) continue;
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push([i, j]);
      degree[i]++;
      degree[j]++;
    }
    for (const [i, j] of links) {
      const p = act[i];
      const q = act[j];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const rest = R[i] + R[j] + 70;
      const k = (0.06 * a * (d - rest)) / d / Math.min(degree[i], degree[j]);
      const wi = degree[j] / (degree[i] + degree[j]);
      p.vx += dx * k * wi;
      p.vy += dy * k * wi;
      q.vx -= dx * k * (1 - wi);
      q.vy -= dy * k * (1 - wi);
    }
    // Centering and hint pull.
    for (let i = 0; i < n; i++) {
      const p = act[i];
      const h = nodes[i].hint;
      p.vx -= (p.x * 0.01 * a) / (sx * sx);
      p.vy -= (p.y * 0.01 * a) / (sy * sy);
      if (h) {
        p.vx += (hx(h) - p.x) * 0.04 * a;
        p.vy += (hy(h) - p.y) * 0.04 * a;
      }
    }
    const x0 = act.map((p) => p.x);
    const y0 = act.map((p) => p.y);
    for (const p of act) {
      p.vx *= 0.58;
      p.vy *= 0.58;
      const v = Math.hypot(p.vx, p.vy);
      if (v > 40) { p.vx *= 40 / v; p.vy *= 40 / v; }
      p.x += p.vx;
      p.y += p.vy;
    }
    collide(act, R);
    let move = 0;
    for (let i = 0; i < n; i++) move = Math.max(move, Math.abs(act[i].x - x0[i]), Math.abs(act[i].y - y0[i]));
    lastMove = move;
    alpha -= alpha * COOL;
  }

  // Positional collision: never let disks (or halos) overlap, whatever alpha is.
  function collide(act, R) {
    const n = act.length;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const p = act[i];
          const q = act[j];
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const min = R[i] + R[j] + 22;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01;
          const push = ((min - d) / d) * 0.5;
          const wi = R[j] * R[j] / (R[i] * R[i] + R[j] * R[j] || 1);
          p.x -= dx * push * wi;
          p.y -= dy * push * wi;
          q.x += dx * push * (1 - wi);
          q.y += dy * push * (1 - wi);
        }
      }
    }
  }

  function tickFixed(nodes, dt) {
    const k = Math.min(1, dt * 6);
    nodes.forEach((n) => {
      const p = pos.get(n.id);
      const i = [...pos.keys()].indexOf(n.id);
      const tx = n.hint ? hx(n.hint) : Math.cos(i * GOLDEN) * 80 * Math.sqrt(i + 0.5);
      const ty = n.hint ? hy(n.hint) : Math.sin(i * GOLDEN) * 80 * Math.sqrt(i + 0.5);
      p.x = lerp(p.x, tx, k);
      p.y = lerp(p.y, ty, k);
    });
  }

  return {
    get mode() { return mode; },
    get alpha() { return alpha; },
    /** True while the layout is at rest (nothing moves until something reheats it). */
    get asleep() { return asleep; },
    reset(nextMode = 'force') {
      pos.clear();
      mode = nextMode === 'fixed' ? 'fixed' : 'force';
      alpha = 1;
      signature = '';
      placed = 0;
      acc = 0;
      asleep = false;
      lastMove = Infinity;
      restR.clear();
      synced = null;
    },
    setSpread(s) { spread = s; },
    /** Changes world units: every position (and velocity) × s. */
    scale(s) {
      for (const p of pos.values()) {
        p.x *= s;
        p.y *= s;
        p.vx *= s;
        p.vy *= s;
      }
      for (const [id, r] of restR) restR.set(id, r * s);
    },
    /** Safe-area width / height; reheats when the shape changes noticeably. */
    setAspect(ar) {
      const k = Math.min(1.5, Math.max(0.62, Math.pow(ar > 0 ? ar : 1, 0.7) / 1.25));
      if (Math.abs(k - sx) > 0.04) {
        sx = k;
        sy = 1 / k;
        this.reheat(0.4);
      }
    },
    get spread() { return spread; },
    reheat(a = 0.5) {
      alpha = Math.max(alpha, a);
      asleep = false;
      lastMove = Infinity;
    },
    /**
     * Ensures every frame node has a position and marks which are active.
     * `radius(id)` is the collision radius (max of disk and halo) in world units.
     */
    sync(nodes, edges, radius) {
      if (synced && synced.nodes === nodes && synced.edges === edges) return;
      synced = { nodes, edges };
      const ids = new Set(nodes.map((n) => n.id));
      for (const [id, p] of pos) p.active = ids.has(id);
      let changed = false;
      for (const n of nodes) {
        let p = pos.get(n.id);
        if (!p) {
          const at = place(n, edges, radius);
          p = { x: at.x, y: at.y, vx: 0, vy: 0, active: true };
          pos.set(n.id, p);
          placed++;
          changed = true;
        }
        p.active = true;
      }
      const sig = nodes.map((n) => n.id).join(',') + '|' + edges.filter((e) => !e.removed).map((e) => e.key).join(',');
      if (sig !== signature) {
        if (signature) this.reheat(changed ? 0.6 : 0.35);
        signature = sig;
      }
    },
    step(dt, nodes, edges, radius) {
      if (mode === 'fixed') { tickFixed(nodes, dt); return; }
      if (asleep) {
        // Disks that grew or shrank (rain, a seek, the size toggle) need room again.
        const moved = nodes.some((n) => {
          const r0 = restR.get(n.id);
          return r0 === undefined || Math.abs(radius(n.id) - r0) > RESIZE_WAKE * Math.max(r0, 1);
        });
        if (!moved) { acc = 0; return; }
        this.reheat(0.08);
      }
      acc = Math.min(acc + dt, TICK * 3);
      const live = edges.filter((e) => !e.removed);
      while (acc >= TICK) {
        tickForce(nodes, live, radius);
        acc -= TICK;
      }
      if (alpha < SLEEP_ALPHA && lastMove < SLEEP_MOVE) {
        asleep = true;
        restR.clear();
        for (const n of nodes) restR.set(n.id, radius(n.id));
      }
    },
    /** Runs the simulation synchronously (used right after a scenario loads). */
    warm(ticks, nodes, edges, radius) {
      if (mode === 'fixed') { tickFixed(nodes, 1); return; }
      for (let k = 0; k < ticks; k++) tickForce(nodes, edges, radius);
    },
    get(id) { return pos.get(id) ?? null; },
  };
}

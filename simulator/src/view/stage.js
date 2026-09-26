// The full-screen canvas: sizes nodes (disk area ∝ balance), runs the layout and the
// camera, draws the player's current frame, and turns pointer input into pan, zoom,
// hover and selection.

import { createCamera } from './camera.js';
import { createLayout } from './layout.js';
import { createRenderer } from './render.js';
import { reducedMotion } from './theme.js';

const R_AVG = 34; // world radius of an average node at the scenario's start
const MIN_R = 5; // screen px: zero-balance accounts are drawn as a dashed ring this big
const TAP_SLOP = 6;
const DOUBLE_TAP_MS = 320;

export function createStage(container, app, player) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Raindrop network graph');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;';
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const renderer = createRenderer(ctx);
  const camera = createCamera();
  const layout = createLayout();
  const reduced = reducedMotion();
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let last = performance.now();
  let geo = new Map();
  let hoverId = null;
  let warm = true;
  let base = { n0: 1, s0: 1 };
  // World units: in balance mode the picture grows with supply, so world lengths are
  // measured in units of that growth (sqrt(supply / s0)) to keep coordinates bounded.
  let unit = { size: 1, sizeBy: null };

  function resetScenario() {
    const s = app.scenario;
    layout.reset(s?.layout);
    const init = app.compiled?.initial;
    const n0 = Math.max(1, init?.nodes.length ?? 1);
    const s0 = init && init.supply > 0 ? init.supply : n0;
    base = { n0, s0 };
    unit = { size: 1, sizeBy: null };
    camera.autoFit = true;
    camera.snapNext = true;
    warm = true;
    hoverId = null;
  }
  app.on('scenario', resetScenario);
  if (app.scenario) resetScenario();

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (w === width && h === height && d === dpr) return;
    width = w;
    height = h;
    dpr = d;
    canvas.width = Math.max(1, Math.round(w * d));
    canvas.height = Math.max(1, Math.round(h * d));
    camera.width = w;
    camera.height = h;
  }

  // Radius scale: area ∝ balance with K fixed from the initial supply (render divides it
  // by the growth unit), or area ∝ share with K recomputed from the current supply.
  function scaleK(supply) {
    const s = app.view.sizeBy === 'share' ? Math.max(supply, 1e-9) : base.s0;
    return R_AVG * Math.sqrt(base.n0 / s);
  }

  // Skips redrawing when nothing on screen would change (paused, layout asleep, camera
  // settled): the canvas keeps its last picture, and phones stay cool.
  let drawn = null;
  let dirty = true;
  document.fonts?.addEventListener?.('loadingdone', () => { dirty = true; });

  function render() {
    resize();
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const frame = player.frame();
    if (frame.empty) {
      renderer.background(width, height);
      geo = new Map();
      drawn = null;
      return;
    }
    // In balance mode the whole picture grows with supply (disks and their spacing).
    // Rather than letting world coordinates grow without bound, change units as it grows:
    // the layout and camera are rescaled with it, so the screen picture is unchanged and
    // auto-fit keeps a bounded zoom. Big jumps (seeking, a mode switch) just re-fit, and
    // a seek reheats the layout so it settles to the new sizes.
    const size = app.view.sizeBy === 'share' ? 1 : Math.sqrt(Math.max(1, frame.supply / base.s0));
    if (size !== unit.size && unit.sizeBy === app.view.sizeBy) {
      const s = unit.size / size;
      if (Math.abs(Math.log(s)) < 0.7) {
        layout.scale(s);
        camera.rescale(s);
      } else layout.reheat(0.5);
    }
    unit = { size, sizeBy: app.view.sizeBy };
    const K = scaleK(frame.supply) / size;
    const n = frame.nodes.length;
    // Hints span roughly [-1, 1]; spread them so an average node has room.
    layout.setSpread(Math.max(240, 120 * Math.sqrt(n)));
    const ins = camera.insets;
    layout.setAspect((width - ins.left - ins.right) / Math.max(1, height - ins.top - ins.bottom));

    const worldR = new Map();
    for (const nd of frame.nodes) {
      const disk = K * Math.sqrt(Math.max(0, nd.balance));
      const halo = app.view.showHalos ? K * Math.sqrt(Math.max(0, nd.stableScore * frame.supply)) : 0;
      worldR.set(nd.id, Math.max(disk, halo, 8) * Math.min(1, Math.max(0.2, nd.appear)));
    }
    const radius = (id) => worldR.get(id) ?? 8;
    layout.sync(frame.nodes, frame.edges, radius);
    if (warm) {
      layout.warm(320, frame.nodes, frame.edges.filter((e) => !e.removed), radius);
      warm = false;
    }
    layout.step(dt, frame.nodes, frame.edges, radius);

    if (camera.autoFit) {
      const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const nd of frame.nodes) {
        const p = layout.get(nd.id);
        const r = worldR.get(nd.id);
        b.minX = Math.min(b.minX, p.x - r);
        b.maxX = Math.max(b.maxX, p.x + r);
        b.minY = Math.min(b.minY, p.y - r);
        b.maxY = Math.max(b.maxY, p.y + r);
      }
      if (Number.isFinite(b.minX)) camera.fitGoal(b, { top: 66, bottom: 42, left: 36, right: 36 });
    }
    camera.update(dt, reduced);

    const z = camera.zoom;
    geo = new Map();
    for (const nd of frame.nodes) {
      const p = layout.get(nd.id);
      const [x, y] = camera.toScreen(p.x, p.y);
      const r = K * Math.sqrt(Math.max(0, nd.balance)) * z * nd.appear;
      const rh = K * Math.sqrt(Math.max(0, nd.score * frame.supply)) * z * nd.appear;
      geo.set(nd.id, { x, y, r, rh, minR: MIN_R * Math.min(1, nd.appear), appear: nd.appear, seed: nd.seed, labelRank: 0 });
    }
    // Everything the picture depends on; positions rounded to a quarter pixel.
    let h = 0;
    for (const g of geo.values()) h = (h * 31 + Math.round(g.x * 4) * 7 + Math.round(g.y * 4) * 13 + Math.round(g.r * 4) + Math.round(g.rh * 4) * 3) | 0;
    const sig = [frame, app.view, app.selectedId, hoverId, width, height, dpr, camera.insets, h];
    if (!dirty && drawn && sig.every((v, i) => v === drawn[i])) return;
    drawn = sig;
    dirty = false;
    renderer.background(width, height);
    renderer.draw(frame, geo, {
      view: app.view,
      selectedId: app.selectedId,
      hoverId,
      zoom: z,
      K,
      insets: camera.insets,
      width,
      height,
      reduced,
      tooltip: !coarse,
    });
  }

  function hitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    let bestD = Infinity;
    const slop = coarse ? 14 : 4;
    for (const [id, g] of geo) {
      if (g.appear < 0.3) continue;
      const d = Math.hypot(x - g.x, y - g.y);
      const r = Math.max(g.r, g.minR, coarse ? 12 : 6) + slop;
      // Prefer the node whose edge is closest relative to its size (small ones on top).
      if (d <= r && d / r < bestD) {
        bestD = d / r;
        best = id;
      }
    }
    return best;
  }

  // ---- input ----
  const pointers = new Map();
  let drag = null; // { moved, startX, startY, t, id }
  let pinch = null; // { dist, mx, my }
  let lastTap = { t: 0, x: 0, y: 0 };

  const local = (e) => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
  function pinchState() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    const [x, y] = local(e);
    pointers.set(e.pointerId, { x, y });
    if (pointers.size === 1) {
      drag = { moved: false, startX: x, startY: y, t: performance.now(), id: e.pointerId };
    } else if (pointers.size === 2) {
      drag = null;
      pinch = pinchState();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') {
        hoverId = hitTest(e.clientX, e.clientY);
        canvas.style.cursor = hoverId ? 'pointer' : 'grab';
      }
      return;
    }
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (pinch && pointers.size >= 2) {
      const s = pinchState();
      camera.autoFit = false;
      camera.panBy(s.mx - pinch.mx, s.my - pinch.my);
      camera.zoomAt(s.dist / pinch.dist, s.mx, s.my);
      pinch = s;
      return;
    }
    if (drag && drag.id === e.pointerId) {
      if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) > TAP_SLOP) {
        drag.moved = true;
        hoverId = null;
        canvas.style.cursor = 'grabbing';
      }
      if (drag.moved) {
        camera.autoFit = false;
        camera.panBy(dx, dy);
      }
    }
  });

  function endPointer(e, cancelled) {
    const had = pointers.delete(e.pointerId);
    if (!had) return;
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      // Continue as a one-finger pan with the remaining pointer, never as a tap.
      const [[id, p]] = [...pointers.entries()];
      drag = { moved: true, startX: p.x, startY: p.y, t: 0, id };
      return;
    }
    if (!drag || drag.id !== e.pointerId) { drag = null; return; }
    const tap = !cancelled && !drag.moved && performance.now() - drag.t < 600;
    drag = null;
    if (e.pointerType === 'mouse') canvas.style.cursor = hoverId ? 'pointer' : 'grab';
    if (!tap) return;
    const [x, y] = local(e);
    const now = performance.now();
    if (now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < 30) {
      lastTap = { t: 0, x: 0, y: 0 };
      stage.fit();
      return;
    }
    lastTap = { t: now, x, y };
    app.select(hitTest(e.clientX, e.clientY));
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pointers.size) hoverId = null;
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = local(e);
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
    const dx = e.deltaX * scale;
    const dy = e.deltaY * scale;
    camera.autoFit = false;
    // Pinch gestures and mouse wheels zoom; two-finger trackpad scrolls pan.
    const wheelLike = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 50 && Number.isInteger(dy));
    if (e.ctrlKey || wheelLike) camera.zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), x, y);
    else camera.panBy(-dx, -dy);
  }, { passive: false });

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => resize()).observe(container);

  const stage = {
    canvas,
    camera,
    layout,
    render,
    setInsets({ top = 0, right = 0, bottom = 0, left = 0 } = {}) {
      camera.insets = { top, right, bottom, left };
    },
    fit({ animate = true } = {}) {
      camera.autoFit = true;
      if (!animate || reduced) camera.snapNext = true;
    },
    zoomBy(factor) {
      camera.autoFit = false;
      camera.zoomGoal(factor);
      if (reduced) camera.snapNext = true;
    },
    get autoFit() { return camera.autoFit; },
    hitTest,
    nodeScreenPosition(id) {
      const g = geo.get(id);
      if (!g) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + g.x, y: rect.top + g.y, r: Math.max(g.r, g.minR) };
    },
    get hoverId() { return hoverId; },
  };
  return stage;
}

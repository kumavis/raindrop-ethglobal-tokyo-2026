// 2D camera: world ↔ screen transform, auto-fit to content, and smooth easing.
//
// `x, y` is the world point shown at the center of the safe area (viewport minus
// insets); `zoom` is screen px per world unit. The camera eases toward `goal`.

import { clamp } from './theme.js';

const MIN_ZOOM = 0.01; // manual zoom limits; auto-fit may go further out
const MAX_ZOOM = 14;
const MAX_FIT_ZOOM = 1.8;
const MIN_SAFE = 72; // px: a safe area thinner than this grows back over the bottom/right chrome

export function createCamera() {
  const cam = {
    x: 0,
    y: 0,
    zoom: 1,
    goal: { x: 0, y: 0, zoom: 1 },
    width: 1,
    height: 1,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    autoFit: true,
    snapNext: true,

    /** The safe area, never thinner than MIN_SAFE and never past the viewport. */
    area() {
      const { top, right, bottom, left } = cam.insets;
      const w = Math.max(1, Math.min(cam.width - left, Math.max(MIN_SAFE, cam.width - left - right)));
      const h = Math.max(1, Math.min(cam.height - top, Math.max(MIN_SAFE, cam.height - top - bottom)));
      return { left, top, w, h };
    },
    center() {
      const a = cam.area();
      return { cx: a.left + a.w / 2, cy: a.top + a.h / 2 };
    },
    toScreen(wx, wy) {
      const { cx, cy } = cam.center();
      return [(wx - cam.x) * cam.zoom + cx, (wy - cam.y) * cam.zoom + cy];
    },
    toWorld(sx, sy) {
      const { cx, cy } = cam.center();
      return [(sx - cx) / cam.zoom + cam.x, (sy - cy) / cam.zoom + cam.y];
    },

    /**
     * Frames world bounds inside the safe area. `pad` is screen px kept around the
     * content on each side ({ top, right, bottom, left }), for labels and tags; it
     * shrinks in a small safe area so the content always keeps 40% of each axis.
     */
    fitGoal(b, pad0) {
      const a = cam.area();
      const kx = Math.min(1, (0.6 * a.w) / Math.max(1, pad0.left + pad0.right));
      const ky = Math.min(1, (0.6 * a.h) / Math.max(1, pad0.top + pad0.bottom));
      const pad = { top: pad0.top * ky, bottom: pad0.bottom * ky, left: pad0.left * kx, right: pad0.right * kx };
      const aw = a.w - pad.left - pad.right;
      const ah = a.h - pad.top - pad.bottom;
      const bw = Math.max(1e-9, b.maxX - b.minX);
      const bh = Math.max(1e-9, b.maxY - b.minY);
      const zoom = clamp(Math.min(aw / bw, ah / bh), 1e-9, MAX_FIT_ZOOM);
      // Shift the center so the asymmetric label padding stays balanced.
      const x = (b.minX + b.maxX) / 2 + (pad.right - pad.left) / 2 / zoom;
      const y = (b.minY + b.maxY) / 2 + (pad.bottom - pad.top) / 2 / zoom;
      cam.goal = { x, y, zoom };
    },

    /** Eases toward the goal; `snap` jumps there (reduced motion, first frame). */
    update(dt, snap) {
      if (snap || cam.snapNext) {
        cam.x = cam.goal.x;
        cam.y = cam.goal.y;
        cam.zoom = cam.goal.zoom;
        cam.snapNext = false;
        return;
      }
      const k = 1 - Math.exp(-dt * (cam.autoFit ? 3.2 : 12));
      cam.x += (cam.goal.x - cam.x) * k;
      cam.y += (cam.goal.y - cam.y) * k;
      cam.zoom = Math.exp(Math.log(cam.zoom) + (Math.log(cam.goal.zoom) - Math.log(cam.zoom)) * k);
    },

    /** Changes world units (world coordinates × s) without moving anything on screen. */
    rescale(s) {
      cam.x *= s;
      cam.y *= s;
      cam.zoom /= s;
      cam.goal = { x: cam.goal.x * s, y: cam.goal.y * s, zoom: cam.goal.zoom / s };
    },

    /** Zooms about a screen point, immediately (wheel / pinch). */
    zoomAt(factor, sx, sy) {
      const [wx, wy] = cam.toWorld(sx, sy);
      // A zoom already past a limit (after a fit or a rescale) may only move back toward it.
      cam.zoom = clamp(cam.zoom * factor, Math.min(MIN_ZOOM, cam.zoom), Math.max(MAX_ZOOM, cam.zoom));
      const [nx, ny] = cam.toWorld(sx, sy);
      cam.x += wx - nx;
      cam.y += wy - ny;
      cam.goal = { x: cam.x, y: cam.y, zoom: cam.zoom };
    },

    /** Animated zoom about the safe-area center (UI buttons). */
    zoomGoal(factor) {
      const z = cam.goal.zoom;
      cam.goal = { x: cam.goal.x, y: cam.goal.y, zoom: clamp(z * factor, Math.min(MIN_ZOOM, z), Math.max(MAX_ZOOM, z)) };
    },

    panBy(dx, dy) {
      cam.x -= dx / cam.zoom;
      cam.y -= dy / cam.zoom;
      cam.goal = { x: cam.x, y: cam.y, zoom: cam.zoom };
    },
  };
  return cam;
}

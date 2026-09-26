// UI chrome over the canvas stage: builds every panel, owns which ones are open,
// switches between the desktop layout (docked drawer, floating cards) and the mobile
// one (bottom sheets, one at a time), keeps stage insets in sync with the chrome, and
// handles keyboard shortcuts. createUI(...).update() runs every frame and is cheap.

import { isTyping } from './dom.js';
import { createTopbar } from './topbar.js';
import { createInfo, createPicker } from './picker.js';
import { createPlayback, SPEEDS } from './playback.js';
import { createEigen } from './eigen.js';
import { createParams } from './params.js';
import { createInspector } from './inspector.js';
import { createLegend, createZoom } from './legend.js';

const MOBILE_QUERY = '(max-width: 899.98px)';
// Landscape phones: sheets dock at the right, between the top bar and the dock (style.css).
const SIDE_SHEET_QUERY = '(max-height: 500px) and (min-width: 600px)';
// Panels that are bottom sheets on mobile; only one is open at a time there.
const SHEETS = ['picker', 'params', 'inspector', 'legend'];
// Focused elements whose own Space action wins over play / pause.
const ACTIVATES = 'button, a[href], input, select, textarea, summary, [role=button], [role=radio], [role=switch]';
const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

export function createUI(root, app, player, stage) {
  const mq = matchMedia(MOBILE_QUERY);
  const sideSheets = matchMedia(SIDE_SHEET_QUERY);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const open = new Set();

  const ctx = {
    app, player, stage, root,
    version: 0, // bumps whenever app.compiled changes, so components can key caches on it
    mobile: mq.matches,
    reducedMotion: motion.matches,
    isOpen: (n) => open.has(n),
    open: (n) => setOpen(n, true),
    close: (n) => setOpen(n, false),
    toggle: (n) => setOpen(n, !open.has(n)),
    togglePlay,
    cycleSpeed,
  };
  app.on('compiled', () => { ctx.version += 1; });

  root.classList.add('rd');
  const topbar = createTopbar(ctx);
  const info = createInfo(ctx);
  const picker = createPicker(ctx);
  const params = createParams(ctx);
  const inspector = createInspector(ctx);
  const eigen = createEigen(ctx);
  const legend = createLegend(ctx);
  const zoom = createZoom(ctx);
  const playback = createPlayback(ctx);
  const panels = { picker, params, inspector, legend, info, eigen };
  root.append(topbar.el, info.el, inspector.el, legend.el, zoom.el, eigen.el, playback.el, params.el, picker.el);

  // ---- open / close ----
  const openers = {}; // element that had focus when a dialog-like panel opened
  function setOpen(name, on) {
    if (on === open.has(name)) return;
    const dialog = name === 'picker' || (ctx.mobile && SHEETS.includes(name));
    if (on) {
      if (dialog) openers[name] = document.activeElement;
      // on a phone there is room for one of these at a time (the EigenTrust panel included)
      const single = [...SHEETS, 'info', 'eigen'];
      if (ctx.mobile && single.includes(name)) {
        for (const s of single) if (s !== name) setOpen(s, false);
      }
      // the info card and the inspector share the top-left corner on desktop
      if (name === 'inspector') setOpen('info', false);
      if (name === 'info') setOpen('inspector', false);
      // on a narrow desktop the drawer plus the info card would leave the graph a sliver
      if (name === 'params' && !ctx.mobile && innerWidth < 1200) setOpen('info', false);
      open.add(name);
    } else {
      open.delete(name);
      if (name === 'inspector' && app.selectedId) app.select(null);
      // hand focus back to whatever opened the panel (for EigenTrust, its (i)), if it was inside it
      const el = panels[name]?.el;
      const back = openers[name] ?? (name === 'eigen' ? playback.eigenBtn : null);
      if (el?.contains(document.activeElement)) back?.focus?.({ preventScroll: true });
      delete openers[name];
    }
    root.classList.toggle(`open-${name}`, on);
    panels[name]?.el.classList.toggle('open', on);
    if (name === 'picker') topbar.scenarioBtn.setAttribute('aria-expanded', String(on));
    if (name === 'params') topbar.paramsBtn.setAttribute('aria-pressed', String(on));
    if (name === 'legend') topbar.legendBtn.setAttribute('aria-pressed', String(on));
    if (name === 'eigen') playback.eigenBtn.setAttribute('aria-pressed', String(on));
    if (on) panels[name]?.onOpen?.();
    if (name === 'inspector' && on) inspector.update();
    // The picker and the mobile sheets act as dialogs: move focus in so keyboard users
    // land there rather than at the end of the page (the picker focuses its active item).
    if (on && dialog) {
      const el = panels[name].el;
      if (!el.contains(document.activeElement)) el.querySelector('.panel-close')?.focus({ preventScroll: true });
    }
    relayout();
  }

  app.on('select', (id) => setOpen('inspector', !!id));
  app.on('scenario', () => {
    setOpen('picker', false);
    setOpen('info', true);
  });

  // Desktop: the picker is a popover, so a click elsewhere closes it.
  document.addEventListener('pointerdown', (e) => {
    if (!open.has('picker') || ctx.mobile) return;
    if (picker.el.contains(e.target) || topbar.scenarioBtn.contains(e.target)) return;
    setOpen('picker', false);
  }, true);

  function togglePlay() {
    if (!player.playing && player.ended) {
      player.restart();
      player.play();
    } else {
      player.toggle();
    }
  }

  function cycleSpeed(dir, wrap = true) {
    const i = SPEEDS.indexOf(app.view.speed);
    let j = (i < 0 ? 1 : i) + dir;
    if (wrap) j = (j + SPEEDS.length) % SPEEDS.length;
    else j = Math.max(0, Math.min(SPEEDS.length - 1, j));
    app.setView({ speed: SPEEDS[j] });
  }

  // ---- responsive layout + stage insets ----
  function applyMode() {
    ctx.mobile = mq.matches;
    root.classList.toggle('is-mobile', ctx.mobile);
    root.classList.toggle('is-desktop', !ctx.mobile);
    if (ctx.mobile) {
      setOpen('params', false);
      setOpen('legend', false);
      setOpen('eigen', false);
      const firstSheet = SHEETS.find((s) => open.has(s));
      for (const s of SHEETS) if (s !== firstSheet) setOpen(s, false);
    } else {
      // Below 1200 px the drawer plus the left column would squeeze the graph, so start closed.
      setOpen('params', innerWidth >= 1200);
    }
    relayout();
  }
  mq.addEventListener?.('change', applyMode);
  motion.addEventListener?.('change', () => { ctx.reducedMotion = motion.matches; });

  let dirty = true;
  let insets = null;
  function relayout() { dirty = true; }
  const ro = new ResizeObserver(relayout);
  for (const el of [topbar.el, topbar.el.firstChild, topbar.hud, playback.el, params.el, picker.el, inspector.el, legend.el, eigen.el, info.el]) ro.observe(el);
  addEventListener('resize', relayout);
  visualViewport?.addEventListener('resize', relayout);

  function measure() {
    dirty = false;
    const H = innerHeight;
    const tb = topbar.el.getBoundingClientRect();
    const dock = playback.el.getBoundingClientRect();
    const dockH = Math.max(0, H - dock.top);
    const tbBottom = Math.max(tb.bottom, topbar.hud.getBoundingClientRect().bottom);
    root.style.setProperty('--top-h', `${Math.round(tbBottom)}px`);
    root.style.setProperty('--dock-h', `${Math.round(dockH)}px`);
    root.style.setProperty('--eigen-h', `${eigen.el.offsetHeight}px`);
    const next = { top: Math.round(tbBottom + 8), right: 0, bottom: Math.round(dockH + 8), left: 0 };
    if (ctx.mobile) {
      const sheet = SHEETS.find((s) => open.has(s));
      // offsetHeight ignores the slide-in transform, so this is the settled height
      if (sheet && sideSheets.matches) next.right = panels[sheet].el.offsetWidth + 8;
      else if (sheet) next.bottom = Math.max(next.bottom, panels[sheet].el.offsetHeight + 8);
      // the EigenTrust panel is opt-in, so it may push the graph up (landscape: aside, below)
      else if (open.has('eigen') && !sideSheets.matches) next.bottom += eigen.el.offsetHeight + 8;
      // otherwise keep the fit button's row above the dock clear (it hides under the panel)
      else if (!open.has('eigen')) next.bottom += zoom.el.offsetHeight + 8;
      // landscape: the panel sits at the left between the top bar and the dock, so keep the
      // graph beside it rather than squeezing it into the strip above
      if (open.has('eigen') && sideSheets.matches) next.left = Math.round(eigen.el.offsetLeft + eigen.el.offsetWidth + 8);
      if (open.has('info')) {
        // Keep the graph clear of the intro card until it is dismissed: beside it when the
        // card leaves a wide enough column (landscape, small tablets), else below it, unless
        // that would leave only a sliver, in which case the card simply floats over the graph.
        // (A 390x844 phone leaves ~160 px below the card, a 375x667 one ~115 px with the
        // description clamped: small, but the whole graph beats half of it under the card.)
        const right = info.el.offsetLeft + info.el.offsetWidth;
        const below = Math.round(tbBottom + 8 + info.el.offsetHeight + 8);
        if (innerWidth - right >= 220) next.left = Math.round(right + 8);
        else if (H - below - next.bottom >= 96) next.top = below;
      }
    } else {
      // The zoom buttons float beside the drawer (or the window edge), so reserve them too.
      const drawer = open.has('params') ? params.el.offsetWidth + 28 : 0;
      next.right = Math.round(16 + drawer + zoom.el.offsetWidth + 8);
      // The left column holds the intro card, the inspector and the EigenTrust panel. Keep the
      // graph beside them rather than under them.
      const col = ['info', 'inspector', 'eigen']
        .filter((n) => open.has(n))
        .map((n) => panels[n].el.offsetLeft + panels[n].el.offsetWidth);
      if (col.length) next.left = Math.round(Math.max(...col) + 8);
      // The legend sits in the right column too (the zoom buttons step left of it); reserve
      // it unless that would leave the graph too narrow, in which case it floats over it.
      if (open.has('legend')) {
        const withLegend = next.right + legend.el.offsetWidth + 8;
        if (innerWidth - withLegend - next.left >= 320) next.right = Math.round(withLegend);
      }
      // Center the HUD over the playback bar, but keep it clear of the brand/scenario group
      // and the right-hand buttons (CSS clamps it between --hud-lo and --hud-hi).
      const half = topbar.hud.offsetWidth / 2;
      const l = topbar.el.querySelector('.tb-left').getBoundingClientRect();
      const r = topbar.el.querySelector('.tb-right').getBoundingClientRect();
      root.style.setProperty('--hud-lo', `${Math.round(l.right - tb.left + 12 + half)}px`);
      root.style.setProperty('--hud-hi', `${Math.round(r.left - tb.left - 12 - half)}px`);
    }
    if (!insets || Object.keys(next).some((k) => next[k] !== insets[k])) {
      insets = next;
      stage.setInsets({ ...next });
    }
  }

  // ---- keyboard ----
  // Whether focus last arrived by click (or tap) rather than Tab: a clicked button
  // keeps focus, but Space should still play / pause for mouse users.
  let pointerFocus = false;
  addEventListener('pointerdown', () => { pointerFocus = true; }, true);
  addEventListener('keydown', (e) => {
    if (e.key === 'Tab') pointerFocus = false;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (document.activeElement?.blur && isTyping()) document.activeElement.blur();
      escape();
      return;
    }
    if (isTyping(e.target)) return;
    // Let focused controls keep their own keys: Space activates a tabbed-to button or
    // switch, and arrows / Home / End move sliders and radio groups. The timeline scrub
    // is the exception: its arrows and Home are these same global shortcuts.
    const t = e.target instanceof Element && !e.target.closest('.scrub') ? e.target : null;
    if (e.key === ' ' && !pointerFocus && t?.closest(ACTIVATES)) return;
    if (NAV_KEYS.has(e.key) && t?.closest('input[type=range], [role=slider], [role=radiogroup]')) return;
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        player.stepForward();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        player.stepBack();
        break;
      case 'Home':
        e.preventDefault();
        player.restart();
        break;
      case 'e': case 'E':
        app.setView({ eigenMode: app.view.eigenMode === 'step' ? 'instant' : 'step' });
        break;
      case '+': case '=':
        cycleSpeed(1, false);
        break;
      case '-': case '_':
        cycleSpeed(-1, false);
        break;
      case 'p': case 'P':
        ctx.toggle('params');
        break;
      case 's': case 'S':
        ctx.toggle('picker');
        break;
      case 'l': case 'L':
        ctx.toggle('legend');
        break;
      case 'f': case 'F':
        stage.fit({ animate: true });
        break;
      default:
    }
  });

  function escape() {
    const order = ctx.mobile
      ? ['picker', 'params', 'legend', 'inspector', 'info', 'eigen']
      : ['picker', 'info', 'inspector', 'legend', 'eigen'];
    const name = order.find((n) => open.has(n));
    if (name) setOpen(name, false);
    else if (app.selectedId) app.select(null);
  }

  applyMode();

  // The intro card has done its job once the scenario plays; it would crowd the graph and
  // the EigenTrust panel. The (i) button in the top bar brings it back.
  let wasPlaying = false;

  return {
    update() {
      if (!app.compiled) return;
      // On a phone, stepping forward counts too: the card covers most of the graph there.
      const active = player.playing || (ctx.mobile && !!player.target);
      if (active && !wasPlaying) setOpen('info', false);
      wasPlaying = active;
      topbar.update();
      playback.update();
      eigen.update();
      if (open.has('inspector')) inspector.update();
      if (dirty) measure();
    },
    open: ctx.open,
    close: ctx.close,
    isOpen: ctx.isOpen,
  };
}

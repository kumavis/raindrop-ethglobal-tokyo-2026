// Timeline player: turns the compiled steps into timed animation phases.
//
// Position is (cursor, time): `time` seconds into step `cursor`. Frames are a pure
// function of that position (see frame.js), so seeking and stepping back are free.
// Stepping forward animates to the next stop point; stepping back jumps.

import { buildFrame } from './frame.js';
import { durationOf, phaseAt, phasesFor, stopPoints } from './timeline.js';
import { clamp } from './theme.js';

const GAP = 0.25; // pause between steps while playing, so each event reads as its own beat
const EPS = 1e-6;

export function createPlayer(app) {
  let cursor = 0;
  let time = 0;
  let playing = false;
  let target = null; // { cursor, time } while stepping forward
  let gap = 0;
  let phases = [];
  let duration = 0;
  let mode = app.view.eigenMode;
  let frameCache = null;

  const steps = () => app.compiled?.steps ?? [];
  const stepAt = (c) => steps()[c] ?? null;

  function recompute() {
    mode = app.view.eigenMode;
    phases = phasesFor(stepAt(cursor), mode, app.compiled?.params, { repeat: stepAt(cursor - 1)?.type === 'rain' });
    duration = durationOf(phases);
    frameCache = null;
  }

  function setPosition(c, t) {
    cursor = Math.max(0, Math.min(Math.round(c) || 0, steps().length));
    recompute();
    time = Math.max(0, Math.min(t || 0, duration));
    frameCache = null;
  }

  function extendAtEnd() {
    return app.view.keepRaining && app.compiled && app.extendRain(1);
  }

  // Advances by d seconds of timeline, honoring the step-forward target and the gap.
  function advance(d) {
    let guard = 0;
    while (d > EPS && guard++ < 1000) {
      if (gap > 0) {
        const u = Math.min(gap, d);
        gap -= u;
        d -= u;
        continue;
      }
      if (!stepAt(cursor)) {
        if (playing && extendAtEnd()) { recompute(); continue; }
        playing = false;
        target = null;
        return;
      }
      const limit = target && target.cursor === cursor ? target.time : duration;
      const room = limit - time;
      if (d < room) {
        time += d;
        return;
      }
      time = limit;
      d -= Math.max(0, room);
      if (target && target.cursor === cursor && time >= target.time - EPS) {
        target = null;
        return;
      }
      setPosition(cursor + 1, 0);
      if (target && target.cursor === cursor && target.time <= EPS) {
        target = null;
        return;
      }
      // Pause where the scenario's script ends; playing again continues with extra rain
      // rounds (when 'Keep raining' is on or some were already added).
      if (playing && cursor === app.compiled.scriptLength) {
        playing = false;
        return;
      }
      if (playing) gap = GAP;
    }
  }

  function nextStop() {
    const stops = stopPoints(phases, mode);
    const s = stops.find((x) => x > time + EPS && x < duration - EPS);
    if (s !== undefined) return { cursor, time: s };
    if (cursor < steps().length) return { cursor: cursor + 1, time: 0 };
    // the new round is the step at `cursor`: aim at its first stop, as play would
    if (extendAtEnd()) {
      recompute();
      return nextStopFrom();
    }
    return null;
  }

  // The current beat, independent of phase timing: phase name, iteration and fraction.
  function beat() {
    const p = phaseAt(phases, time);
    const f = p.end > p.start ? (time - p.start) / (p.end - p.start) : 0;
    return { name: p.name, iteration: p.iteration, f, K: phases.filter((x) => x.name === 'iterate').length };
  }

  // Moves `time` to the same beat in the recomputed phases (new mode or new K). An
  // iteration past the new K lands on the last one's stop. Step and instant mode are
  // matched by EigenTrust progress: pre-trust and each iteration are one equal slice of
  // the solve flash, so switching back and forth returns to the same iteration.
  function placeBeat(b) {
    if (b.name === 'idle') { time = 0; return; }
    const find = (name, k) => phases.find((p) => p.name === name && (k === undefined || p.iteration === k));
    const K = phases.filter((x) => x.name === 'iterate').length;
    let p = b.name === 'iterate' && K ? find('iterate', Math.min(b.iteration, K)) : find(b.name);
    let f = b.name === 'iterate' && b.iteration > K ? 1 : b.f;
    if (!p && b.name === 'solve') {
      const x = b.f * (K + 1);
      if (x < 1 || !K) {
        p = find('pretrust');
        f = Math.min(1, x);
      } else {
        const k = Math.min(K, Math.floor(x));
        p = find('iterate', k);
        f = x - k;
      }
    } else if (!p && (b.name === 'pretrust' || b.name === 'iterate')) {
      p = find('solve');
      f = ((b.name === 'pretrust' ? 0 : b.iteration) + b.f) / (b.K + 1);
    }
    time = p ? p.start + clamp(f) * (p.end - p.start) : Math.min(time, duration);
  }

  // Keeps the viewer's place when the phases change under them (mode switch, new params),
  // and re-aims a step-forward in flight at the next stop.
  function rephase() {
    const b = beat();
    const c = cursor;
    const wasTargetHere = target?.cursor === cursor;
    setPosition(cursor, time);
    if (cursor !== c) {
      target = null;
      return;
    }
    placeBeat(b);
    if (wasTargetHere) target = nextStopFrom();
  }

  function nextStopFrom() {
    const s = stopPoints(phases, mode).find((x) => x > time + EPS && x < duration - EPS);
    return s !== undefined ? { cursor, time: s } : { cursor: cursor + 1, time: 0 };
  }

  app.on('compiled', ({ reason }) => {
    if (reason === 'scenario') {
      playing = false;
      target = null;
      gap = 0;
      setPosition(0, 0);
    } else if (reason === 'params') {
      rephase();
    } else {
      frameCache = null;
    }
  });
  app.on('view', (patch) => {
    if ('eigenMode' in patch && patch.eigenMode !== mode) rephase();
    frameCache = null;
  });

  const player = {
    get cursor() { return cursor; },
    get time() { return time; },
    get playing() { return playing; },
    get atEnd() { return cursor >= steps().length; },
    /** Parked where the scenario's script ends (extra rain rounds may follow). */
    get atScriptEnd() { return !!app.compiled && cursor === app.compiled.scriptLength && time <= EPS; },
    /** At the end with nowhere to go: 'Keep raining' is off or the extra-round cap is hit. */
    get ended() { return cursor >= steps().length && !(app.view.keepRaining && app.canExtend); },
    get step() { return stepAt(cursor); },
    get phase() { return phaseAt(phases, time); },
    get phases() { return phases; },
    get duration() { return duration; },
    get progress() {
      const n = steps().length;
      if (!n) return 0;
      return Math.min(1, (cursor + (duration > 0 ? time / duration : 0)) / n);
    },
    get iteration() {
      const step = stepAt(cursor);
      if (step?.type !== 'rain') return null;
      const p = phaseAt(phases, time);
      if (p.name === 'idle') return null;
      if (p.name === 'pretrust') return 0;
      if (p.name === 'iterate') return p.iteration;
      return step.detail.residuals.length;
    },
    get iterationCount() {
      const step = stepAt(cursor);
      return step?.type === 'rain' ? step.detail.residuals.length : null;
    },
    get residual() {
      const k = player.iteration;
      if (!k) return null;
      return stepAt(cursor).detail.residuals[k - 1] ?? null;
    },
    /** Where step-forward is heading, or null. */
    get target() { return target; },

    play() {
      if (!app.compiled) return;
      if (player.ended) setPosition(0, 0);
      target = null;
      playing = true;
    },
    pause() {
      playing = false;
    },
    toggle() {
      if (playing) player.pause();
      else player.play();
    },
    stepForward() {
      if (!app.compiled) return;
      playing = false;
      gap = 0;
      if (target) setPosition(target.cursor, target.time);
      target = nextStop();
    },
    stepBack() {
      if (!app.compiled) return;
      playing = false;
      gap = 0;
      target = null;
      if (time > EPS) {
        const prev = [0, ...stopPoints(phases, mode)].filter((x) => x < time - EPS && x < duration - EPS);
        setPosition(cursor, prev[prev.length - 1] ?? 0);
      } else if (cursor > 0) {
        setPosition(cursor - 1, 0);
        const stops = stopPoints(phases, mode).filter((x) => x < duration - EPS);
        if (stops.length) setPosition(cursor, stops[stops.length - 1]);
      }
    },
    seek(c, t = 0) {
      target = null;
      gap = 0;
      setPosition(c, t);
    },
    restart() {
      playing = false;
      player.seek(0, 0);
    },
    tick(dt) {
      if (!app.compiled || !(dt > 0)) return;
      if (!playing && !target) return;
      frameCache = null;
      advance(dt * (app.view.speed || 1));
    },
    /** Snapshot for the stage; memoized until the position or inputs change. */
    frame() {
      if (!frameCache || frameCache.compiled !== app.compiled || frameCache.view !== app.view) {
        frameCache = {
          compiled: app.compiled,
          view: app.view,
          frame: buildFrame(app.compiled, cursor, time, phases, app.view),
        };
      }
      return frameCache.frame;
    },
  };
  recompute();
  return player;
}

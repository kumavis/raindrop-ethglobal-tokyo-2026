// Application state shared by the player, the stage and the UI.
//
// Holds the loaded scenario, the protocol parameters, view options, the compiled
// timeline and the selected node, and tells subscribers when any of them change.
//
// Events (listener receives `detail`):
//   'scenario'  a scenario was loaded                       detail: scenario
//   'params'    protocol parameters changed                 detail: patch
//   'compiled'  app.compiled was replaced or extended       detail: { reason: 'scenario' | 'params' | 'extend' }
//   'view'      view options changed                        detail: patch
//   'select'    the selected node changed                   detail: id | null

import { compile, DEFAULT_PARAMS, extendRain } from './model/raindrop.js';
import { SCENARIOS } from './scenarios/index.js';

export const DEFAULT_VIEW = Object.freeze({
  eigenMode: 'step', // 'step': animate each EigenTrust iteration; 'instant': one calculation
  speed: 1, // playback rate multiplier
  sizeBy: 'balance', // node area ∝ 'balance' (absolute) or 'share' of supply
  showHalos: true, // trust-score halos
  showLabels: true,
  keepRaining: true, // keep playing rain rounds after the scenario's script ends
});

// Stops runaway growth when "keep raining" is left on.
export const MAX_EXTRA_ROUNDS = 500;

export function createApp({ scenarios = SCENARIOS } = {}) {
  const listeners = new Map();
  const emit = (type, detail) => (listeners.get(type) ?? []).forEach((fn) => fn(detail));
  const extraRounds = () => (app.compiled ? app.compiled.steps.length - app.compiled.scriptLength : 0);

  const app = {
    scenarios,
    scenario: null,
    params: { ...DEFAULT_PARAMS },
    view: { ...DEFAULT_VIEW },
    compiled: null,
    selectedId: null,

    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
      return () => listeners.set(type, listeners.get(type).filter((f) => f !== fn));
    },

    /** Loads a scenario by id (or object), resetting parameters to its defaults. */
    loadScenario(idOrScenario) {
      const scenario = typeof idOrScenario === 'string'
        ? scenarios.find((s) => s.id === idOrScenario) ?? scenarios[0]
        : idOrScenario;
      app.scenario = scenario;
      app.params = { ...DEFAULT_PARAMS, ...scenario.params };
      app.compiled = compile(scenario, app.params);
      app.selectedId = null;
      emit('scenario', scenario);
      emit('select', null);
      emit('compiled', { reason: 'scenario' });
    },

    /** Changes protocol parameters and re-derives the whole timeline (keeping extra rounds, unless told not to). */
    setParams(patch, { keepExtraRounds = true } = {}) {
      app.params = { ...app.params, ...patch };
      app.compiled = compile(app.scenario, app.params, { extraRounds: keepExtraRounds ? extraRounds() : 0 });
      emit('params', patch);
      emit('compiled', { reason: 'params' });
    },

    /** Back to the loaded scenario's parameter defaults; `keepExtraRounds: false` also drops the extra rain rounds. */
    resetParams({ keepExtraRounds = true } = {}) {
      const defaults = { ...DEFAULT_PARAMS, ...app.scenario.params };
      app.setParams(defaults, { keepExtraRounds });
    },

    setView(patch) {
      app.view = { ...app.view, ...patch };
      emit('view', patch);
    },

    /** Whether extendRain can still add a round (false at MAX_EXTRA_ROUNDS). */
    get canExtend() { return !!app.compiled && extraRounds() < MAX_EXTRA_ROUNDS; },

    /** Appends rain rounds after the script. Returns false once the cap is reached. */
    extendRain(n = 1) {
      const room = MAX_EXTRA_ROUNDS - extraRounds();
      if (room <= 0) return false;
      extendRain(app.compiled, Math.min(n, room));
      emit('compiled', { reason: 'extend' });
      return true;
    },

    select(id) {
      id = id ?? null;
      if (id === app.selectedId) return;
      app.selectedId = id;
      emit('select', app.selectedId);
    },
  };
  return app;
}

// The timeline player (src/view/player.js) needs no DOM: these check that switching the
// EigenTrust display mode and changing parameters keep the viewer's place, that repeated
// rains walk their inner loop faster, that the rain phase grows every balance smoothly,
// that playback pauses where the script ends, and that it ends cleanly at the extra-round cap.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, MAX_EXTRA_ROUNDS } from '../src/app.js';
import { createPlayer } from '../src/view/player.js';
import { phasesFor } from '../src/view/timeline.js';

const setup = (id) => {
  const app = createApp();
  const player = createPlayer(app);
  app.loadScenario(id);
  return { app, player };
};
const firstRain = (app, from = 0) => app.compiled.steps.findIndex((s, i) => i >= from && s.type === 'rain' && s.detail.residuals.length > 4);

describe('player', () => {
  test('step → instant → step returns to the same iteration', () => {
    const { app, player } = setup('two-communities');
    const c = firstRain(app);
    player.seek(c, 0);
    const it = player.phases.find((p) => p.name === 'iterate' && p.iteration === 3);
    player.seek(c, it.end);
    assert.equal(player.iteration, 3);
    const t = player.time;
    app.setView({ eigenMode: 'instant' });
    assert.equal(player.phase.name, 'solve');
    assert.equal(player.cursor, c);
    app.setView({ eigenMode: 'step' });
    assert.equal(player.cursor, c);
    assert.equal(player.iteration, 3);
    assert.ok(Math.abs(player.time - t) < 1e-9);
  });

  test('a parameter change keeps the beat and clamps the iteration to the new K', () => {
    const { app, player } = setup('two-communities');
    const c = firstRain(app);
    player.seek(c, 0);
    const K = player.iterationCount;
    const it = player.phases.find((p) => p.name === 'iterate' && p.iteration === K - 1);
    player.seek(c, it.end);
    app.setParams({ alpha: 0.95 });
    const K2 = player.iterationCount;
    assert.ok(K2 < K - 1, `fewer iterations at α = 0.95 (${K2} vs ${K})`);
    assert.equal(player.cursor, c);
    assert.equal(player.phase.name, 'iterate');
    assert.equal(player.iteration, K2);
  });

  test('a rain right after a rain walks its inner loop faster', () => {
    const { app } = setup('trust-sink');
    const steps = app.compiled.steps;
    const k = steps.findIndex((s, i) => s.type === 'rain' && steps[i - 1]?.type === 'rain');
    const loop = (ph) => ph.filter((p) => p.name === 'iterate').reduce((a, p) => a + p.end - p.start, 0);
    const first = phasesFor(steps[k], 'step', app.compiled.params);
    const repeat = phasesFor(steps[k], 'step', app.compiled.params, { repeat: true });
    assert.ok(loop(repeat) <= 1.2 + 1e-9 && loop(repeat) < loop(first));
    assert.equal(repeat.filter((p) => p.name === 'iterate').length, first.filter((p) => p.name === 'iterate').length);
  });

  test('a rain round goes straight from EigenTrust to the rain, labelled with the mint', () => {
    const { app } = setup('first-drop');
    const step = app.compiled.steps.find((s) => s.type === 'rain');
    const K = step.detail.residuals.length;
    const names = (mode) => phasesFor(step, mode, app.compiled.params).map((p) => p.name);
    assert.deepEqual(names('step'), ['pretrust', ...Array(K).fill('iterate'), 'rain', 'settle']);
    assert.deepEqual(names('instant'), ['solve', 'rain', 'settle']);
    const rain = phasesFor(step, 'instant', app.compiled.params).find((p) => p.name === 'rain');
    assert.match(rain.label, /^Mint \+\S+ · credited in proportion to trust$/);
  });

  for (const mode of ['step', 'instant']) {
    test(`during the rain (${mode}) balances grow smoothly and the totals agree`, () => {
      const { app, player } = setup('sybil-split');
      app.setView({ eigenMode: mode });
      const c = app.compiled.steps.findIndex((s) => s.type === 'rain');
      const step = app.compiled.steps[c];
      player.seek(c, 0);
      const rain = player.phases.find((p) => p.name === 'rain');
      let prev = null;
      for (let i = 1; i <= 10; i++) {
        player.seek(c, rain.start + ((rain.end - rain.start) * i) / 10);
        const f = player.frame();
        const sum = f.nodes.reduce((a, n) => a + n.balance, 0);
        assert.ok(Math.abs(f.supply - sum) < 1e-9, 'supply = Σ balances on screen');
        assert.ok(f.supply >= step.before.supply - 1e-9 && f.supply <= step.after.supply + 1e-9);
        for (const n of f.nodes) {
          if (prev) assert.ok(n.balance >= prev.get(n.id) - 1e-12, `${n.id} never shrinks`);
          const k = step.detail.ids.indexOf(n.id);
          if (step.detail.rain[k] > 0) assert.ok(n.gain && n.gain.strength > 0 && n.gain.strength <= 1, `${n.id} ripples`);
        }
        for (const grp of f.groups) {
          const credited = grp.ids.reduce((a, id) => a + f.nodes.find((n) => n.id === id).balance - step.before.nodes.find((n) => n.id === id).balance, 0);
          assert.ok(Math.abs(grp.rain.credited - credited) < 1e-9, 'group counter follows the disks');
        }
        prev = new Map(f.nodes.map((n) => [n.id, n.balance]));
      }
      const end = step.after.nodes.map((n) => n.balance);
      player.seek(c, rain.end);
      assert.deepEqual(player.frame().nodes.map((n) => n.balance), end, 'the rain ends exactly on the next state');
    });
  }

  test('playback pauses where the script ends, and play keeps it raining', () => {
    const { app, player } = setup('first-drop');
    const n = app.compiled.scriptLength;
    player.seek(n - 1);
    player.play();
    for (let k = 0; k < 400 && player.playing; k++) player.tick(0.1);
    assert.equal(player.playing, false, 'paused at the end of the script');
    assert.equal(player.cursor, n);
    assert.equal(player.atScriptEnd, true);
    assert.equal(app.compiled.steps.length, n, 'no extra round yet');
    assert.equal(player.ended, false, 'Keep raining is on, so there is more to play');
    player.play();
    for (let k = 0; k < 400 && player.cursor <= n; k++) player.tick(0.1);
    assert.equal(player.playing, true, 'extra rounds play on without pausing again');
    assert.ok(app.compiled.steps.length > n);
    assert.equal(app.compiled.steps[n].extra, true);
  });

  test('→ at the script end steps into the new rain round rather than past it', () => {
    const { app, player } = setup('first-drop');
    const n = app.compiled.scriptLength;
    player.seek(n);
    player.stepForward();
    assert.equal(app.compiled.steps.length, n + 1, 'one extra round added');
    assert.equal(player.target.cursor, n, 'aimed inside the new round');
    assert.ok(player.target.time > 0);
    for (let k = 0; k < 400 && player.target; k++) player.tick(0.05);
    assert.equal(player.cursor, n);
    assert.ok(player.time > 0, 'stopped at the first EigenTrust stop of the round');
  });

  test('at the extra-round cap playback has ended even with Keep raining on', () => {
    const { app, player } = setup('empty-canvas');
    while (app.extendRain(100));
    assert.equal(app.canExtend, false);
    assert.equal(app.compiled.steps.length - app.compiled.scriptLength, MAX_EXTRA_ROUNDS);
    player.seek(app.compiled.steps.length);
    assert.equal(player.ended, true);
    player.play(); // restarts, as Replay does
    assert.equal(player.cursor, 0);
    assert.equal(player.playing, true);
    app.setView({ keepRaining: false });
    app.loadScenario('empty-canvas');
    player.seek(app.compiled.steps.length);
    assert.equal(player.ended, true);
    app.setView({ keepRaining: true });
    assert.equal(player.ended, false);
  });
});

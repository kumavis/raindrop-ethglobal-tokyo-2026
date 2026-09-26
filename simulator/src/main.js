// Entry point: wires the app state, the timeline player, the canvas stage and the UI,
// then drives them from one animation loop.
import { createApp } from './app.js';
import { createPlayer } from './view/player.js';
import { createStage } from './view/stage.js';
import { createUI } from './ui/ui.js';

const app = createApp();
const player = createPlayer(app);
const stage = createStage(document.getElementById('stage'), app, player);
const ui = createUI(document.getElementById('ui'), app, player, stage);

const hashScenario = () => new URLSearchParams(location.hash.slice(1)).get('s');
app.on('scenario', (s) => {
  if (hashScenario() !== s.id) history.replaceState(null, '', `#s=${encodeURIComponent(s.id)}`);
});
window.addEventListener('hashchange', () => {
  const id = hashScenario();
  if (id && id !== app.scenario?.id) app.loadScenario(id);
});
app.loadScenario(hashScenario() ?? app.scenarios[0].id);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  player.tick(dt);
  stage.render();
  ui.update();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Handy for debugging from the console.
Object.assign(window, { raindrop: { app, player, stage, ui } });

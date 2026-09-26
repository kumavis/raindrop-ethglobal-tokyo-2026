# Raindrop Simulator

An interactive, full-screen visualization of Raindrop for the browser (desktop and
mobile). Pick a prebuilt network, press play, and watch EigenTrust decide where each
round of newly minted tokens falls, and how endorsements, newcomers, transfers and
attacks change the picture. Every protocol parameter can be changed while it runs.

Plain ES modules, Canvas 2D and DOM/CSS. No dependencies, no bundler, no framework.

## Run it

From the repo root:

```sh
npm run dev-simulator        # http://localhost:4174 (live-reloads on changes to index.html or src/)
npm run build-simulator      # copies index.html + src/ into simulator/dist/
npm run test-simulator       # node:test suites for the model and the app store
npm run check --workspace simulator   # validates every scenario and checks what it teaches
```

Open a scenario directly with `#s=<id>`, e.g. `http://localhost:4174/#s=trust-flows`.

## Two nested protocols

The simulator shows two iterated protocols, one inside the other.

1. **EigenTrust (the inner loop).** Power iteration

   ```
   g ← α·b + (1 − α)·Cᵀg      until ‖g_k − g_{k−1}‖₁ < ε  (or max iterations)
   ```

   - `b` is the pre-trust vector: each account's balance divided by the supply.
   - `C` is the row-normalized endorsement matrix, `C_ij = w_ij / Σ_k w_ik`. An account
     that endorses no one keeps its own weight (an implicit self-loop, `C_ii = 1`).
   - `α` anchors part of each account's weight to its own balance. The remaining `1 − α` flows
     along endorsements.

2. **Raindrop (the outer loop).** Every round runs EigenTrust on the current graph *as one
   instantaneous event*. It then mints `ΔS` (a percentage of supply, or a fixed amount) and
   credits `g_i · ΔS` to each account. Between rounds, accounts endorse, revoke or change
   endorsements, transfer tokens, and newcomers join.

The **EigenTrust: Step-by-step / Instant** toggle picks how a rain round plays:

| Mode | Phases of one rain round |
|---|---|
| Step-by-step | `pretrust` (halos morph to g₀ = b) → one `iterate` phase per iteration (glowing particles carry (1−α)·g_i·C_ij along each edge, each node pulses its amber α·b_i anchor core) → `rain` → `settle` |
| Instant | `solve` (one flash: "converged in K iterations") → `rain` → `settle` |

In step mode, step forward (→) walks EigenTrust one iteration at a time. A rain right after
another rain runs on the same graph, so its inner loop plays faster (about 1.2 s for all
iterations); every iteration is still a stop for → and ←. The step chip above the timeline
names the phase: `ROUND 2 › EIGENTRUST 3/17`, then `› RAIN`. The `rain` phase mints `ΔS` and
credits it: every balance grows by `g_i·ΔS` in one smooth ease, and the EigenTrust panel reads
"Mint +ΔS · credited in proportion to trust".

Switching mode or changing a parameter keeps your place: the same phase and iteration (an
iteration past the new K lands on the last one).

α is limited to [0.01, 1]: at α = 0 the update has no unique fixed point, so the result
would depend on g₀ and on where the iteration stops (paper §7 takes α ∈ (0, 1)).

## Visual encoding

| On screen | Meaning |
|---|---|
| **Disk area** | the account's balance (radius `K·√balance`, with K fixed per scenario, so the picture grows with supply; auto-fit keeps it framed, even through long "keep raining" runs; "size by share" rescales K every frame instead) |
| **Halo area** (rain-blue ring) | trust score × supply, `K·√(g_i·S)`, on the same scale as the disk. **Halo bigger than disk ⇒ g_i > b_i ⇒ the account gains share of supply next rain.** When the halo is smaller than the disk it is drawn as a dashed ring *inside* the disk: the account is being diluted. |
| Idle halos | `scoresAt(compiled, cursor)`: EigenTrust on the current graph, i.e. the rain's split *if it rained now* (a trust change or newcomer before the next rain would still change it) |
| Halos during step-mode iteration | the iterate vector g_k (× supply) |
| Arrow | an endorsement; width and opacity follow the normalized weight C_ij. Amber while animating in, or when selected. |
| Glowing particles | EigenTrust flow along edges during an iteration, (1−α)·g_i·C_ij; counts are proportional to the flow |
| Amber core (during iterations) | α·b_i, the part of each account's trust anchored to its balance (amber like the α·b term in the EigenTrust panel) |
| Small loop | an account that endorses no one keeps its own weight (the implicit self-loop C_ii = 1) |
| Dashed box with a tag | a scenario group (`groups`): the group's combined share of supply and of the rain; during a rain, its rain counting up |
| Ripples and `+x.xx` | the rain. Every disk grows smoothly by its `g_i·ΔS`; soft rain-blue rings spread from each credited disk, wider and brighter for a bigger share; `+x.xx` floats up. |
| Dotted small ring | a zero-balance account (distinct from the dashed "diluted" halo) |
| Tints (`tone`) | rose = attacker/sybil, mint = newcomer, amber = curator, gold = buyer, violet = builder |
| Gold coins | a transfer |
| `NEW` tag | an account that just joined |

## Controls

- **Top bar:** scenario picker (grouped Basics → Dynamics → Attacks & limits → Sandbox),
  a "What to watch" card, stats (Round, Supply, Last mint, α), Legend, Parameters.
- **Playback bar:** the step chip (`ROUND 2 › EIGENTRUST 3/17`) above a timeline scrubber
  with one segment per step, colored by type (rain = blue, trust change = amber, join = mint,
  transfer = gold, note = grey; extra rounds after the script are thinner); click or drag it
  to seek. Below: rewind to the start, step back, play/pause, step forward, speed (0.5×–4×),
  and the EigenTrust mode toggle with an (i) that opens the EigenTrust panel. The caption
  above the bar is the step's subtitle.
- **EigenTrust panel** (hidden until opened from the (i)): the formula with α filled in,
  iteration k / K, residual ‖Δ‖₁ vs ε, a log-scale residual sparkline, and converged /
  hit-max badge. Between rains it shows EigenTrust on the current graph (what a rain now would
  use; a trust change or newcomer before the next rain would still change it).
- **Parameters:** α; issuance as `% of supply` or a `Fixed amount`; ε (log slider);
  max iterations; starting vector (`b` or uniform); Reset (the scenario's defaults, drops
  any extra rain rounds and rewinds the timeline to the start). View options: size by balance/share, halos, labels,
  keep raining after the script.
- **Inspector** (tap/click a node): balance (live while the rain is credited), share bᵢ, trust gᵢ,
  gain/dilution (gᵢ − bᵢ in percentage points), what the next rain pays it (looking past any
  trust changes or newcomers before that rain), total received, endorses / endorsed-by lists,
  share-of-supply sparkline. It describes the step that is playing once its change is on
  screen (a newcomer appearing, an edge growing, the rain settling).
- **Canvas:** wheel/trackpad zoom, drag to pan, pinch and two-finger pan on touch,
  double-click/double-tap to fit, tap empty space to deselect. Zoom +/−/fit buttons.

Keyboard (ignored while typing):

| Key | Action |
|---|---|
| Space / K | play / pause |
| ← / → | step back / forward (per EigenTrust iteration in step mode) |
| Home | rewind to the start |
| E | toggle EigenTrust step-by-step / instant |
| + / − | speed up / down |
| P / S / L | parameters / scenarios / legend |
| F | fit the graph to the view |
| Esc | close the top popover or panel, then deselect |

Desktop (≥ 900 px) docks the parameters drawer on the right. It starts open at ≥ 1200 px.
The left column holds the what-to-watch card, the inspector and the EigenTrust panel (when
open), and the camera keeps the graph clear of both columns. Mobile (< 900 px) uses bottom
sheets, one at a time and at most 60% of the screen tall (side sheets on landscape phones),
and opens the EigenTrust panel just above the controls (at the left, beside the graph, on
landscape phones); it too shares the screen with one sheet or card at a time. Landscape
phones fold the playback bar into one row, with the step chip over the scrubber.

## Architecture

```
scenario (data) ─► model/raindrop.js compile() ─► app.js store ─► view/player.js ─┬─► view/stage.js (canvas)
                   model/eigentrust.js                              (cursor,time)   └─► ui/ui.js (DOM chrome)
```

| Module | Role |
|---|---|
| `src/model/eigentrust.js` | Pure EigenTrust: `pretrustVector`, `trustMatrix`, `eigentrustStep`, `stepFlows`, `eigentrust` (records every iteration and residual). |
| `src/model/raindrop.js` | Pure protocol state machine. `compile(scenario, params)` replays the timeline into `steps[]`, each with `before`, `after` and `detail` (rain steps keep the whole EigenTrust run). Also `stateAt`, `scoresAt`, `nodeStats`, `extendRain`, `validateScenario`. **Cursor convention:** cursor `c ∈ [0, steps.length]` means steps `0..c−1` have run; step `c` plays next. |
| `src/app.js` | Observable store: `scenario`, `params`, `view`, `compiled`, `selectedId`. `loadScenario`, `setParams` (recompiles everything), `resetParams`, `setView`, `extendRain`, `select`. Events: `scenario`, `params`, `compiled` ({reason}), `view`, `select`. |
| `src/view/timeline.js` | Phase timings for a step (`phasesFor`, `stopPoints`). |
| `src/view/player.js` | Position `(cursor, time)`: play/pause/step/seek, gap between steps, keep-raining extension. |
| `src/view/frame.js` | `buildFrame(compiled, cursor, time, …)`: a pure function giving every node's balance, score and appearance, edges, particles, rain ripples and coins. Seeking backwards costs nothing. |
| `src/view/layout.js`, `camera.js`, `render.js`, `stage.js` | Force or fixed layout (cools to rest and sleeps until the graph or node sizes change), auto-fit camera with insets, Canvas 2D drawing, pointer input. The stage skips redrawing while nothing on screen changes. |
| `src/format.js` | Number formatting shared by the canvas and the DOM (`fmtNum`, `fmtPct`, `fmtPts`, `fmtSci`), so a value reads the same everywhere. |
| `src/ui/*` | DOM chrome: top bar, picker, playback and scrubber, EigenTrust panel, parameters, inspector, legend. `createUI(...)` returns `{ update, open, close, isOpen }`. Panel names are `picker`, `params`, `inspector`, `legend`, `info`, `eigen`, for the upcoming tutorial. |
| `src/main.js` | Wires everything and runs one rAF loop: `player.tick(dt); stage.render(); ui.update()`. It exposes `window.raindrop = { app, player, stage, ui }`. |
| `src/scenarios/*` | One file per scenario; `index.js` exports `SCENARIOS` in picker order. |

Handy hooks for a tutorial or for debugging:
- `raindrop.player.seek(c, t)` and `raindrop.stage.nodeScreenPosition(id)` (returns `{x, y, r}` in client px).
- `raindrop.ui.open('params')` opens a panel by name.

## Scenario format

A scenario is plain data: an initial network plus a timeline of events.

```js
export default {
  id: 'first-drop',                  // url-safe, unique (used in #s=<id>)
  title: 'Ada endorses Ben',         // short, shown in the top bar and picker
  summary: 'Two accounts, one endorsement.',   // one line for the picker
  description: 'What to watch: …',   // 2–4 sentences: what to notice, which control to try
  tags: ['basics'],                  // first tag = picker group: basics | dynamics | attacks | sandbox
  params: { alpha: 0.5 },            // optional overrides of DEFAULT_PARAMS (below)
  layout: 'force',                   // 'force' (default; x/y are a weak pull) or 'fixed' (x/y exactly)
  nodes: [
    // balance ≥ 0; x/y roughly in [-1, 1], y down; tone: rain|amber|mint|rose|gold|violet|null
    { id: 'ada', label: 'Ada', balance: 60, x: -0.5, y: 0, tone: null, note: 'optional role' },
    { id: 'ben', label: 'Ben', balance: 40, x: 0.5, y: 0 },
  ],
  trust: { ada: { ben: 1 } },        // initial endorsements: trust[from][to] = weight > 0
  events: [ /* see below */ ],
};
```

`DEFAULT_PARAMS`: `alpha: 0.5`, `issuanceMode: 'percent'` (or `'fixed'`), `issuancePercent: 10`,
`issuanceFixed: 10`, `epsilon: 1e-6`, `maxIterations: 100`, `g0: 'pretrust'` (or `'uniform'`).

### Events

Every event may carry a `caption`, the subtitle shown while it plays. Steps without one get
an automatic caption ("Round 4: it rains 12.10 tokens", "Ada endorses Ben", …). For
`rounds: n`, give the later rounds a `captionEach` that says what to notice; those rounds
are where a lesson lands.

| Event | Fields | Effect |
|---|---|---|
| `rain` | `rounds?` (default 1), `caption?`, `captionEach?` | One Raindrop round per step: EigenTrust on the current graph, mint, credit `g_i·ΔS`. `rounds: n` expands into n steps; `caption` goes on the first round, `captionEach` on the others. |
| `endorse` | `from`, `to`, `weight?` (default 1) | Sets `trust[from][to] = weight`. |
| `revoke` | `from`, `to` | Removes that endorsement. |
| `setTrust` | `from`, `to: { id: weight, … }` | Replaces `from`'s whole row (use `{}` to endorse no one). |
| `join` | `node: { id, label, balance, tone?, x?, y? }`, `endorse?: { id: w }`, `endorsedBy?: { id: w }` | A newcomer enters, optionally endorsing and endorsed. |
| `transfer` | `from`, `to`, `amount > 0` | Moves tokens, clamped to the sender's balance. Supply is unchanged. |
| `note` | `caption` (required) | Nothing changes; a narrative beat (2.6 s). |
| `batch` | `events: [ … ]`, `caption?` | Several non-rain events applied as one step (no `rain` or nested `batch`). |

```js
events: [
  { type: 'note', caption: 'Meet Ada and Ben.' },
  { type: 'rain', caption: 'It rains pro-rata.' },
  { type: 'endorse', from: 'ada', to: 'ben', caption: 'Ada endorses Ben.' },
  { type: 'rain', rounds: 3, caption: 'Now the rain favors Ben.' },
  { type: 'join', node: { id: 'juno', label: 'Juno', balance: 0, tone: 'mint' }, endorsedBy: { ben: 1 } },
  { type: 'transfer', from: 'ada', to: 'juno', amount: 5 },
  { type: 'setTrust', from: 'ada', to: { ben: 1, juno: 2 } },
  { type: 'revoke', from: 'ben', to: 'juno' },
  { type: 'batch', caption: 'Everyone moves at once.', events: [
    { type: 'endorse', from: 'juno', to: 'ada' },
    { type: 'revoke', from: 'ada', to: 'ben' },
  ] },
  { type: 'rain', rounds: 2 },
],
```

Playback pauses where the script ends ("That's the end of the scenario"). With **keep
raining** on (the default), pressing play continues with extra rain rounds, up to 500; at
that cap the play button turns into Replay. With it off, play replays from the start (or
plays extra rounds already added). At the script's end, → steps into the next extra round's
first EigenTrust stop.

Tokens enter only through the rain (paper §3.7, §4.3): newcomers join with `balance: 0` and
get tokens by endorsement, gift or purchase (`transfer`). `check-scenarios.mjs` fails any
shipped scenario whose non-rain step changes the supply.

### Groups

An optional `groups: [{ id, label, members: [ids], tone? }]` draws a dashed box around the
members (joiners count once they appear) with one tag: `LABEL × n`, the group's share of
supply and of the rain, and during a rain its rain counting up. Use it when the lesson is
about a total that no single disk shows (`sybil-split`, `trust-sink`).

### Adding a scenario

1. Create `src/scenarios/<id>.js` that default-exports an object in the format above.
   Start the `description` with "What to watch:". Keep captions under about 64 characters.
2. Import it in `src/scenarios/index.js` and add it to `SCENARIOS` at the right place
   within its group.
3. Run `node scripts/check-scenarios.mjs <id>`. It validates the scenario, compiles it under
   a sweep of params, and prints per-round shares. If the scenario teaches a numeric claim,
   add a check for it in that script.
4. Run `npm test --workspace simulator`. `test/app.test.js` checks every shipped scenario;
   `test/player.test.js` covers the player (mode switches, parameter changes, the round cap).
5. Open `http://localhost:4174/#s=<id>` and play it in both EigenTrust modes, on a narrow
   window as well.

`validateScenario(scenario)` in `src/model/raindrop.js` returns human-readable errors
(unknown ids, bad weights, joins of existing ids, rain inside a batch, …). Use it when
authoring scenarios programmatically.

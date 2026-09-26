// Sandbox 15: a larger, messier community generated from a fixed seed, so every reload
// (and every test run) sees the same network. Endorsements follow preferential
// attachment: accounts that are already endorsed are more likely to be endorsed again.

// Small, fast, seedable PRNG (public domain).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  'Ada', 'Ben', 'Cleo', 'Dev', 'Fern', 'Gus', 'Hana', 'Ivo', 'Juno', 'Kai', 'Lu', 'Mia',
  'Noa', 'Oto', 'Pia', 'Quin', 'Ren', 'Sol', 'Tao', 'Uma', 'Vic', 'Wren', 'Xan', 'Yui',
  'Zed', 'Aki', 'Bea', 'Cai', 'Dax', 'Eli', 'Fay', 'Gil', 'Hal', 'Ines', 'Jax', 'Kit',
];
const START = 32; // founding members; the rest join during the timeline
const SEED = 20260926;

function generate() {
  const rand = mulberry32(SEED);
  const pick = (weights) => {
    let r = rand() * weights.reduce((a, w) => a + w, 0);
    for (let k = 0; k < weights.length; k++) if ((r -= weights[k]) < 0) return k;
    return weights.length - 1;
  };
  const ids = NAMES.map((n) => n.toLowerCase());
  const indegree = new Array(NAMES.length).fill(0);
  const trust = {};

  // Heavy-tailed balances: a few whales, many small holders, scaled to a supply of 100.
  const raw = NAMES.slice(0, START).map(() => Math.exp(rand() * 2.6));
  const scale = 100 / raw.reduce((a, x) => a + x, 0);
  const nodes = raw.map((x, k) => ({ id: ids[k], label: NAMES[k], balance: +(x * scale).toFixed(2) }));

  // Each founder (after the first two) endorses 1–3 earlier accounts, favoring the well-endorsed.
  const endorsePicks = (k, limit) => {
    const row = {};
    const count = 1 + Math.floor(rand() * 3);
    for (let e = 0; e < count; e++) {
      const j = pick(Array.from({ length: limit }, (_, q) => (q === k || row[ids[q]] ? 0 : indegree[q] * 2 + 1)));
      if (j === k || row[ids[j]]) continue;
      row[ids[j]] = 1 + Math.floor(rand() * 3);
      indegree[j] += 1;
    }
    return row;
  };
  for (let k = 0; k < START; k++) {
    if (k < 2) continue;
    if (rand() < 0.15) continue; // some holders endorse no one
    trust[ids[k]] = endorsePicks(k, k);
  }
  trust[ids[0]] = { [ids[1]]: 1 };

  // Newcomers: each is endorsed by one or two existing accounts and endorses back.
  const joins = ids.slice(START).map((id, q) => {
    const k = START + q;
    const endorsedBy = {};
    const a = Math.floor(rand() * START);
    endorsedBy[ids[a]] = 1;
    if (rand() < 0.6) endorsedBy[ids[(a + 7) % START]] = 1;
    return {
      type: 'join',
      node: { id, label: NAMES[k], balance: 0, tone: 'mint' },
      endorse: endorsePicks(k, START),
      endorsedBy,
    };
  });

  // The best-endorsed founder and a few mind changes, drawn from the same stream.
  const star = indegree.slice(0, START).indexOf(Math.max(...indegree.slice(0, START)));
  const movers = [3, 11, 19].map((k) => ({ type: 'setTrust', from: ids[k], to: { [ids[(k + 5) % START]]: 1 } }));
  return { nodes, trust, joins, movers, star: ids[star] };
}

const net = generate();

export default {
  id: 'random-community',
  title: 'Random community',
  summary: '36 accounts, preferential attachment, a few surprises.',
  description: 'What to watch: in a bigger graph most accounts are ordinary, and the rain concentrates on a few that many others endorse, '
    + 'directly or through friends. Tap the biggest halos to see who feeds them. Newcomers arrive endorsed and grow from zero. '
    + 'Switch EigenTrust to Instant to watch many rounds quickly, and try α = 0.2 vs 0.8 to see how much the graph matters.',
  tags: ['sandbox'],
  layout: 'force',
  nodes: net.nodes,
  trust: net.trust,
  events: [
    { type: 'note', caption: '32 holders. Some endorse, some don’t.' },
    { type: 'rain', rounds: 2, caption: 'It rains on the whole community.', captionEach: 'Trust pools where many endorsements point.' },
    { ...net.joins[0], caption: `${net.joins[0].node.label} joins, already vouched for.` },
    { type: 'rain', rounds: 2, caption: 'The rain finds the newcomer.', captionEach: 'The newcomer is found again.' },
    { type: 'batch', caption: 'Three holders change their minds.', events: net.movers },
    { type: 'rain', rounds: 2, caption: 'The latest graph decides.', captionEach: 'Every round uses the graph as it is now.' },
    { type: 'batch', caption: 'Three more newcomers join.', events: net.joins.slice(1) },
    { type: 'rain', rounds: 4, caption: 'Every round, it rains again.', captionEach: 'Rain turns into balance, and balance into weight.' },
  ],
  // Exposed for the scenario checks; not used by the simulator.
  meta: { seed: SEED, star: net.star },
};

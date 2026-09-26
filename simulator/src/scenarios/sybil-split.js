// Attacks 10: splitting one balance into many accounts (paper §6). The pre-trust term
// α·b is the same however the capital is divided, so the rain is too.
const SYBILS = 7;
const ids = Array.from({ length: SYBILS }, (_, k) => `eve${k + 2}`);
const ringOrder = ['eve', ...ids];

const around = (k) => {
  const a = (k / (SYBILS + 1)) * Math.PI * 2 + Math.PI / 2;
  return { x: +(0.55 + Math.cos(a) * 0.38).toFixed(3), y: +(Math.sin(a) * 0.38).toFixed(3) };
};

export default {
  id: 'sybil-split',
  title: 'Splitting doesn’t fool the rain',
  summary: 'Eve splits into eight accounts that endorse each other.',
  description: 'What to watch: Eve holds 40% of the supply and gets 40% of the rain. She splits her tokens across eight accounts that endorse each other in a ring, '
    + 'but the group still gets exactly 40% (see the total on the dashed box around them): its pre-trust α·b adds up to the same amount, and trust circling inside the ring never grows. '
    + 'Only outside endorsements could raise it, and nobody outside endorses them. Try any α: the group’s share never moves.',
  tags: ['attacks'],
  layout: 'force',
  nodes: [
    { id: 'ada', label: 'Ada', balance: 20, x: -0.7, y: -0.4 },
    { id: 'ben', label: 'Ben', balance: 15, x: -0.9, y: 0.3 },
    { id: 'cleo', label: 'Cleo', balance: 15, x: -0.3, y: 0.5 },
    { id: 'dev', label: 'Dev', balance: 10, x: -0.3, y: -0.2 },
    { id: 'eve', label: 'Eve', balance: 40, tone: 'rose', ...around(0) },
  ],
  trust: {
    ada: { ben: 1, cleo: 1 },
    ben: { dev: 1 },
    cleo: { dev: 1 },
    dev: { ada: 1 },
  },
  // One running total for Eve and her sybils: the lesson is the group's share, not any disk's.
  groups: [{ id: 'eve', label: 'Eve', members: ringOrder, tone: 'rose' }],
  events: [
    { type: 'note', caption: 'Eve holds 40% of the supply.' },
    { type: 'rain', rounds: 2, caption: 'She gets 40% of the rain.', captionEach: 'Again 40% of the rain for Eve.' },
    {
      type: 'batch',
      caption: 'Eve splits into eight accounts.',
      events: [
        ...ids.map((id, k) => ({ type: 'join', node: { id, label: `Eve ${k + 2}`, balance: 0, tone: 'rose', ...around(k + 1) } })),
        ...ids.map((id) => ({ type: 'transfer', from: 'eve', to: id, amount: 6 })),
      ],
    },
    {
      type: 'batch',
      caption: 'The sybils endorse each other in a ring.',
      events: ringOrder.map((id, k) => ({ type: 'setTrust', from: id, to: { [ringOrder[(k + 1) % ringOrder.length]]: 1 } })),
    },
    { type: 'rain', rounds: 3, caption: 'Still 40% of the rain. Splitting doesn’t help.', captionEach: 'Eight accounts, and still 40% of the rain.' },
  ],
};

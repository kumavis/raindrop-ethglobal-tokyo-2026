// Basics 5: a star. Many holders endorse one builder, who ends up with most of the rain.
const HOLDERS = [
  ['ada', 'Ada', 14], ['ben', 'Ben', 12], ['cleo', 'Cleo', 10], ['dev', 'Dev', 14],
  ['fern', 'Fern', 10], ['gus', 'Gus', 12], ['hana', 'Hana', 14], ['ivo', 'Ivo', 12],
];

const ring = HOLDERS.map(([id, label, balance], k) => {
  const a = -Math.PI / 2 + (k / HOLDERS.length) * Math.PI * 2;
  return { id, label, balance, x: +(Math.cos(a) * 0.85).toFixed(3), y: +(Math.sin(a) * 0.85).toFixed(3) };
});

const endorseMo = (ids) => ids.map((from) => ({ type: 'endorse', from, to: 'mo' }));

export default {
  id: 'hub',
  title: 'A contributor everyone trusts',
  summary: 'Eight holders endorse one builder.',
  description: 'What to watch: every holder keeps α of their weight and sends the rest to Mo, so Mo’s halo swallows most of the rain: '
    + 'g_Mo = 1 − α·(1 − b_Mo). The holders are diluted a little each round and Mo grows fast. '
    + 'Drag α toward 0 and Mo takes nearly all of it; toward 1 and the rain goes back to pro-rata.',
  tags: ['basics'],
  layout: 'fixed',
  nodes: [...ring, { id: 'mo', label: 'Mo', balance: 2, tone: 'violet', x: 0, y: 0, note: 'a builder' }],
  trust: {},
  events: [
    { type: 'note', caption: 'Eight holders and Mo, who builds for all of them.' },
    { type: 'rain', caption: 'No endorsements: Mo gets his tiny pro-rata share.' },
    { type: 'batch', caption: 'Three holders endorse Mo.', events: endorseMo(['ada', 'cleo', 'fern']) },
    { type: 'rain', caption: 'Mo’s halo grows past his disk.' },
    { type: 'batch', caption: 'Word spreads. Everyone endorses Mo.', events: endorseMo(['ben', 'dev', 'gus', 'hana', 'ivo']) },
    { type: 'rain', rounds: 4, caption: 'Most of every rain now falls on Mo.', captionEach: 'Mo takes most of the rain again. The holders are diluted.' },
  ],
};

// Sandbox 16: the baseline every other scenario is compared against. With no
// endorsements, g = b and the rain is a stock split.
const HOLDERS = [['ada', 'Ada', 30], ['ben', 'Ben', 22], ['cleo', 'Cleo', 18], ['dev', 'Dev', 14], ['fern', 'Fern', 10], ['gus', 'Gus', 6]];

export default {
  id: 'empty-canvas',
  title: 'Pro-rata baseline',
  summary: 'Six holders, no endorsements: rain is a stock split.',
  description: 'What to watch: with no endorsements every account keeps its own weight, so each halo sits exactly on its disk and every rain '
    + 'is split pro-rata. Everyone’s balance grows, but nobody’s share of supply moves: new tokens alone don’t fund anyone. '
    + 'Change α or the issuance and nothing changes but the totals. Compare with “Ada endorses Ben”.',
  tags: ['sandbox'],
  layout: 'fixed',
  nodes: HOLDERS.map(([id, label, balance], k) => {
    const a = -Math.PI / 2 + (k / HOLDERS.length) * Math.PI * 2;
    return { id, label, balance, x: +(Math.cos(a) * 0.7).toFixed(3), y: +(Math.sin(a) * 0.7).toFixed(3) };
  }),
  trust: {},
  events: [
    { type: 'note', caption: 'Six holders. No one endorses anyone.' },
    { type: 'rain', rounds: 6, caption: 'Everyone grows. Nobody’s share moves.', captionEach: 'Balances grow again. Every share holds still.' },
  ],
};

// Dynamics 7: the three ways an account's share of the rain grows (paper §3.8).
export default {
  id: 'three-ways',
  title: 'Three ways to get rain',
  summary: 'Get endorsed, get a gift, or buy in.',
  description: 'What to watch: three newcomers start at zero. Juno is endorsed, so her halo is bigger than her disk and her share keeps growing, '
    + 'while Ada keeps every coin. Kai gets a gift and Lu buys in: their tokens come out of someone else’s wallet, and without endorsements '
    + 'their halos exactly match their disks (a baseline, pro-rata share). Try α = 0.2 to widen the gap between Juno and the others.',
  tags: ['dynamics'],
  layout: 'force',
  nodes: [
    { id: 'ada', label: 'Ada', balance: 30, x: -0.6, y: -0.5 },
    { id: 'ben', label: 'Ben', balance: 25, x: -0.6, y: 0.1 },
    { id: 'cleo', label: 'Cleo', balance: 20, x: -0.2, y: 0.6 },
    { id: 'dev', label: 'Dev', balance: 25, x: -0.1, y: -0.1 },
  ],
  trust: {
    ben: { cleo: 1 },
    cleo: { ada: 1 },
  },
  events: [
    { type: 'note', caption: 'Four holders. Three newcomers are on the way.' },
    { type: 'rain', caption: 'It rains on the holders.' },
    {
      type: 'batch',
      caption: 'Juno, Kai and Lu join with nothing.',
      events: [
        { type: 'join', node: { id: 'juno', label: 'Juno', balance: 0, tone: 'mint', x: 0.7, y: -0.7 } },
        { type: 'join', node: { id: 'kai', label: 'Kai', balance: 0, tone: 'mint', x: 0.8, y: 0 } },
        { type: 'join', node: { id: 'lu', label: 'Lu', balance: 0, tone: 'gold', x: 0.7, y: 0.7 } },
      ],
    },
    { type: 'endorse', from: 'ada', to: 'juno', weight: 1, caption: 'Get endorsed: Ada vouches for Juno.' },
    { type: 'transfer', from: 'ben', to: 'kai', amount: 5, caption: 'Get a gift: Ben sends Kai 5 tokens.' },
    { type: 'transfer', from: 'dev', to: 'lu', amount: 5, caption: 'Buy in: Lu buys 5 tokens from Dev.' },
    { type: 'rain', rounds: 4, caption: 'All three get rain. Compare the halos.', captionEach: 'Compare the halos: all three keep gaining.' },
  ],
};

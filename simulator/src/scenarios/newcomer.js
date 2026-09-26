// Basics 4: a newcomer with nothing. Balance-anchored trust gives them nothing until
// someone endorses them; then the rain finds them.
export default {
  id: 'newcomer',
  title: 'Newcomers get found',
  summary: 'Zero balance, zero rain — until someone vouches.',
  description: 'What to watch: Juno joins with an empty wallet (a dotted ring). The first rain after she joins skips her entirely, because trust starts from balances. '
    + 'Once Cleo endorses her, a halo appears where there was no disk, and the rain grows her from nothing. '
    + 'Tap Juno to follow her share of supply, and lower α to see how much faster endorsements lift her.',
  tags: ['basics'],
  layout: 'force',
  nodes: [
    { id: 'ada', label: 'Ada', balance: 30, x: -0.6, y: -0.3 },
    { id: 'ben', label: 'Ben', balance: 25, x: -0.1, y: -0.6 },
    { id: 'cleo', label: 'Cleo', balance: 25, x: 0.2, y: 0.2 },
    { id: 'dev', label: 'Dev', balance: 20, x: -0.5, y: 0.5 },
  ],
  trust: {
    ada: { ben: 1 },
    ben: { cleo: 1 },
    dev: { ada: 1 },
  },
  events: [
    { type: 'note', caption: 'Four holders, a few endorsements.' },
    { type: 'rain', caption: 'It rains on the people already here.' },
    {
      type: 'join',
      node: { id: 'juno', label: 'Juno', balance: 0, tone: 'mint', x: 0.8, y: 0.3 },
      caption: 'Juno joins. No tokens, no history.',
    },
    { type: 'rain', caption: 'Nobody vouches for her. Not a drop.' },
    { type: 'endorse', from: 'cleo', to: 'juno', caption: 'Cleo endorses Juno.' },
    { type: 'rain', rounds: 4, caption: 'Now the rain finds her.', captionEach: 'Every round the rain finds Juno again.' },
  ],
};

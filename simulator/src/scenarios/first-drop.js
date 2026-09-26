// Basics 1: the smallest possible network. Rain without endorsements is a stock split;
// one endorsement bends it.
export default {
  id: 'first-drop',
  title: 'Ada endorses Ben',
  summary: 'Two accounts, one endorsement.',
  description: 'What to watch: disk area is an account’s tokens and the thin blue ring (its halo) is its trust score, the share of the next rain it gets. '
    + 'With no endorsements each ring sits on its disk, and the rain is a pro-rata stock split. '
    + 'After Ada endorses Ben, his ring outgrows his disk and he gains share every round. Ada keeps her coins, but only α (half) of her weight. '
    + 'Drag α toward 0 and nearly all the rain goes to Ben; toward 1 and it is pro-rata again.',
  tags: ['basics'],
  layout: 'fixed',
  nodes: [
    { id: 'ada', label: 'Ada', balance: 60, x: -0.55, y: 0 },
    { id: 'ben', label: 'Ben', balance: 40, x: 0.55, y: 0 },
  ],
  trust: {},
  events: [
    { type: 'note', caption: 'Disk size = tokens. The blue ring = trust score.' },
    { type: 'rain', caption: 'No endorsements: trust = balance, so the rain is pro-rata.' },
    { type: 'endorse', from: 'ada', to: 'ben', caption: 'Ada endorses Ben. Watch his blue ring grow past his disk.' },
    { type: 'rain', rounds: 3, caption: 'Then it rains. New tokens flow to Ben.', captionEach: 'Ben’s ring is still bigger than his disk: he gains again.' },
  ],
};

// Attacks & limits 14: funding becomes permanent power (adversarial review §5). Rain turns
// into balance, balance is influence, and an account that stops endorsing keeps it all.
export default {
  id: 'rich-get-richer',
  title: 'Funding becomes power',
  summary: 'An early recipient stops endorsing and keeps its share.',
  description: 'What to watch: everyone backs Rio early, and Rio’s disk swells round after round. When the community moves on to Nia, '
    + 'Rio stops endorsing anyone and keeps his own weight: his share of supply freezes at its new, much larger size, while Nia has to grow from nothing. '
    + 'Endorsements can be withdrawn from future rounds, but past rain stays. Tap Rio to see his share climb, then flatten.',
  tags: ['attacks'],
  layout: 'force',
  nodes: [
    { id: 'ada', label: 'Ada', balance: 25, x: -0.7, y: -0.5 },
    { id: 'ben', label: 'Ben', balance: 25, x: -0.8, y: 0.3 },
    { id: 'cleo', label: 'Cleo', balance: 25, x: -0.2, y: 0.7 },
    { id: 'dev', label: 'Dev', balance: 20, x: -0.2, y: -0.8 },
    { id: 'rio', label: 'Rio', balance: 5, tone: 'violet', x: 0.2, y: 0, note: 'an early recipient' },
  ],
  trust: {
    ada: { rio: 1 },
    ben: { rio: 1 },
    cleo: { rio: 1 },
    dev: { rio: 1 },
    rio: { ada: 1 },
  },
  events: [
    { type: 'note', caption: 'Everyone backs Rio. Rio thanks Ada.' },
    { type: 'rain', rounds: 4, caption: 'Round after round, Rio collects.', captionEach: 'Rio’s disk keeps swelling.' },
    {
      type: 'batch',
      caption: 'The community moves on to Nia.',
      events: [
        { type: 'join', node: { id: 'nia', label: 'Nia', balance: 0, tone: 'mint', x: 0.9, y: 0.2 } },
        { type: 'setTrust', from: 'ada', to: { nia: 1 } },
        { type: 'setTrust', from: 'ben', to: { nia: 1 } },
        { type: 'setTrust', from: 'cleo', to: { nia: 1 } },
        { type: 'setTrust', from: 'dev', to: { nia: 1 } },
      ],
    },
    { type: 'revoke', from: 'rio', to: 'ada', caption: 'Rio stops endorsing. He keeps his weight.' },
    { type: 'rain', rounds: 4, caption: 'Rio’s share holds. Nia starts from zero.', captionEach: 'Rio’s share stays frozen. Nia climbs from nothing.' },
  ],
};

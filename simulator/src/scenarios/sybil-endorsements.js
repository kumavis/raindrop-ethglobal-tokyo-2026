// Attacks & limits 13: one entity posing as many contributors (paper §6, second paragraph;
// adversarial review §4). Balance anchoring can't help when an honest endorser splits
// trust evenly across a list anyone can join.
const FAKES = ['f1', 'f2', 'f3', 'f4'];
const LIST = ['ana', 'bo'];

const even = (ids) => Object.fromEntries(ids.map((id) => [id, 1]));

export default {
  id: 'sybil-endorsements',
  title: 'Fake contributors',
  summary: 'Mal floods a curated list with fake projects.',
  description: 'What to watch: Hal endorses every project on a list, split evenly. When Mal adds four empty fake projects that each endorse him, '
    + 'Hal’s trust splits six ways and two thirds of it flows to Mal, even though the fakes hold nothing. Splitting balances can’t fool the rain, '
    + 'but posing as many contributors can fool an endorser, until Hal checks the list. Lower α to make Hal’s trust, and the leak, bigger.',
  tags: ['attacks'],
  layout: 'force',
  nodes: [
    { id: 'hal', label: 'Hal', balance: 40, tone: 'amber', x: -0.6, y: 0, note: 'endorses every project on a list' },
    { id: 'ida', label: 'Ida', balance: 20, x: -0.3, y: -0.7 },
    { id: 'joe', label: 'Joe', balance: 20, x: -0.3, y: 0.7 },
    { id: 'ana', label: 'Ana', balance: 5, tone: 'violet', x: 0.1, y: -0.35 },
    { id: 'bo', label: 'Bo', balance: 5, tone: 'violet', x: 0.1, y: 0.35 },
    { id: 'mal', label: 'Mal', balance: 10, tone: 'rose', x: 0.9, y: 0 },
  ],
  trust: {
    hal: even(LIST),
    ida: { ana: 1 },
    joe: { bo: 1 },
  },
  events: [
    { type: 'note', caption: 'Hal endorses every project on the list: Ana and Bo.' },
    { type: 'rain', rounds: 2, caption: 'Real contributors get Hal’s trust.', captionEach: 'Hal’s trust keeps flowing to Ana and Bo.' },
    {
      type: 'batch',
      caption: 'Mal registers four fake projects.',
      events: FAKES.map((id, k) => ({
        type: 'join',
        node: { id, label: `Proj ${k + 1}`, balance: 0, tone: 'rose', x: 0.55, y: -0.6 + k * 0.4 },
        endorse: { mal: 1 },
      })),
    },
    { type: 'setTrust', from: 'hal', to: even([...LIST, ...FAKES]), caption: 'The list grows. Hal’s trust splits six ways.' },
    { type: 'rain', rounds: 3, caption: 'Two thirds of Hal’s trust ends up with Mal.', captionEach: 'Again Mal’s fakes funnel Hal’s trust to Mal.' },
    { type: 'setTrust', from: 'hal', to: even(LIST), caption: 'Hal checks the list and drops the fakes.' },
    { type: 'rain', rounds: 2, caption: 'The leak stops.', captionEach: 'Mal is back to his own baseline.' },
  ],
};

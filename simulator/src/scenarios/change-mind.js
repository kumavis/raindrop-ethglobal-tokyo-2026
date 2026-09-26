// Dynamics 6: endorsements are live. Moving them mid-timeline changes the very next rain.
export default {
  id: 'change-mind',
  title: 'Change your mind',
  summary: 'The project stalls; endorsements move; the rain follows.',
  description: 'What to watch: the rain always follows the latest graph. While everyone backs Rio his halo dwarfs his disk; '
    + 'as holders move to Sol, Rio’s halo shrinks back to his disk (pro-rata) and Sol’s grows, with no proposal or vote in between. '
    + 'Step back and forth across the setTrust beats and compare the halos, or tap Rio to see his share flatten out.',
  tags: ['dynamics'],
  layout: 'force',
  nodes: [
    { id: 'ada', label: 'Ada', balance: 25, x: -0.7, y: -0.4 },
    { id: 'ben', label: 'Ben', balance: 25, x: -0.7, y: 0.4 },
    { id: 'cleo', label: 'Cleo', balance: 20, x: 0.7, y: -0.4 },
    { id: 'dev', label: 'Dev', balance: 20, x: 0.7, y: 0.4 },
    { id: 'rio', label: 'Rio', balance: 5, tone: 'violet', x: 0, y: -0.5, note: 'a builder' },
    { id: 'sol', label: 'Sol', balance: 5, tone: 'violet', x: 0, y: 0.5, note: 'a builder' },
  ],
  trust: {
    ada: { rio: 1 },
    ben: { rio: 1 },
    cleo: { rio: 1 },
    dev: { rio: 1 },
  },
  events: [
    { type: 'note', caption: 'Everyone backs Rio’s project.' },
    { type: 'rain', rounds: 2, caption: 'The rain follows: Rio grows.', captionEach: 'Rio grows again.' },
    { type: 'note', caption: 'Rio’s project stalls. Sol ships.' },
    { type: 'setTrust', from: 'ada', to: { sol: 1 }, caption: 'Ada moves her endorsement to Sol.' },
    { type: 'rain', caption: 'The very next round uses the new graph.' },
    {
      type: 'batch',
      caption: 'Ben, Cleo and Dev move too.',
      events: [
        { type: 'setTrust', from: 'ben', to: { sol: 1 } },
        { type: 'setTrust', from: 'cleo', to: { sol: 0.5, rio: 0.5 } },
        { type: 'setTrust', from: 'dev', to: { sol: 1 } },
      ],
    },
    { type: 'rain', rounds: 2, caption: 'No proposal. No voting period.', captionEach: 'The rain follows Sol now.' },
    { type: 'revoke', from: 'cleo', to: 'rio', caption: 'Cleo drops Rio entirely.' },
    { type: 'rain', rounds: 2, caption: 'Rio is back to his pro-rata share.', captionEach: 'Rio holds his pro-rata share: no more, no less.' },
  ],
};

// Attacks & limits 12: rank sinks (paper §8, adversarial review §4). A closed ring keeps
// all the trust flowing into it; an honest curator passes most of it on.
export default {
  id: 'trust-sink',
  title: 'Trust sinks',
  summary: 'An honest curator vs a ring that never passes trust on.',
  description: 'What to watch: Ada backs Cora, a curator who passes trust on to two builders. Ben backs Rex, whose ring only endorses itself. '
    + 'Cora and the ring start with the same 10 tokens and receive the same inflow. Compare the totals on their dashed boxes, not single disks: '
    + 'Cora passes her inflow on to Bo and Cy and stays near 10% of supply, while the ring keeps its inflow and climbs past 15%. '
    + 'The only leak from a closed ring is the α reset. Lower α to make the sink even stronger.',
  tags: ['attacks'],
  layout: 'fixed',
  nodes: [
    { id: 'ada', label: 'Ada', balance: 25, x: -0.95, y: -0.4 },
    { id: 'cora', label: 'Cora', balance: 10, tone: 'amber', x: -0.45, y: -0.4, note: 'a curator' },
    { id: 'bo', label: 'Bo', balance: 15, tone: 'violet', x: 0, y: -0.75 },
    { id: 'cy', label: 'Cy', balance: 15, tone: 'violet', x: 0, y: -0.05 },
    { id: 'ben', label: 'Ben', balance: 25, x: -0.95, y: 0.45 },
    { id: 'rex', label: 'Rex', balance: 4, tone: 'rose', x: 0.35, y: 0.45 },
    { id: 'ras', label: 'Ras', balance: 3, tone: 'rose', x: 0.8, y: 0.2 },
    { id: 'rue', label: 'Rue', balance: 3, tone: 'rose', x: 0.8, y: 0.72 },
  ],
  trust: {
    cora: { bo: 1, cy: 1 },
    rex: { ras: 1 },
    ras: { rue: 1 },
    rue: { rex: 1 },
  },
  // The lesson is about totals: the ring's three disks together vs Cora alone.
  groups: [
    { id: 'ring', label: 'Ring', members: ['rex', 'ras', 'rue'], tone: 'rose' },
    { id: 'cora', label: 'Cora', members: ['cora'], tone: 'amber' },
  ],
  events: [
    { type: 'note', caption: 'Cora curates. Rex, Ras and Rue endorse only each other.' },
    { type: 'rain', caption: 'Nobody is endorsed from outside yet.' },
    {
      type: 'batch',
      caption: 'Ada backs Cora. Ben backs Rex.',
      events: [
        { type: 'endorse', from: 'ada', to: 'cora' },
        { type: 'endorse', from: 'ben', to: 'rex' },
      ],
    },
    { type: 'rain', rounds: 5, caption: 'Cora passes trust on. The ring keeps it.', captionEach: 'Compare the totals: the ring outgrows Cora again.' },
  ],
};

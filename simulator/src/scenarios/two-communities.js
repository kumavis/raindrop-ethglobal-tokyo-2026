// Dynamics 8: two clusters that mostly endorse inside themselves, joined by one bridge.
const cluster = (members, cx, rotate = 0) => members.map(([id, label, balance], k) => {
  const a = rotate + (k / members.length) * Math.PI * 2;
  return { id, label, balance, x: +(cx + Math.cos(a) * 0.32).toFixed(3), y: +(Math.sin(a) * 0.32).toFixed(3) };
});

const ringTrust = (ids) => Object.fromEntries(ids.map((id, k) => [id, { [ids[(k + 1) % ids.length]]: 1 }]));

const WEST = [['ada', 'Ada', 14], ['ben', 'Ben', 12], ['cleo', 'Cleo', 12], ['dev', 'Dev', 10]];
const EAST = [['kai', 'Kai', 12], ['lu', 'Lu', 12], ['mia', 'Mia', 12], ['noa', 'Noa', 12]];

export default {
  id: 'two-communities',
  title: 'Two communities, one bridge',
  summary: 'Two clusters discover the same builder.',
  description: 'What to watch: each community circulates trust inside its own ring, so their halos stay close to their disks. '
    + 'Bo is small, but once both communities endorse him his halo draws from two pools at once and he grows fastest. '
    + 'Drag α down to 0.2 and the bridge captures much more of every rain; push it up to 0.8 and the rings hold on to theirs.',
  tags: ['dynamics'],
  layout: 'fixed',
  nodes: [
    ...cluster(WEST, -0.7, 0),
    ...cluster(EAST, 0.7, Math.PI),
    { id: 'bo', label: 'Bo', balance: 4, tone: 'violet', x: 0, y: -0.05, note: 'builds tools both communities use' },
  ],
  trust: {
    ...ringTrust(WEST.map(([id]) => id)),
    ...ringTrust(EAST.map(([id]) => id)),
  },
  events: [
    { type: 'note', caption: 'Two communities, each endorsing its own.' },
    { type: 'rain', caption: 'Trust circles inside each ring.' },
    { type: 'setTrust', from: 'ada', to: { ben: 1, bo: 1 }, caption: 'Ada finds Bo’s tools and endorses him.' },
    { type: 'rain', caption: 'Bo draws from the west.' },
    { type: 'setTrust', from: 'kai', to: { lu: 1, bo: 1 }, caption: 'Kai, in the east, endorses Bo too.' },
    { type: 'rain', rounds: 4, caption: 'The bridge draws from both pools.', captionEach: 'Bo draws from both communities again.' },
  ],
};

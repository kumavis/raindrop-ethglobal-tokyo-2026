// Basics 3: the ten-person network from the film (videos/src/protocol-first), same
// balances, endorsements and positions, replayed as a timeline you can scrub.

// Film canvas coordinates (1920×1080, centered on 1030,660) mapped into [-1, 1].
const at = (x, y) => ({ x: +((x - 1030) / 700).toFixed(3), y: +(((y - 660) / 700) * 1.25).toFixed(3) });

export default {
  id: 'everyone',
  title: 'Everyone endorses someone',
  summary: 'The film’s network: endorse, change your mind, welcome newcomers.',
  description: 'What to watch: once everyone endorses someone, the halos stop matching the disks. Trust pools on accounts that many others point to, '
    + 'directly or through a friend (Cleo, Gus and Ivo), and those disks grow fastest. When people change their minds the very next rain follows the new graph. '
    + 'Tap an account to see who it endorses and whether it is gaining or being diluted, and try α = 0.2 to amplify the effect.',
  tags: ['basics'],
  layout: 'fixed',
  nodes: [
    { id: 'ada', label: 'Ada', balance: 18, ...at(590, 610) },
    { id: 'ben', label: 'Ben', balance: 10, ...at(870, 440) },
    { id: 'cleo', label: 'Cleo', balance: 8, ...at(1140, 620) },
    { id: 'dev', label: 'Dev', balance: 20, ...at(330, 830) },
    { id: 'fern', label: 'Fern', balance: 12, ...at(1470, 470) },
    { id: 'gus', label: 'Gus', balance: 6, ...at(1420, 790) },
    { id: 'hana', label: 'Hana', balance: 14, ...at(770, 850) },
    { id: 'ivo', label: 'Ivo', balance: 12, ...at(1080, 880) },
  ],
  trust: {},
  events: [
    { type: 'note', caption: 'Eight holders. No endorsements yet.' },
    { type: 'endorse', from: 'ada', to: 'ben', caption: 'Ada endorses Ben. She keeps her coins.' },
    { type: 'rain', caption: 'Then it rains. New tokens flow to Ben.' },
    {
      type: 'batch',
      caption: 'Now everyone endorses someone.',
      events: [
        { type: 'setTrust', from: 'ada', to: { ben: 0.6, cleo: 0.4 } },
        { type: 'setTrust', from: 'ben', to: { cleo: 0.5, hana: 0.5 } },
        { type: 'setTrust', from: 'cleo', to: { gus: 1 } },
        { type: 'setTrust', from: 'dev', to: { ada: 0.5, hana: 0.5 } },
        { type: 'setTrust', from: 'fern', to: { cleo: 0.5, gus: 0.5 } },
        { type: 'setTrust', from: 'gus', to: { ivo: 1 } },
        { type: 'setTrust', from: 'hana', to: { ivo: 1 } },
        { type: 'setTrust', from: 'ivo', to: { cleo: 1 } },
      ],
    },
    { type: 'rain', caption: 'Trust flows through. Scores settle where it pools.' },
    { type: 'setTrust', from: 'ada', to: { ivo: 0.6, cleo: 0.4 }, caption: 'Change your mind anytime. Ada backs Ivo now.' },
    {
      type: 'batch',
      caption: 'No proposal, no voting period. Others move too.',
      events: [
        { type: 'setTrust', from: 'fern', to: { gus: 1 } },
        { type: 'setTrust', from: 'ben', to: { hana: 1 } },
        { type: 'setTrust', from: 'dev', to: { ada: 1 } },
        { type: 'setTrust', from: 'cleo', to: { gus: 0.5, ben: 0.5 } },
        { type: 'setTrust', from: 'hana', to: { ivo: 0.5, dev: 0.5 } },
        { type: 'setTrust', from: 'ivo', to: { cleo: 0.5, fern: 0.5 } },
      ],
    },
    { type: 'rain', rounds: 3, caption: 'Every round, it rains on the latest scores.', captionEach: 'The same graph, so the same scores decide again.' },
    {
      type: 'batch',
      caption: 'Juno and Kai join and buy tokens from Dev and Hana.',
      // Tokens only enter through the rain, so newcomers join empty and buy in.
      events: [
        { type: 'join', node: { id: 'kai', label: 'Kai', balance: 0, tone: 'mint', ...at(1700, 880) }, endorse: { fern: 1 } },
        { type: 'join', node: { id: 'juno', label: 'Juno', balance: 0, tone: 'mint', ...at(1730, 610) }, endorse: { kai: 0.6, cleo: 0.4 } },
        { type: 'transfer', from: 'dev', to: 'kai', amount: 4 },
        { type: 'transfer', from: 'hana', to: 'juno', amount: 5 },
      ],
    },
    {
      type: 'batch',
      caption: 'Fern endorses Juno. Gus endorses Kai.',
      events: [
        { type: 'setTrust', from: 'fern', to: { gus: 0.5, juno: 0.5 } },
        { type: 'setTrust', from: 'gus', to: { ivo: 0.7, kai: 0.3 } },
      ],
    },
    { type: 'rain', rounds: 3, caption: 'Endorse them, and the rain finds them.', captionEach: 'Juno and Kai keep getting found.' },
  ],
};

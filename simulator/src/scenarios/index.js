// The prebuilt scenario library, in the order the picker shows it (pedagogical order:
// basics → dynamics → attacks & limits → sandbox; a scenario's first tag names its
// picker group). Each scenario lives in its own file; scripts/check-scenarios.mjs
// validates them and checks the claim each one teaches.
import firstDrop from './first-drop.js';
import trustFlows from './trust-flows.js';
import everyone from './everyone.js';
import newcomer from './newcomer.js';
import hub from './hub.js';
import changeMind from './change-mind.js';
import threeWays from './three-ways.js';
import twoCommunities from './two-communities.js';
import eigentrustLab from './eigentrust-lab.js';
import sybilSplit from './sybil-split.js';
import costOfEndorsing from './cost-of-endorsing.js';
import trustSink from './trust-sink.js';
import sybilEndorsements from './sybil-endorsements.js';
import richGetRicher from './rich-get-richer.js';
import randomCommunity from './random-community.js';
import emptyCanvas from './empty-canvas.js';

export const SCENARIOS = [
  firstDrop,
  trustFlows,
  everyone,
  newcomer,
  hub,
  changeMind,
  threeWays,
  twoCommunities,
  eigentrustLab,
  sybilSplit,
  costOfEndorsing,
  trustSink,
  sybilEndorsements,
  richGetRicher,
  randomCommunity,
  emptyCanvas,
];

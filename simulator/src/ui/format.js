// Human-readable descriptions of timeline steps (auto captions for steps whose scenario
// event has none, scrubber tooltips). Number formatters live in ../format.js (shared with
// the canvas) and are re-exported here.

import { stateAt } from '../model/raindrop.js';
import { fmtNum } from '../format.js';

export { fmtNum, fmtPct, fmtPts, fmtSci } from '../format.js';

export const STEP_KIND = {
  rain: 'rain',
  endorse: 'trust',
  revoke: 'trust',
  setTrust: 'trust',
  batch: 'trust',
  join: 'join',
  transfer: 'transfer',
  note: 'note',
};

export const KIND_LABEL = {
  rain: 'Rain',
  trust: 'Trust change',
  join: 'Newcomer',
  transfer: 'Transfer',
  note: 'Note',
};

const labelIn = (state, id) => state.nodes.find((n) => n.id === id)?.label ?? id;

const listNames = (names) => {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length <= 4) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
};

function describeEvent(e, before, after) {
  const L = (id) => labelIn(after, id) ?? labelIn(before, id);
  switch (e.type) {
    case 'endorse':
      return `${L(e.from)} endorses ${L(e.to)}${e.weight && e.weight !== 1 ? ` (weight ${e.weight})` : ''}`;
    case 'revoke':
      return `${L(e.from)} revokes the endorsement of ${L(e.to)}`;
    case 'setTrust': {
      const to = Object.keys(e.to ?? {});
      return to.length ? `${L(e.from)} now endorses ${listNames(to.map(L))}` : `${L(e.from)} stops endorsing anyone`;
    }
    case 'join': {
      const name = e.node?.label ?? e.node?.id;
      const bits = [];
      const out = Object.keys(e.endorse ?? {});
      const inn = Object.keys(e.endorsedBy ?? {});
      if (inn.length) bits.push(`endorsed by ${listNames(inn.map(L))}`);
      if (out.length) bits.push(`endorsing ${listNames(out.map(L))}`);
      return `${name} joins${e.node?.balance ? ` with ${fmtNum(e.node.balance)} tokens` : ''}${bits.length ? ', ' + bits.join(', ') : ''}`;
    }
    case 'transfer':
      return `${L(e.from)} sends ${fmtNum(e.amount)} tokens to ${L(e.to)}`;
    case 'note':
      return e.caption ?? '';
    case 'batch': {
      const n = e.events?.length ?? 0;
      const kinds = new Set((e.events ?? []).map((x) => x.type));
      if (kinds.size === 1 && kinds.has('join')) return `${n} newcomers join`;
      if (kinds.size === 1 && kinds.has('transfer')) return `${n} transfers`;
      return n === 1 ? describeEvent(e.events[0], before, after) : `${n} changes to the network`;
    }
    default:
      return e.type;
  }
}

/** Fallback caption for a step without one. */
export function autoCaption(step) {
  if (!step) return '';
  if (step.type === 'rain') {
    const d = step.detail;
    const tail = step.extra ? ' (extra round)' : '';
    return `Round ${step.after.round}: it rains ${fmtNum(d.minted)} tokens${tail}`;
  }
  return describeEvent(step.event, step.before, step.after);
}

export const captionOf = (step) => step?.caption || autoCaption(step);

/** Short title for scrubber tooltips. */
export function stepTitle(step) {
  if (step.type === 'rain') return `Round ${step.after.round}${step.extra ? ' · extra' : ''}`;
  return KIND_LABEL[STEP_KIND[step.type]] ?? step.type;
}

/** The last rain step strictly before `cursor`, or null. */
export function lastRainBefore(compiled, cursor) {
  for (let c = Math.min(cursor, compiled.steps.length) - 1; c >= 0; c--) {
    if (compiled.steps[c].type === 'rain') return compiled.steps[c];
  }
  return null;
}

export { stateAt };

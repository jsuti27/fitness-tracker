// Stalled-lift detection. Pure logic — no DOM, no storage.
//
// A lift is stalled when its last 3 sessions all failed to beat the best set
// that came before them. "Best" is the estimated one-rep max of the session's
// best set, so 45kg x 10 and 50kg x 7 compare fairly — a plain heaviest-weight
// test misses rep progress, and a plain most-reps test misses weight progress.
//
// Each stall then gets ONE next step, picked from the pattern in the log rather
// than generic advice: a lift you earned the jump on needs a different fix from
// one whose weight jumps are simply too coarse.

import { DEFAULT_INCREMENT } from './program.js';
import { earnedIncrease, totalReps } from './progression.js';
import { bestSet, daysBetween } from './calculations.js';

export const STALL_SESSIONS = 3;

// Epley. Accurate enough below ~12 reps, and only ever compared with itself.
export function estimatedMax(set) {
  if (!set || typeof set.weight !== 'number' || typeof set.reps !== 'number' || set.reps <= 0) return 0;
  return set.weight * (1 + set.reps / 30);
}

// Every logged session of one exercise, oldest first. Entries with no completed
// set (a weight typed but no reps) are skipped — they say nothing about strength.
export function liftHistory(sessions, exercise) {
  const matcher = e => (exercise.id && e.exerciseId === exercise.id) || e.name === exercise.name;
  return (sessions || [])
    .filter(s => (s.exercises || []).some(matcher))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(s => {
      const sets = (s.exercises.find(matcher).sets || [])
        .filter(set => typeof set.weight === 'number' && typeof set.reps === 'number' && set.reps > 0);
      return { date: s.date, sets, best: Math.max(0, ...sets.map(estimatedMax)) };
    })
    .filter(h => h.sets.length);
}

// { stalled, sinceBest, bestDate, history }. sinceBest counts sessions logged
// after the last new best.
export function stallStatus(history) {
  if (!history || history.length < STALL_SESSIONS + 1) {
    return { stalled: false, sinceBest: 0, bestDate: null };
  }
  let top = -1;
  let bestIdx = 0;
  history.forEach((h, i) => {
    // A hair of tolerance so float noise can't count as a new best.
    if (h.best > top + 1e-6) { top = h.best; bestIdx = i; }
  });
  const sinceBest = history.length - 1 - bestIdx;
  return { stalled: sinceBest >= STALL_SESSIONS, sinceBest, bestDate: history[bestIdx].date };
}

const round = (n, step) => Math.round(n / step) * step;
const fmt = n => String(Math.round(n * 100) / 100);

// The single most useful next step for a stalled lift, as { kind, tip }.
// Rules are checked in order; the first that matches wins.
export function diagnose(history, exercise) {
  const recent = history.slice(-STALL_SESSIONS);
  const inc = exercise.increment == null ? DEFAULT_INCREMENT : exercise.increment;
  const latest = bestSet(recent[recent.length - 1].sets);
  const w = latest ? latest.weight : 0;

  // 1. The program said go up, and the weight never moved. Confidence, not
  //    strength, is the limiter — so the tip is the number to put on the bar.
  const earned = recent.filter(h => earnedIncrease(h.sets, exercise.repRange, exercise.targetSets));
  if (earned.length) {
    const earnedAt = Math.max(...earned.map(h => bestSet(h.sets).weight));
    if (w <= earnedAt) {
      const times = earned.length === 1 ? 'once' : `${earned.length}×`;
      return {
        kind: 'earned',
        target: Math.round((earnedAt + inc) * 100) / 100,
        tip: `You've earned the jump ${times} — go up to ${fmt(earnedAt + inc)}kg. Fewer reps at first is expected.`,
      };
    }
  }

  // 2. The smallest jump available is a big slice of the load, so every jump
  //    drops you out of the rep range and back to "hold".
  if (w > 0 && inc / w > 0.25) {
    const pct = Math.round((inc / w) * 100);
    return {
      kind: 'jump',
      tip: `Each jump is ${pct}% of the weight — widen the rep range (e.g. 12–20) or use smaller plates or a cuff.`,
    };
  }

  // 3. Same weight, fewer reps over the last sessions: fatigue, not a ceiling.
  const sameWeight = recent.every(h => bestSet(h.sets).weight === w);
  const reps = recent.map(h => totalReps(h.sets));
  if (sameWeight && reps[reps.length - 1] < reps[0]) {
    const deload = Math.max(inc, round(w * 0.9, inc));
    return {
      kind: 'fading',
      tip: `Reps are dropping at ${fmt(w)}kg — deload to ${fmt(Math.min(deload, w - inc))}kg for one session, then build back.`,
    };
  }

  // 4. The lift simply isn't trained often enough to move.
  const span = daysBetween(recent[0].date, recent[recent.length - 1].date);
  const every = Math.round(span / (recent.length - 1));
  if (every > 10) {
    return {
      kind: 'gap',
      tip: `You're only doing this every ~${every} days — training it more often will move it more than any tweak.`,
    };
  }

  return {
    kind: 'change',
    tip: 'Change one thing for 3–4 weeks: add a set, slow the lowering to 3 seconds, or swap to a similar variation.',
  };
}

// Everything the Train tab needs for one exercise. null when not stalled.
export function stallFor(sessions, exercise) {
  const history = liftHistory(sessions, exercise);
  const status = stallStatus(history);
  if (!status.stalled) return null;
  return { ...status, ...diagnose(history, exercise) };
}

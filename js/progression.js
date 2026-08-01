// The coach's progression rule, as pure functions. No DOM, no storage.
//
//   "If all sets do not meet the range, stay with this weight next week.
//    If you achieve all sets within the range or exceed it, go up in weight."
//
// Note "or exceed it" — beating the top of the range must not be punished,
// because the same program notes say not to stop at the top of the range.

import { parseRepRange, DEFAULT_INCREMENT } from './program.js';
import { bestSet } from './calculations.js';

// Most recent logged entry for an exercise. Matches on id first, then falls
// back to name so sessions logged before ids existed still count.
export function lastEntryFor(sessions, exerciseId, exerciseName) {
  const matches = (sessions || [])
    .filter(s => (s.exercises || []).some(e =>
      (exerciseId && e.exerciseId === exerciseId) || e.name === exerciseName))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const session = matches.at(-1);
  if (!session) return null;

  const ex = session.exercises.find(e =>
    (exerciseId && e.exerciseId === exerciseId) || e.name === exerciseName);
  return { date: session.date, name: ex.name, note: ex.note || '', sets: ex.sets || [] };
}

// Did every working set land at or above the bottom of the range, and were
// there at least as many of them as the program calls for?
export function setsAllInRange(sets, repRange, targetSets) {
  const range = parseRepRange(repRange);
  if (!range) return false;
  // Sets with no reps entered aren't misses — they're sets that weren't logged.
  const done = (sets || []).filter(s => typeof s.reps === 'number' && !Number.isNaN(s.reps));
  if (done.length < targetSets) return false;
  return done.every(s => s.reps >= range.low);
}

// What to put in the weight box, and why.
//   up   — hit the range last time, so add the increment
//   hold — missed a set, so repeat the weight
//   none — no history, so no suggestion at all
export function suggestion(lastEntry, exercise) {
  const empty = { weight: null, verdict: 'none', lastText: '', note: '' };
  if (!lastEntry) return empty;

  // Anchor on the heaviest set. A lighter final set is a drop-off, and basing
  // the suggestion on it would quietly walk the weight down over weeks.
  const anchor = bestSet(lastEntry.sets);
  if (!anchor) return empty;

  const hit = setsAllInRange(lastEntry.sets, exercise.repRange, exercise.targetSets);
  const increment = exercise.increment == null ? DEFAULT_INCREMENT : exercise.increment;
  const weight = hit ? anchor.weight + increment : anchor.weight;

  const reps = lastEntry.sets
    .filter(s => typeof s.reps === 'number' && !Number.isNaN(s.reps))
    .map(s => s.reps);

  return {
    weight: Math.round(weight * 100) / 100,
    verdict: hit ? 'up' : 'hold',
    lastText: reps.length ? `${anchor.weight}kg × ${reps.join(', ')}` : `${anchor.weight}kg`,
    note: lastEntry.note || '',
  };
}

// The coach's progression rule, as pure functions. No DOM, no storage.
//
//   "If all sets do not meet the range, stay with this weight next week.
//    If you achieve all sets within the range or exceed it, go up in weight."
//
// Note "or exceed it" — beating the top of the range must not be punished,
// because the same program notes say not to stop at the top of the range.

import { parseRepRange, DEFAULT_INCREMENT } from './program.js';
import { bestSet, daysBetween } from './calculations.js';

// The n most recent logged entries for an exercise, oldest first. Matches on id
// first, then falls back to name so sessions logged before ids existed still
// count. Two is what the "building" verdict needs: the last session to suggest
// from, and the one before it to compare rep counts against.
export function lastEntriesFor(sessions, exerciseId, exerciseName, n = 2) {
  const matcher = e => (exerciseId && e.exerciseId === exerciseId) || e.name === exerciseName;

  return (sessions || [])
    .filter(s => (s.exercises || []).some(matcher))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-n)
    .map(session => {
      const ex = session.exercises.find(matcher);
      return {
        date: session.date,
        day: session.day || '',
        name: ex.name,
        note: ex.note || '',
        sets: ex.sets || [],
      };
    });
}

// Most recent logged entry for an exercise, or null.
export function lastEntryFor(sessions, exerciseId, exerciseName) {
  return lastEntriesFor(sessions, exerciseId, exerciseName, 1)[0] || null;
}

// "4 days ago" / "yesterday" / "today". With exercises repeating across a
// split, knowing *when* you last did one matters as much as the numbers.
export function describeGap(fromDate, toDate) {
  if (!fromDate || !toDate) return '';
  const n = daysBetween(fromDate, toDate);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
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

// Total reps actually logged. Used to spot rep-only progression at a load that
// hasn't changed — more reps at the same weight is still progressive overload.
export function totalReps(sets) {
  return (sets || [])
    .filter(s => typeof s.reps === 'number' && !Number.isNaN(s.reps))
    .reduce((sum, s) => sum + s.reps, 0);
}

// The progression gate. Softer than strict double progression: the heaviest set
// has to reach the TOP of the range, everything else only has to clear the
// bottom. Requiring every set at the top stalls on the natural rep dropoff
// across a session.
//
// Deliberately separate from setsAllInRange, which sync.js uses per-set for the
// sheet's "In range?" column. Changing that function's meaning would rewrite
// what every historical Y in the sheet stands for.
export function earnedIncrease(sets, repRange, targetSets) {
  const range = parseRepRange(repRange);
  if (!range) return false;

  const done = (sets || []).filter(s => typeof s.reps === 'number' && !Number.isNaN(s.reps));
  if (done.length < targetSets) return false;
  if (!done.every(s => s.reps >= range.low)) return false;

  const anchor = bestSet(done);
  return anchor != null && anchor.reps >= range.high;
}

// What to put in the weight box, and why.
//   up   — hit the range last time, so add the increment
//   hold — missed a set, so repeat the weight
//   none — no history, so no suggestion at all
export function suggestion(lastEntry, exercise, priorEntry = null) {
  const empty = { weight: null, verdict: 'none', lastText: '', note: '', date: '', day: '' };
  if (!lastEntry) return empty;

  // Anchor on the heaviest set. A lighter final set is a drop-off, and basing
  // the suggestion on it would quietly walk the weight down over weeks.
  const anchor = bestSet(lastEntry.sets);
  if (!anchor) return empty;

  const hit = earnedIncrease(lastEntry.sets, exercise.repRange, exercise.targetSets);
  const increment = exercise.increment == null ? DEFAULT_INCREMENT : exercise.increment;
  const weight = hit ? anchor.weight + increment : anchor.weight;

  // Rep-only progression at an unchanged load is still progressive overload,
  // and rendering it as a plain "hold" reads as failure. Only comparable when
  // the anchor weight matches — rep counts at different loads mean nothing.
  let verdict = 'hold';
  if (hit) {
    verdict = 'up';
  } else if (priorEntry) {
    const priorAnchor = bestSet(priorEntry.sets);
    if (priorAnchor && priorAnchor.weight === anchor.weight
        && totalReps(lastEntry.sets) > totalReps(priorEntry.sets)) {
      verdict = 'building';
    }
  }

  const reps = lastEntry.sets
    .filter(s => typeof s.reps === 'number' && !Number.isNaN(s.reps))
    .map(s => s.reps);

  return {
    weight: Math.round(weight * 100) / 100,
    verdict,
    date: lastEntry.date,
    day: lastEntry.day || '',
    lastText: reps.length ? `${anchor.weight}kg × ${reps.join(', ')}` : `${anchor.weight}kg`,
    note: lastEntry.note || '',
  };
}

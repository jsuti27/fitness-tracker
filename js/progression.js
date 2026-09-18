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

// Total reps last session minus the session before, but only when both sessions
// were anchored at the same weight. Rep counts across different loads aren't
// comparable, so those return null rather than a misleading zero.
export function repsTrend(lastEntry, priorEntry) {
  if (!lastEntry || !priorEntry) return null;
  const anchor = bestSet(lastEntry.sets);
  const priorAnchor = bestSet(priorEntry.sets);
  if (!anchor || !priorAnchor || anchor.weight !== priorAnchor.weight) return null;
  return totalReps(lastEntry.sets) - totalReps(priorEntry.sets);
}

// What to put in the weight box, and why.
//   up      — hit the range last time, so add the increment
//   building— same weight, more total reps: overloading without adding load
//   fading  — same weight, fewer total reps: going backwards, so hold
//   hold    — missed a set, so repeat the weight
//   none    — no history, so no suggestion at all
//
// `fading` outranks `up`. The coach's rule looks at one session in isolation, so
// a lift can shed reps week over week and still pass the gate — which is exactly
// how the incline DB press got told to add 2.5kg while its volume fell 25 → 23.
// Adding load on top of falling volume buys a worse session, so the trend wins.
export function suggestion(lastEntry, exercise, priorEntry = null) {
  const empty = {
    weight: null, verdict: 'none', lastText: '', note: '', date: '', day: '', repsDelta: null,
  };
  if (!lastEntry) return empty;

  // Anchor on the heaviest set. A lighter final set is a drop-off, and basing
  // the suggestion on it would quietly walk the weight down over weeks.
  const anchor = bestSet(lastEntry.sets);
  if (!anchor) return empty;

  const hit = earnedIncrease(lastEntry.sets, exercise.repRange, exercise.targetSets);
  const increment = exercise.increment == null ? DEFAULT_INCREMENT : exercise.increment;

  // Null when the two sessions used different weights, so neither rep-trend
  // verdict can fire on numbers that aren't comparable.
  const delta = repsTrend(lastEntry, priorEntry);

  let verdict = 'hold';
  if (delta != null && delta < 0) verdict = 'fading';
  else if (hit) verdict = 'up';
  else if (delta != null && delta > 0) verdict = 'building';

  const weight = verdict === 'up' ? anchor.weight + increment : anchor.weight;

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
    repsDelta: delta,
  };
}

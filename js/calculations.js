// Pure calculation helpers — no DOM, no storage. Run identically in the
// browser and in `node --test`.

// --- Date helpers (UTC to avoid timezone drift) ---------------------------

const MS_PER_DAY = 86400000;

export function daysBetween(aStr, bStr) {
  const [ay, am, ad] = aStr.split('-').map(Number);
  const [by, bm, bd] = bStr.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Human-friendly date, e.g. "21 Sep 2026".
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

// "11 Sep" — the year is dead weight on a chart axis where every point is
// within a few months of the others.
export function shortDate(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]}`;
}

// --- Workouts ---

// 1-based program week number for a date, relative to the program start.
export function programWeek(startDate, dateStr) {
  const diff = daysBetween(startDate, dateStr);
  if (diff < 0) return 0;
  return Math.floor(diff / 7) + 1;
}

// Total number of working sets logged in a session.
export function sessionSetCount(session) {
  if (!session || !Array.isArray(session.exercises)) return 0;
  return session.exercises.reduce((sum, ex) => sum + (ex.sets ? ex.sets.length : 0), 0);
}

// Best (heaviest) set in a list of {weight, reps}. Ties broken by reps.
export function bestSet(sets) {
  let best = null;
  for (const s of sets || []) {
    if (s.weight == null) continue;
    if (
      best == null ||
      s.weight > best.weight ||
      (s.weight === best.weight && (s.reps || 0) > (best.reps || 0))
    ) {
      best = s;
    }
  }
  return best;
}

// Training volume (kg lifted) per program week, split by day type.
// dayTypes drives the columns, so this works for any split — Push/Pull/Legs,
// Upper/Lower, or anything else the user sets up.
// Sessions with no week number are skipped — there is nowhere to put them.
export function weeklyVolume(sessions, dayTypes = ['Push', 'Pull', 'Legs']) {
  const blank = () => Object.fromEntries(dayTypes.map(d => [d, 0]));
  const byWeek = new Map();

  for (const s of sessions || []) {
    if (typeof s.week !== 'number') continue;
    if (!byWeek.has(s.week)) byWeek.set(s.week, { week: s.week, ...blank() });
    const row = byWeek.get(s.week);
    // A session logged under a day type that no longer exists still counts in
    // history, but has no column to sit in here.
    if (!(s.day in row)) continue;
    for (const ex of s.exercises || []) {
      for (const set of ex.sets || []) {
        if (typeof set.weight === 'number' && typeof set.reps === 'number') {
          row[s.day] += set.weight * set.reps;
        }
      }
    }
  }

  return [...byWeek.values()]
    .sort((a, b) => a.week - b.week)
    .map(r => {
      const out = { week: r.week };
      for (const d of dayTypes) out[d] = Math.round(r[d]);
      return out;
    });
}

// Progression history for one exercise across sessions, oldest -> newest.
// Each point: { date, topWeight, totalReps, best:{weight,reps} }.
// Matches on id first and falls back to name, so renaming a lift keeps its
// chart and history — the same rule progression.js already uses to pick the
// entry it suggests from. Matching on name alone silently emptied both.
export function exerciseProgression(sessions, exerciseName, exerciseId = null) {
  const matcher = e => (exerciseId && e.exerciseId === exerciseId) || e.name === exerciseName;

  return (sessions || [])
    .filter(s => s.exercises && s.exercises.some(matcher))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(s => {
      const ex = s.exercises.find(matcher);
      const sets = (ex.sets || []).filter(set => set.weight != null);
      const best = bestSet(sets);
      return {
        date: s.date,
        topWeight: best ? best.weight : 0,
        totalReps: sets.reduce((sum, set) => sum + (set.reps || 0), 0),
        // Every set's weight x reps, added up. The one number that moves when
        // you add load OR reps, so it tracks progress on a lift parked at the
        // same weight — which top weight alone cannot do.
        volume: sets.reduce((sum, set) => sum + set.weight * (set.reps || 0), 0),
        best: best || { weight: 0, reps: 0 },
      };
    });
}

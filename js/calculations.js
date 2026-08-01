// Pure calculation helpers — no DOM, no storage. Run identically in the
// browser and in `node --test`.

// --- Macros & progress ----------------------------------------------------

export function caloriesFromMacros({ protein = 0, carbs = 0, fats = 0 } = {}) {
  return Math.round((protein || 0) * 4 + (carbs || 0) * 4 + (fats || 0) * 9);
}

// Percentage of a target reached (0..unbounded). Guards against bad input.
export function pct(value, target) {
  if (!target || target <= 0 || value == null) return 0;
  return Math.round((value / target) * 100);
}

// --- Date helpers (UTC to avoid timezone drift) ---------------------------

const MS_PER_DAY = 86400000;

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * MS_PER_DAY;
  return new Date(t).toISOString().slice(0, 10);
}

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

// --- Steps ----------------------------------------------------------------

// Consecutive days ending at todayStr where steps >= goal.
export function stepStreak(days, goal, todayStr) {
  const stepsByDate = new Map(
    days.filter(d => d.steps != null).map(d => [d.date, d.steps])
  );
  let streak = 0;
  let cursor = todayStr;
  while (stepsByDate.has(cursor) && stepsByDate.get(cursor) >= goal) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// --- Weight projection ----------------------------------------------------

// Linear regression of weight over time -> rate and projected goal date.
// status: 'not-enough-data' | 'not-on-track' | 'on-track' | 'goal-reached'
export function weightProjection(days, goalWeight) {
  const weighIns = days
    .filter(d => typeof d.weight === 'number' && !Number.isNaN(d.weight))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const span = weighIns.length ? daysBetween(weighIns[0].date, weighIns.at(-1).date) : 0;
  if (weighIns.length < 3 || span < 7) {
    return { status: 'not-enough-data', ratePerWeek: null, etaDate: null };
  }

  const x0 = weighIns[0].date;
  const xs = weighIns.map(d => daysBetween(x0, d.date));
  const ys = weighIns.map(d => d.weight);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;          // kg per day
  const intercept = meanY - slope * meanX;
  const ratePerWeek = Math.round(slope * 7 * 100) / 100;

  const lastX = xs.at(-1);
  const currentFitted = slope * lastX + intercept;

  if (currentFitted <= goalWeight) {
    return { status: 'goal-reached', ratePerWeek, etaDate: weighIns.at(-1).date };
  }
  // Must be meaningfully losing (>~50g/week) to project an ETA.
  if (slope >= -0.007) {
    return { status: 'not-on-track', ratePerWeek, etaDate: null };
  }
  const daysToGoal = Math.ceil((goalWeight - currentFitted) / slope); // slope<0 -> positive
  return { status: 'on-track', ratePerWeek, etaDate: addDays(weighIns.at(-1).date, daysToGoal) };
}

// --- Workouts (Phase 2) ---------------------------------------------------

// 1-based program week number for a date, relative to the program start.
export function programWeek(startDate, dateStr) {
  const diff = daysBetween(startDate, dateStr);
  if (diff < 0) return 0;
  return Math.floor(diff / 7) + 1;
}

// Total number of working sets logged in a session.
export function sessionVolume(session) {
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
export function exerciseProgression(sessions, exerciseName) {
  return (sessions || [])
    .filter(s => s.exercises && s.exercises.some(e => e.name === exerciseName))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(s => {
      const ex = s.exercises.find(e => e.name === exerciseName);
      const sets = (ex.sets || []).filter(set => set.weight != null);
      const best = bestSet(sets);
      return {
        date: s.date,
        topWeight: best ? best.weight : 0,
        totalReps: sets.reduce((sum, set) => sum + (set.reps || 0), 0),
        best: best || { weight: 0, reps: 0 },
      };
    });
}

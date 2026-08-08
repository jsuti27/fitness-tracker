// The Push/Pull/Legs program. The list below is only *seed* data — once it has
// been seeded into storage, the stored copy is the source of truth and the
// user edits it in the Program screen.

export const DEFAULT_WORKOUT_START = '2025-10-27';

// Kilograms added when the progression rule says "go up". Overridable per
// exercise, because the real jumps differ by equipment: dumbbells go
// 7.5 -> 9 -> 10, while the lat pulldown moves in 2.5s.
export const DEFAULT_INCREMENT = 2.5;

// Rep range width scales with how big the smallest available load jump is as a
// percentage of the working load. A 5kg plate is a rounding error on a leg press
// and a doubling on a lateral raise, so the coarse lifts get wide ranges — you
// climb reps to buy runway before the jump becomes survivable.
//
//   under ~10% of load -> narrow (8-12)
//   10-25%             -> medium (10-15)
//   over 25%           -> wide   (12-20)
//
// Increments mirror what gyms actually stock: 5kg on machines and cable stacks,
// 2.5kg on dumbbells and barbells. A suggestion you cannot load is useless.
export const DEFAULT_PROGRAM = {
  Push: [
    { name: 'Pec Fly Machine', targetSets: 2, repRange: '10-15', increment: 5 },
    { name: 'Smith Machine Incline Press', targetSets: 3, repRange: '8-12', increment: 5 },
    { name: 'Horizontal Press (Machine/Plate)', targetSets: 3, repRange: '8-12', increment: 5 },
    { name: 'Tricep Extension (Rope)', targetSets: 2, repRange: '12-20', increment: 5 },
    { name: 'DB Front Raise', targetSets: 2, repRange: '12-20', increment: 2.5 },
    { name: 'Machine Shoulder Press', targetSets: 3, repRange: '8-12', increment: 5 },
  ],
  Pull: [
    { name: 'Lat Pullover (Rope)', targetSets: 2, repRange: '12-20', increment: 5 },
    { name: 'Lat Pulldown', targetSets: 3, repRange: '8-12', increment: 5 },
    { name: 'Seated Cable Row', targetSets: 3, repRange: '8-12', increment: 5 },
    { name: 'DB Preacher Curl', targetSets: 3, repRange: '10-15', increment: 2.5 },
    { name: 'Standing DB Lateral Raise', targetSets: 3, repRange: '12-20', increment: 2.5 },
  ],
  Legs: [
    { name: 'Standing Calf Raise', targetSets: 2, repRange: '12-20', increment: 5 },
    { name: 'Lying Leg Curl', targetSets: 2, repRange: '10-15', increment: 5 },
    { name: 'Leg Extension', targetSets: 3, repRange: '10-15', increment: 5 },
    { name: 'BB Hip Thrust', targetSets: 3, repRange: '8-12', increment: 2.5 },
    { name: 'Leg Press', targetSets: 3, repRange: '8-15', increment: 5 },
    { name: 'BB RDL', targetSets: 2, repRange: '8-12', increment: 2.5 },
  ],
};

// The day types a program is split into. Editable — a Push/Pull/Legs split and
// an Upper/Lower split are the same shape, just different day names, so the app
// should never dictate which one you run.
export const DEFAULT_DAY_TYPES = ['Push', 'Pull', 'Legs'];

// Kept as the seed default. Anything reading the *current* split must use
// store.loadDayTypes() instead — this is only the starting point.
export const DAY_TYPES = DEFAULT_DAY_TYPES;

// Stable per-exercise id. History is keyed on this, so renaming an exercise
// keeps its chart and its "last time" prefill.
export function newExerciseId() {
  return 'ex_' + Math.random().toString(36).slice(2, 10);
}

// "10-12" -> {low:10, high:12}. "10" -> {low:10, high:10}. Junk -> null.
export function parseRepRange(str) {
  const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(String(str ?? ''));
  if (!m) return null;
  const low = Number(m[1]);
  const high = m[2] === undefined ? low : Number(m[2]);
  return high < low ? { low: high, high: low } : { low, high };
}

// Fill in ids and increments. Used both to seed the defaults and to backfill
// programs saved before those fields existed.
export function seedProgram(source, days = DEFAULT_DAY_TYPES) {
  const out = {};
  for (const day of days) {
    out[day] = (source[day] || []).map(ex => ({
      id: ex.id || newExerciseId(),
      name: ex.name,
      targetSets: ex.targetSets,
      repRange: ex.repRange,
      increment: ex.increment ?? DEFAULT_INCREMENT,
    }));
  }
  return out;
}

// True when any exercise is missing a field seedProgram would add.
export function programNeedsSeeding(program) {
  return Object.keys(program || {}).some(day =>
    (program[day] || []).some(ex => !ex.id || ex.increment == null));
}

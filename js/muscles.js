// Which muscles an exercise trains, and how many hard sets each muscle got in a
// week. Pure logic — no DOM, no storage.
//
// The app has no exercise database, so muscles come from the exercise NAME,
// matched against the keyword rules below, first match wins. A set counts 1
// for the main muscle and 0.5 for muscles that help (an incline press is chest
// work that also trains front delts and triceps). That's the usual "effective
// sets" convention, and it's what keeps presses from looking like shoulder days.
//
// To teach it a new exercise, add one line to RULES.

import { weekStart } from './plan.js';
import { addDays } from './calculations.js';

export const MUSCLES = [
  'Chest', 'Back', 'Front delts', 'Side delts', 'Rear delts',
  'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves',
];

// Hard sets per muscle per week that research generally associates with growth.
export const TARGET = { low: 10, high: 20 };

// [pattern, { muscle: weight }] — order matters: specific before general.
const RULES = [
  [/calf/, { Calves: 1 }],
  [/leg curl|hamstring curl/, { Hamstrings: 1 }],
  [/leg ext/, { Quads: 1 }],
  [/leg press|squat|hack/, { Quads: 1, Glutes: 0.5 }],
  [/lunge|split squat|step.?up/, { Quads: 1, Glutes: 0.5 }],
  [/rdl|romanian|deadlift|good morning/, { Hamstrings: 1, Glutes: 0.5 }],
  [/hip thrust|glute bridge|kickback/, { Glutes: 1, Hamstrings: 0.5 }],
  [/abduct/, { Glutes: 1 }],
  [/lateral raise|side raise|upright row/, { 'Side delts': 1 }],
  [/face pull/, { 'Rear delts': 1, Back: 0.5 }],
  [/delt fly|rear delt|reverse fly|reverse pec/, { 'Rear delts': 1 }],
  [/front raise/, { 'Front delts': 1 }],
  [/shoulder press|overhead press|military|arnold|\bohp\b/, { 'Front delts': 1, 'Side delts': 0.5, Triceps: 0.5 }],
  [/pec fly|chest fly|cable fly|crossover|pec deck/, { Chest: 1 }],
  [/press|bench|push.?up|dip/, { Chest: 1, 'Front delts': 0.5, Triceps: 0.5 }],
  [/tricep|push.?down|press.?down|skull/, { Triceps: 1 }],
  [/pulldown|pull.?up|chin/, { Back: 1, Biceps: 0.5 }],
  [/pullover/, { Back: 1 }],
  [/row/, { Back: 1, Biceps: 0.5, 'Rear delts': 0.5 }],
  [/curl/, { Biceps: 1 }],
  [/shrug/, { Back: 1 }],
];

// { muscle: weight } for an exercise name, or { Other: 1 } when nothing matches.
export function musclesFor(name) {
  const n = String(name || '').toLowerCase();
  // Triceps before the generic "press" rule: "tricep press down" isn't chest work.
  if (/tricep|push.?down|press.?down|skull/.test(n)) return { Triceps: 1 };
  for (const [re, m] of RULES) if (re.test(n)) return m;
  return { Other: 1 };
}

const done = set => typeof set.reps === 'number' && set.reps > 0;

// Effective hard sets per muscle for the Mon-Sun week starting `start`.
// Returns [{ muscle, sets, from: [{ name, sets }] }] in MUSCLES order, with
// "Other" last and only when something unmapped was trained.
export function weeklyMuscleSets(sessions, start) {
  const end = addDays(start, 6);
  const tally = new Map();
  for (const s of sessions || []) {
    if (!s.date || s.date < start || s.date > end) continue;
    for (const ex of s.exercises || []) {
      const n = (ex.sets || []).filter(done).length;
      if (!n) continue;
      for (const [muscle, w] of Object.entries(musclesFor(ex.name))) {
        const row = tally.get(muscle) || { sets: 0, from: new Map() };
        row.sets += n * w;
        row.from.set(ex.name, (row.from.get(ex.name) || 0) + n * w);
        tally.set(muscle, row);
      }
    }
  }
  const order = [...MUSCLES, ...(tally.has('Other') ? ['Other'] : [])];
  return order.map(muscle => {
    const row = tally.get(muscle) || { sets: 0, from: new Map() };
    return {
      muscle,
      sets: Math.round(row.sets * 10) / 10,
      from: [...row.from.entries()].map(([name, sets]) => ({ name, sets: Math.round(sets * 10) / 10 })),
    };
  });
}

// Monday of the week `offset` weeks from the one containing `today`.
export const weekOf = (today, offset = 0) => addDays(weekStart(today), offset * 7);

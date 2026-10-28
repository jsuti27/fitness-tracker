// The weekly planner: commit to gym days ahead of time, then see how the week
// actually went. Pure logic — no DOM, no storage — so it runs in node as-is.
//
// The plan only records intent ({ day, reason, note } per date). Whether you
// went is never typed in: it is read off the sessions you log on the Train
// tab, so there is nothing to double-enter and nothing that can disagree.

import { addDays, daysBetween } from './calculations.js';

export const MISS_REASONS = ['Work', 'Tired', 'Sick', 'Social', 'Travel', 'Sore', 'Other'];
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Monday of the week containing dateStr.
export function weekStart(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon = 0
  return addDays(dateStr, -dow);
}

export function weekDates(start) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// date -> [day types logged that date]
export function sessionsByDate(sessions) {
  const map = new Map();
  for (const s of sessions || []) {
    if (!s.date) continue;
    if (!map.has(s.date)) map.set(s.date, []);
    map.get(s.date).push(s.day);
  }
  return map;
}

//   done    — planned and a session was logged that date (any day type counts:
//             swapping Pull for Push still means you turned up)
//   missed  — planned, in the past, nothing logged
//   today   — planned for today, not logged yet
//   planned — planned, still ahead
//   bonus   — not planned, but you trained anyway
//   rest    — neither
export function dayStatus(date, entry, loggedDays, today) {
  const planned = !!(entry && entry.day);
  const logged = (loggedDays || []).length > 0;
  if (planned && logged) return 'done';
  if (!planned) return logged ? 'bonus' : 'rest';
  if (date < today) return 'missed';
  if (date === today) return 'today';
  return 'planned';
}

export function weekSummary(start, plan, byDate, today) {
  const days = weekDates(start).map(date => {
    const entry = (plan || {})[date] || null;
    const logged = byDate.get(date) || [];
    return { date, entry, logged, status: dayStatus(date, entry, logged, today) };
  });
  const count = s => days.filter(d => d.status === s).length;
  const planned = days.filter(d => d.entry && d.entry.day).length;
  const done = count('done');
  return {
    start,
    days,
    planned,
    done,
    missed: count('missed'),
    bonus: count('bonus'),
    pct: planned ? Math.round((done / planned) * 100) : null,
    complete: addDays(start, 6) < today,
  };
}

// Consecutive finished weeks, newest first, where every planned day was hit.
// A week with nothing planned breaks the streak — no commitment, no credit.
// The current week adds to the streak only once every planned day is done,
// and doesn't break it while days are still ahead — so a Monday with nothing
// done yet doesn't read as a broken streak.
export function commitmentStreak(plan, byDate, today) {
  let streak = 0;
  const current = weekSummary(weekStart(today), plan, byDate, today);
  // A miss this week has already broken it, even before the week ends.
  if (current.missed) return 0;
  let start = addDays(weekStart(today), -7);
  for (;;) {
    const w = weekSummary(start, plan, byDate, today);
    if (!w.planned || w.done < w.planned) break;
    streak++;
    start = addDays(start, -7);
    if (streak > 520) break;
  }
  if (current.planned && current.done === current.planned) streak++;
  return streak;
}

// The last n weeks (oldest first, ending with the current one).
export function recentWeeks(plan, byDate, today, n = 8) {
  const cur = weekStart(today);
  return Array.from({ length: n }, (_, i) =>
    weekSummary(addDays(cur, -7 * (n - 1 - i)), plan, byDate, today));
}

// Why planned days were missed, most common first. Missed days with no reason
// picked yet show as "No reason" so they nag rather than vanish.
export function reasonTally(plan, byDate, today, sinceDate = null) {
  const counts = new Map();
  for (const [date, entry] of Object.entries(plan || {})) {
    if (sinceDate && date < sinceDate) continue;
    if (dayStatus(date, entry, byDate.get(date), today) !== 'missed') continue;
    const r = entry.reason || 'No reason';
    counts.set(r, (counts.get(r) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, n]) => ({ reason, n }))
    .sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason));
}

// Which workout comes next in the split for a given date: the one after the
// most recent workout before it, planned or logged. Planned counts so that
// filling a week Mon -> Fri walks Upper, Lower, Push... rather than offering
// Upper five times.
export function suggestDay(date, plan, sessions, dayTypes) {
  if (!dayTypes || !dayTypes.length) return null;
  let last = null;
  const consider = (d, day) => {
    if (d >= date || !dayTypes.includes(day)) return;
    if (!last || d > last.date) last = { date: d, day };
  };
  for (const s of sessions || []) consider(s.date, s.day);
  for (const [d, e] of Object.entries(plan || {})) if (e && e.day) consider(d, e.day);
  if (!last) return dayTypes[0];
  return dayTypes[(dayTypes.indexOf(last.day) + 1) % dayTypes.length];
}

// Flatten for the Google Sheet "Plan" tab — one row per planned or trained day.
export function planRows(plan, sessions, today) {
  const byDate = sessionsByDate(sessions);
  const dates = new Set(Object.keys(plan || {}).filter(d => plan[d] && plan[d].day));
  // Bonus days only from weeks you planned in, so the tab isn't a second copy
  // of your whole training history.
  const plannedWeeks = new Set([...dates].map(weekStart));
  for (const d of byDate.keys()) if (plannedWeeks.has(weekStart(d))) dates.add(d);

  return [...dates].sort().map(date => {
    const entry = (plan || {})[date] || null;
    const logged = byDate.get(date) || [];
    const status = dayStatus(date, entry, logged, today);
    return {
      weekOf: weekStart(date),
      date,
      weekday: WEEKDAYS[daysBetween(weekStart(date), date)],
      planned: entry && entry.day ? entry.day : '',
      logged: logged.join(', '),
      status,
      reason: status === 'missed' ? (entry.reason || '') : '',
      note: entry && entry.note ? entry.note : '',
    };
  });
}

// --- Heatmap -------------------------------------------------------------

// The last `weeks` weeks as columns (oldest first), each 7 days Mon -> Sun.
// A day carries what was logged and whether it was a planned day you missed.
// Days after today are kept (so the grid stays rectangular) but flagged future.
export function heatmapWeeks(sessions, plan, today, weeks = 26) {
  const byDate = sessionsByDate(sessions);
  const sets = new Map();
  for (const s of sessions || []) {
    const n = (s.exercises || []).reduce((sum, e) =>
      sum + (e.sets || []).filter(x => x.weight != null || x.reps != null).length, 0);
    sets.set(s.date, (sets.get(s.date) || 0) + n);
  }
  const last = weekStart(today);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(last, -7 * (weeks - 1 - i));
    return weekDates(start).map(date => {
      const logged = byDate.get(date) || [];
      const entry = (plan || {})[date] || null;
      return {
        date,
        logged,
        sets: sets.get(date) || 0,
        missed: dayStatus(date, entry, logged, today) === 'missed',
        future: date > today,
        today: date === today,
      };
    });
  });
}

// Headline numbers for the heatmap, counted from the first logged session (so
// weeks before you started don't drag the average down).
export function attendanceStats(sessions, today) {
  const dates = [...new Set((sessions || []).map(s => s.date).filter(d => d && d <= today))].sort();
  if (!dates.length) return null;

  const perDay = {};
  for (const s of sessions) if (s.date <= today) perDay[s.day] = (perDay[s.day] || 0) + 1;

  let gap = { days: 0, from: null, to: null };
  for (let i = 1; i < dates.length; i++) {
    const days = daysBetween(dates[i - 1], dates[i]) - 1;
    if (days > gap.days) gap = { days, from: addDays(dates[i - 1], 1), to: addDays(dates[i], -1) };
  }
  // The stretch since your last session counts too — it's the one that matters.
  const sinceLast = daysBetween(dates[dates.length - 1], today);
  if (sinceLast > gap.days) gap = { days: sinceLast, from: addDays(dates[dates.length - 1], 1), to: today, ongoing: true };

  const weeks = Math.max(1, Math.ceil((daysBetween(weekStart(dates[0]), today) + 1) / 7));
  return {
    days: dates.length,
    sessions: (sessions || []).filter(s => s.date <= today).length,
    weeks,
    perWeek: Math.round((dates.length / weeks) * 10) / 10,
    gap,
    perDay,
  };
}

// The four headline numbers at the top of the Plan tab.
//   last4     gym days per week over the last 28 days — the "am I slacking?" number
//   thisMonth gym days so far this calendar month
//   days      gym days since the first logged session
//   lifted    kg moved: every logged set's weight x reps
export function tileStats(sessions, today) {
  const past = (sessions || []).filter(s => s.date && s.date <= today);
  const days = new Set(past.map(s => s.date));
  const from = addDays(today, -27);
  const last4 = [...days].filter(d => d >= from).length;
  let lifted = 0;
  for (const s of past) for (const e of s.exercises || []) for (const set of e.sets || []) {
    if (typeof set.weight === 'number' && typeof set.reps === 'number') lifted += set.weight * set.reps;
  }
  return {
    last4: Math.round((last4 / 4) * 10) / 10,
    thisMonth: [...days].filter(d => d.slice(0, 7) === today.slice(0, 7)).length,
    days: days.size,
    lifted: Math.round(lifted),
  };
}

// Rest between sets. Pure logic plus a thin controller — no DOM, no storage,
// both injected, so the whole thing is unit-testable including the case that
// actually breaks rest timers: the phone going into a pocket.
//
// THE DESIGN POINT. The countdown is never decremented. It stores the moment it
// should finish and recomputes what's left from the clock on every tick. Phones
// throttle (or entirely stop) timers in a backgrounded tab, which is exactly
// when a rest timer is running — so a naive `seconds--` loses time whenever the
// screen locks. Recomputing means a late tick, a skipped tick or a thousand
// skipped ticks all produce the same correct answer.

import { parseRepRange } from './program.js';

// Rest scales with how heavy the work is. Low rep ranges mean loads near your
// limit, which need longer to recover from; high-rep isolation work doesn't.
// These are starting points — every exercise can override them.
export const REST_HEAVY = 180;
export const REST_MEDIUM = 120;
export const REST_LIGHT = 90;

export function defaultRestFor(repRange) {
  const range = parseRepRange(repRange);
  if (!range) return REST_MEDIUM;
  if (range.high <= 10) return REST_HEAVY;
  if (range.high <= 15) return REST_MEDIUM;
  return REST_LIGHT;
}

// An exercise's own rest, falling back to what its rep range implies.
export function restFor(exercise) {
  if (!exercise) return REST_MEDIUM;
  const own = Number(exercise.restSeconds);
  return Number.isFinite(own) && own > 0 ? own : defaultRestFor(exercise.repRange);
}

// Whole seconds left, never negative. Rounds up so a timer started at 180 reads
// "3:00" immediately rather than flicking to 2:59 on the first frame.
export function remainingSeconds(endsAt, now) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

// 150 -> "2:30". Seconds stay two-digit so the width doesn't jitter as it counts.
export function formatRest(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// onTick fires every second with the seconds remaining; onDone fires once when
// it reaches zero. `load`/`save` persist the end time so backgrounding the app
// — or closing it entirely — resumes the same countdown rather than losing it.
export function createRestTimer({
  now = () => Date.now(),
  setInterval: setIntervalFn = setInterval,
  clearInterval: clearIntervalFn = clearInterval,
  onTick = () => {},
  onDone = () => {},
  load = () => null,
  save = () => {},
} = {}) {
  let endsAt = null;
  let handle = null;
  let label = '';

  function stopTicking() {
    if (handle != null) { clearIntervalFn(handle); handle = null; }
  }

  function finish() {
    stopTicking();
    endsAt = null;
    label = '';
    save(null);
    onDone();
  }

  function tick() {
    const left = remainingSeconds(endsAt, now());
    if (left <= 0) { finish(); return; }
    onTick(left, label);
  }

  return {
    start(seconds, forLabel = '') {
      stopTicking();
      endsAt = now() + seconds * 1000;
      label = forLabel;
      save({ endsAt, label });
      onTick(remainingSeconds(endsAt, now()), label);
      handle = setIntervalFn(tick, 250);   // 4x a second so the display never
      return endsAt;                       // sits a whole second behind
    },

    // Called on app start. A stored end time that has already passed is dropped
    // rather than fired — you don't want a beep for a rest that finished while
    // the app was closed.
    resume() {
      const stored = load();
      if (!stored || !stored.endsAt) return 0;
      const left = remainingSeconds(stored.endsAt, now());
      if (left <= 0) { save(null); return 0; }
      endsAt = stored.endsAt;
      label = stored.label || '';
      onTick(left, label);
      handle = setIntervalFn(tick, 250);
      return left;
    },

    cancel() {
      stopTicking();
      endsAt = null;
      label = '';
      save(null);
    },

    remaining() { return remainingSeconds(endsAt, now()); },
    isRunning() { return endsAt != null && remainingSeconds(endsAt, now()) > 0; },
    label() { return label; },
  };
}

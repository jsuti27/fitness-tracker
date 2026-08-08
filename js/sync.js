// Pushes logged sessions to a Google Sheet, one row per set, via an Apps
// Script web app the user deploys themselves.
//
// Offline-first: saving always writes locally and queues a session key. The
// queue holds keys rather than payloads, so a session edited after being
// queued syncs its latest state. Sends are idempotent on the sheet side
// (keyed on Date|Day|Exercise|Set), so a retry corrects rather than duplicates.

import { sessionKey } from './storage.js';
import { setsAllInRange } from './progression.js';

// Flatten the program into sheet rows. Carries the exercise id, which is what
// makes an export/edit/import round-trip safe — reimporting with ids intact
// keeps every logged session attached to its exercise.
export function programRows(program, dayTypes) {
  const rows = [];
  for (const day of dayTypes || []) {
    const exercises = (program || {})[day];
    if (!Array.isArray(exercises)) continue;
    exercises.forEach((ex, i) => {
      rows.push({
        day,
        order: i + 1,
        exercise: ex.name,
        targetSets: ex.targetSets,
        repRange: ex.repRange,
        increment: ex.increment == null ? 2.5 : ex.increment,
        exerciseId: ex.id,
      });
    });
  }
  return rows;
}

// Flatten a session into sheet rows. The note rides on the exercise's first
// row only, so it reads once rather than repeating down the set rows.
export function sessionRows(session, program) {
  const byId = new Map();
  const byName = new Map();
  // Walk the program's own day keys rather than the seed default, so exercises
  // on a day type the user added are still found.
  for (const exercises of Object.values(program || {})) {
    if (!Array.isArray(exercises)) continue;
    for (const ex of exercises) {
      byId.set(ex.id, ex);
      if (!byName.has(ex.name)) byName.set(ex.name, ex);
    }
  }

  const rows = [];
  for (const ex of session.exercises || []) {
    const template = byId.get(ex.exerciseId) || byName.get(ex.name) || null;
    const logged = (ex.sets || []).filter(s => s.weight != null || s.reps != null);

    logged.forEach((set, i) => {
      // "Did this set land in the range?" — computed here so the sheet can be
      // filtered on it without re-deriving the rule in a formula.
      let inRange = '';
      if (template) {
        inRange = setsAllInRange([set], template.repRange, 1) ? 'Y' : 'N';
      }
      rows.push({
        date: session.date,
        week: session.week ?? '',
        day: session.day,
        exercise: ex.name,
        set: i + 1,
        kg: set.weight ?? '',
        reps: set.reps ?? '',
        inRange,
        note: i === 0 ? (ex.note || '') : '',
      });
    });
  }
  return rows;
}

export function createSync({ store, fetchImpl, pauseImpl }) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  // Injectable so tests don't actually wait.
  const pause = pauseImpl || (ms => new Promise(r => setTimeout(r, ms)));

  async function sendSession(key, settings, program) {
    const [date, day] = key.split('|');
    const session = store.getSession(date, day);

    // The session was deleted after being queued. Tell the sheet to clear its
    // rows rather than silently leaving them there — otherwise the sheet drifts
    // away from the app and you can never trust it.
    const rows = session ? sessionRows(session, program) : [];
    const deleted = !session;
    const res = await doFetch(settings.url, {
      method: 'POST',
      // text/plain keeps this a "simple" request. Apps Script web apps do not
      // answer CORS preflights, so an application/json body would be blocked.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: settings.secret, key, rows, deleted, date, day }),
    });

    if (!res) throw new Error('No response from the sheet');
    if (res.ok === false) throw new Error(`Sheet returned HTTP ${res.status ?? '?'}`);

    // The script answers with {ok:false, error:"bad secret"} on a 200, so a
    // 200 alone doesn't mean the rows landed. Read the body when we can.
    if (typeof res.text === 'function') {
      const body = (await res.text()).trim();
      try {
        const parsed = JSON.parse(body);
        if (parsed && parsed.ok === false) {
          throw new Error(`Script said: ${parsed.error || 'rejected'}`);
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          // HTML back instead of JSON means we hit a Google sign-in or error
          // page, not the script — almost always a deployment access setting.
          throw new Error(
            body.slice(0, 40).toLowerCase().includes('<!doctype') || body.startsWith('<')
              ? 'Got a Google web page instead of the script — deployment is probably not set to "Anyone"'
              : `Unexpected reply: ${body.slice(0, 60)}`
          );
        }
        throw err;
      }
    }
    return true;
  }

  // The program goes as a whole tab rather than a keyed upsert: it is ~20 rows,
  // has one writer, and deletions have to propagate. Diffing would be more code
  // for no benefit.
  async function sendProgram(settings) {
    const rows = programRows(store.loadProgram(), store.loadDayTypes());
    const res = await doFetch(settings.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: settings.secret, kind: 'program', rows }),
    });
    if (!res) throw new Error('No response from the sheet');
    if (res.ok === false) throw new Error(`Sheet returned HTTP ${res.status ?? '?'}`);
    return true;
  }

  return {
    enqueue(date, day) {
      store.enqueueSync(sessionKey(date, day));
    },

    async flush() {
      const settings = store.loadSyncSettings();
      const queue = store.loadSyncQueue();
      const programDirty = store.loadProgramDirty();
      if (!settings.url || !doFetch || (queue.length === 0 && !programDirty)) {
        return { sent: 0, failed: 0 };
      }

      const program = store.loadProgram();
      let sent = 0;
      let failed = 0;
      let lastError = '';
      let first = true;

      // Program first — the Program tab is what makes the Sets tab readable.
      // A failure here must not stop sessions going.
      if (programDirty) {
        try {
          await sendProgram(settings);
          store.clearProgramDirty();
          sent += 1;
          first = false;
        } catch (err) {
          failed += 1;
          lastError = err && err.message ? err.message : String(err);
        }
      }

      for (const key of queue) {
        try {
          // Apps Script throttles rapid successive writes to the same sheet,
          // which showed up as some sessions failing on a multi-session sync.
          // A short gap between sends avoids it.
          if (!first) await pause(600);
          first = false;
          await sendSession(key, settings, program);
          store.dequeueSync(key);
          sent += 1;
        } catch (err) {
          // Leave it queued. It goes again on next save, app open, or reconnect.
          // Keep the message — without it a failure is undiagnosable on a phone,
          // where there is no console to read.
          failed += 1;
          lastError = err && err.message ? err.message : String(err);
        }
      }
      if (sent > 0) store.saveSyncedAt(new Date().toISOString());
      store.saveSyncError(failed ? lastError : '');
      return { sent, failed, error: lastError };
    },
  };
}

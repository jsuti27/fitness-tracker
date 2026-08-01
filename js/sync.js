// Pushes logged sessions to a Google Sheet, one row per set, via an Apps
// Script web app the user deploys themselves.
//
// Offline-first: saving always writes locally and queues a session key. The
// queue holds keys rather than payloads, so a session edited after being
// queued syncs its latest state. Sends are idempotent on the sheet side
// (keyed on Date|Day|Exercise|Set), so a retry corrects rather than duplicates.

import { sessionKey } from './storage.js';
import { setsAllInRange } from './progression.js';
import { DAY_TYPES } from './program.js';

// Flatten a session into sheet rows. The note rides on the exercise's first
// row only, so it reads once rather than repeating down the set rows.
export function sessionRows(session, program) {
  const byId = new Map();
  const byName = new Map();
  for (const day of DAY_TYPES) {
    for (const ex of (program && program[day]) || []) {
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

export function createSync({ store, fetchImpl }) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);

  async function sendSession(key, settings, program) {
    const [date, day] = key.split('|');
    const session = store.getSession(date, day);

    // The session was deleted after being queued — nothing to send.
    if (!session) return true;

    const rows = sessionRows(session, program);
    const res = await doFetch(settings.url, {
      method: 'POST',
      // text/plain keeps this a "simple" request. Apps Script web apps do not
      // answer CORS preflights, so an application/json body would be blocked.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: settings.secret, key, rows }),
    });
    if (!res || res.ok === false) throw new Error('Sync rejected by the sheet');
    return true;
  }

  return {
    enqueue(date, day) {
      store.enqueueSync(sessionKey(date, day));
    },

    async flush() {
      const settings = store.loadSyncSettings();
      const queue = store.loadSyncQueue();
      if (!settings.url || queue.length === 0 || !doFetch) {
        return { sent: 0, failed: 0 };
      }

      const program = store.loadProgram();
      let sent = 0;
      let failed = 0;

      for (const key of queue) {
        try {
          await sendSession(key, settings, program);
          store.dequeueSync(key);
          sent += 1;
        } catch {
          // Leave it queued. It goes again on next save, app open, or reconnect.
          failed += 1;
        }
      }
      if (sent > 0) store.saveSyncedAt(new Date().toISOString());
      return { sent, failed };
    },
  };
}

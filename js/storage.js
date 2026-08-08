// Persistence layer. The backing store (localStorage in the browser, a fake in
// tests) is injected, so this whole module is unit-testable.

import {
  DEFAULT_PROGRAM, DEFAULT_WORKOUT_START, DEFAULT_INCREMENT,
  newExerciseId, seedProgram, programNeedsSeeding, DEFAULT_DAY_TYPES,
} from './program.js';

const KEYS = {
  program: 'ht.program',
  sessions: 'ht.sessions',
  workoutStart: 'ht.workoutStart',
  syncSettings: 'ht.syncSettings',
  syncQueue: 'ht.syncQueue',
  syncedAt: 'ht.syncedAt',
  syncError: 'ht.syncError',
  dayTypes: 'ht.dayTypes',
  programDirty: 'ht.programDirty',
};

// A session is identified by the day it was done and which day type it was.
export const sessionKey = (date, day) => `${date}|${day}`;

export function createStorage(backend) {
  return {
    // --- Workout program (templates) ---
    // Seeds from the defaults on first use and writes the result back, so the
    // generated exercise ids are stable from then on. Also backfills programs
    // saved before ids and increments existed.
    loadProgram() {
      const raw = backend.getItem(KEYS.program);
      if (!raw) {
        const seeded = seedProgram(DEFAULT_PROGRAM);
        this.saveProgram(seeded);
        return seeded;
      }
      const stored = JSON.parse(raw);
      if (programNeedsSeeding(stored)) {
        const seeded = seedProgram(stored);
        this.saveProgram(seeded);
        return seeded;
      }
      return stored;
    },
    // Flagging here rather than at each mutation's call site means a CRUD
    // method added later cannot forget to mark the program as needing a sync —
    // every one of them funnels through saveProgram.
    saveProgram(program) {
      backend.setItem(KEYS.program, JSON.stringify(program));
      this.markProgramDirty();
    },
    addExercise(day, { name, targetSets, repRange, increment }) {
      const program = this.loadProgram();
      const exercise = {
        id: newExerciseId(),
        name,
        targetSets: Number(targetSets) || 1,
        repRange: String(repRange),
        increment: increment == null ? DEFAULT_INCREMENT : Number(increment),
      };
      program[day] = [...(program[day] || []), exercise];
      this.saveProgram(program);
      return exercise;
    },
    updateExercise(day, id, patch) {
      const program = this.loadProgram();
      program[day] = (program[day] || []).map(ex =>
        ex.id === id ? { ...ex, ...patch } : ex);
      this.saveProgram(program);
      return program;
    },
    deleteExercise(day, id) {
      const program = this.loadProgram();
      program[day] = (program[day] || []).filter(ex => ex.id !== id);
      this.saveProgram(program);
      return program;
    },
    // delta -1 moves up, +1 moves down. Clamps at the ends.
    moveExercise(day, id, delta) {
      const program = this.loadProgram();
      const list = program[day] || [];
      const i = list.findIndex(ex => ex.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return program;
      [list[i], list[j]] = [list[j], list[i]];
      this.saveProgram(program);
      return program;
    },
    // --- Day types (the split itself) ---
    // Push/Pull/Legs and Upper/Lower are the same shape with different day
    // names, so the split is data, not something the app hard-codes.
    loadDayTypes() {
      const raw = backend.getItem(KEYS.dayTypes);
      if (raw) {
        const days = JSON.parse(raw);
        if (Array.isArray(days) && days.length) return days;
      }
      // Older installs have no day list — derive it from the program they have.
      const stored = backend.getItem(KEYS.program);
      if (stored) {
        const keys = Object.keys(JSON.parse(stored));
        if (keys.length) return keys;
      }
      return [...DEFAULT_DAY_TYPES];
    },
    // Day order drives the Program tab's row order, so reordering days is a
    // program change even when no exercise moved.
    saveDayTypes(days) {
      backend.setItem(KEYS.dayTypes, JSON.stringify(days));
      this.markProgramDirty();
    },
    addDayType(name) {
      const days = this.loadDayTypes();
      if (days.includes(name)) return days;
      days.push(name);
      this.saveDayTypes(days);
      const program = this.loadProgram();
      program[name] = program[name] || [];
      this.saveProgram(program);
      return days;
    },
    // Renaming carries the exercises AND the logged sessions across, so a day
    // you rename keeps its history rather than silently orphaning it.
    renameDayType(oldName, newName) {
      if (oldName === newName) return this.loadDayTypes();
      const days = this.loadDayTypes();
      const i = days.indexOf(oldName);
      if (i < 0 || days.includes(newName)) return days;
      days[i] = newName;
      this.saveDayTypes(days);

      const program = this.loadProgram();
      program[newName] = program[oldName] || [];
      delete program[oldName];
      this.saveProgram(program);

      this.saveSessions(this.loadSessions().map(s =>
        s.day === oldName ? { ...s, day: newName } : s));
      return days;
    },
    // Deleting drops the day and its exercise template, but keeps every logged
    // session — the history stays readable in charts and the sheet.
    deleteDayType(name) {
      const days = this.loadDayTypes().filter(d => d !== name);
      this.saveDayTypes(days);
      const program = this.loadProgram();
      delete program[name];
      this.saveProgram(program);
      return days;
    },
    moveDayType(name, delta) {
      const days = this.loadDayTypes();
      const i = days.indexOf(name);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= days.length) return days;
      [days[i], days[j]] = [days[j], days[i]];
      this.saveDayTypes(days);
      return days;
    },

    loadWorkoutStart() {
      return backend.getItem(KEYS.workoutStart) || DEFAULT_WORKOUT_START;
    },
    saveWorkoutStart(dateStr) {
      backend.setItem(KEYS.workoutStart, dateStr);
    },

    // --- Workout sessions (logged training) ---
    loadSessions() {
      const raw = backend.getItem(KEYS.sessions);
      const sessions = raw ? JSON.parse(raw) : [];
      return sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    },
    saveSessions(sessions) {
      backend.setItem(KEYS.sessions, JSON.stringify(sessions));
    },
    addSession(session) {
      const sessions = this.loadSessions();
      sessions.push(session);
      this.saveSessions(sessions);
      return this.loadSessions();
    },
    deleteSession(index) {
      const sessions = this.loadSessions();
      sessions.splice(index, 1);
      this.saveSessions(sessions);
      return this.loadSessions();
    },
    getSession(date, day) {
      return this.loadSessions().find(s => s.date === date && s.day === day);
    },
    // One session per date + day. Re-opening a day you already logged edits it
    // rather than starting a second one. Clearing every set deletes it.
    upsertSession(session) {
      const sessions = this.loadSessions();
      const i = sessions.findIndex(s => s.date === session.date && s.day === session.day);
      const empty = !session.exercises || session.exercises.length === 0;
      if (empty) {
        if (i >= 0) sessions.splice(i, 1);
      } else if (i >= 0) {
        sessions[i] = session;
      } else {
        sessions.push(session);
      }
      this.saveSessions(sessions);
      return this.loadSessions();
    },

    // --- Google Sheet sync ---
    loadSyncSettings() {
      const raw = backend.getItem(KEYS.syncSettings);
      return { url: '', secret: '', ...(raw ? JSON.parse(raw) : {}) };
    },
    saveSyncSettings(settings) {
      backend.setItem(KEYS.syncSettings, JSON.stringify({
        url: String(settings.url || '').trim(),
        secret: String(settings.secret || '').trim(),
      }));
    },
    // The queue holds session *keys*, not payloads — so a session edited after
    // being queued syncs its latest state, not a stale snapshot.
    loadSyncQueue() {
      const raw = backend.getItem(KEYS.syncQueue);
      return raw ? JSON.parse(raw) : [];
    },
    saveSyncQueue(queue) {
      backend.setItem(KEYS.syncQueue, JSON.stringify(queue));
    },
    enqueueSync(key) {
      const queue = this.loadSyncQueue();
      if (!queue.includes(key)) {
        queue.push(key);
        this.saveSyncQueue(queue);
      }
      return queue;
    },
    dequeueSync(key) {
      const queue = this.loadSyncQueue().filter(k => k !== key);
      this.saveSyncQueue(queue);
      return queue;
    },
    // The program is small and has exactly one writer, so it syncs as a whole
    // tab rather than a keyed upsert. A boolean is enough to know it's stale — a
    // sentinel in the session queue would have to be special-cased where
    // sendSession splits keys on "|".
    markProgramDirty() {
      backend.setItem(KEYS.programDirty, '1');
    },
    loadProgramDirty() {
      return backend.getItem(KEYS.programDirty) === '1';
    },
    clearProgramDirty() {
      backend.setItem(KEYS.programDirty, '');
    },
    loadSyncedAt() {
      return backend.getItem(KEYS.syncedAt) || null;
    },
    saveSyncedAt(iso) {
      backend.setItem(KEYS.syncedAt, iso);
    },
    // The last sync failure, kept so it can be shown in Settings. There is no
    // console to read on a phone, so a swallowed error is an undiagnosable one.
    loadSyncError() {
      return backend.getItem(KEYS.syncError) || '';
    },
    saveSyncError(msg) {
      backend.setItem(KEYS.syncError, msg || '');
    },

    // Load a whole split + exercise list in one go. Deliberately narrower than
    // importJSON: it touches ONLY the program and the day list, never your
    // logged sessions, macros or targets. Handing someone a program should
    // never be able to wipe their history.
    importProgram(str) {
      let data;
      try {
        data = JSON.parse(str);
      } catch {
        return { ok: false, error: 'That is not valid program text — copy the whole thing, including the { and }.' };
      }
      if (!data || typeof data !== 'object' || !data.program || typeof data.program !== 'object') {
        return { ok: false, error: 'That text has no program in it — wrong thing pasted?' };
      }

      const days = Array.isArray(data.dayTypes) && data.dayTypes.length
        ? data.dayTypes
        : Object.keys(data.program);
      if (!days.length) return { ok: false, error: 'That program has no training days in it.' };

      // seedProgram fills in the stable ids and default increments.
      this.saveProgram(seedProgram(data.program, days));
      this.saveDayTypes(days);
      return { ok: true, days: days.length };
    },

    // --- Backup ---
    exportJSON() {
      return JSON.stringify(
        {
          version: 3,
          exportedAt: new Date().toISOString(),
          program: this.loadProgram(),
          workoutStart: this.loadWorkoutStart(),
          dayTypes: this.loadDayTypes(),
          sessions: this.loadSessions(),
          syncSettings: this.loadSyncSettings(),
        },
        null,
        2
      );
    },
    importJSON(str) {
      let data;
      try {
        data = JSON.parse(str);
      } catch {
        return { ok: false, error: 'That file is not valid JSON.' };
      }
      if (!data || typeof data !== 'object' || !data.program || typeof data.program !== 'object') {
        return { ok: false, error: 'That file has no training program in it — wrong file?' };
      }
      // Older backups also carry `targets` and `days` from when the app tracked
      // macros. Those are ignored rather than rejected, so an old file still
      // restores everything the app still uses.
      this.saveProgram(data.program);
      if (Array.isArray(data.sessions)) this.saveSessions(data.sessions);
      if (Array.isArray(data.dayTypes) && data.dayTypes.length) this.saveDayTypes(data.dayTypes);
      if (typeof data.workoutStart === 'string') this.saveWorkoutStart(data.workoutStart);
      if (data.syncSettings && typeof data.syncSettings === 'object') {
        this.saveSyncSettings(data.syncSettings);
      }
      return { ok: true };
    },
  };
}

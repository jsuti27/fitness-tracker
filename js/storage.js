// Persistence layer. The backing store (localStorage in the browser, a fake in
// tests) is injected, so this whole module is unit-testable.

import {
  DEFAULT_PROGRAM, DEFAULT_WORKOUT_START, DEFAULT_INCREMENT,
  newExerciseId, seedProgram, programNeedsSeeding,
} from './program.js';

export const DEFAULT_TARGETS = {
  steps: 12000,
  startWeight: 78,
  goalWeight: 70,
  calories: 1800,
  protein: 180,
  carbs: 95,
  fat: 80,
  fibre: 25,
};

const KEYS = {
  targets: 'ht.targets',
  days: 'ht.days',
  program: 'ht.program',
  sessions: 'ht.sessions',
  workoutStart: 'ht.workoutStart',
  syncSettings: 'ht.syncSettings',
  syncQueue: 'ht.syncQueue',
  syncedAt: 'ht.syncedAt',
};

// A session is identified by the day it was done and which day type it was.
export const sessionKey = (date, day) => `${date}|${day}`;

export function createStorage(backend) {
  return {
    // --- Targets ---
    loadTargets() {
      const raw = backend.getItem(KEYS.targets);
      return raw ? { ...DEFAULT_TARGETS, ...JSON.parse(raw) } : { ...DEFAULT_TARGETS };
    },
    saveTargets(t) {
      backend.setItem(KEYS.targets, JSON.stringify(t));
    },

    // --- Daily log ---
    loadDays() {
      const raw = backend.getItem(KEYS.days);
      const days = raw ? JSON.parse(raw) : [];
      return days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    },
    saveDays(days) {
      backend.setItem(KEYS.days, JSON.stringify(days));
    },
    upsertDay(record) {
      const days = this.loadDays();
      const i = days.findIndex(d => d.date === record.date);
      if (i >= 0) days[i] = { ...days[i], ...record };
      else days.push(record);
      this.saveDays(days);
      return this.loadDays();
    },
    getDay(date) {
      return this.loadDays().find(d => d.date === date);
    },

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
    saveProgram(program) {
      backend.setItem(KEYS.program, JSON.stringify(program));
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
    loadSyncedAt() {
      return backend.getItem(KEYS.syncedAt) || null;
    },
    saveSyncedAt(iso) {
      backend.setItem(KEYS.syncedAt, iso);
    },

    // --- Backup ---
    exportJSON() {
      return JSON.stringify(
        {
          version: 2,
          exportedAt: new Date().toISOString(),
          targets: this.loadTargets(),
          days: this.loadDays(),
          program: this.loadProgram(),
          workoutStart: this.loadWorkoutStart(),
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
      if (!data || typeof data !== 'object' || !Array.isArray(data.days) || typeof data.targets !== 'object') {
        return { ok: false, error: 'That file is missing targets or days — wrong file?' };
      }
      this.saveTargets({ ...DEFAULT_TARGETS, ...data.targets });
      this.saveDays(data.days);
      // Workout data is optional (older v1 backups won't have it).
      if (data.program && typeof data.program === 'object') this.saveProgram(data.program);
      if (Array.isArray(data.sessions)) this.saveSessions(data.sessions);
      if (typeof data.workoutStart === 'string') this.saveWorkoutStart(data.workoutStart);
      if (data.syncSettings && typeof data.syncSettings === 'object') {
        this.saveSyncSettings(data.syncSettings);
      }
      return { ok: true };
    },
  };
}

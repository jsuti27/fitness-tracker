import { createStorage } from './storage.js';
import { DAY_TYPES } from './program.js';
import { lastEntryFor, suggestion } from './progression.js';
import { createSync } from './sync.js';
import { createProgramScreen } from './program-screen.js';
import {
  caloriesFromMacros, pct, todayISO, formatDate,
  programWeek, sessionVolume, exerciseProgression, bestSet, weeklyVolume,
} from './calculations.js';
import { lineChartSVG, groupedBarChartSVG } from './charts.js';
import { $, setText, flash, chartColors, escapeHtml, escapeAttr, cssEscape } from './dom.js';

const store = createStorage(localStorage);
const sync = createSync({ store });
const todayStr = todayISO();

const num = el => (el.value === '' ? null : Number(el.value));

let selectedDay = 'Push';

// The Program screen owns its own day selection; it tells us when the template
// changed so the Train screen can re-render against it.
const programScreen = createProgramScreen({
  store,
  onProgramChange: () => { if ($('train').classList.contains('active')) renderTrain(); },
});

// ============================================================ TODAY (macros)
function renderToday() {
  const t = store.loadTargets();
  const day = store.getDay(todayStr) || {};

  setText('today-date', formatDate(todayStr));
  setText('cals-target', t.calories);
  setText('protein-target', t.protein);
  setText('carbs-target', t.carbs);
  setText('fat-target', t.fat);
  setText('fibre-target', t.fibre);

  const cals = day.calories || 0;
  setText('cals-now', Math.round(cals).toLocaleString());
  $('cals-bar').style.width = Math.min(pct(cals, t.calories), 100) + '%';
  const remaining = Math.round(t.calories - cals);
  const leftEl = $('cals-left');
  if (remaining >= 0) {
    leftEl.textContent = `${remaining.toLocaleString()} kcal left`;
    leftEl.classList.remove('over');
  } else {
    leftEl.textContent = `${Math.abs(remaining).toLocaleString()} kcal over`;
    leftEl.classList.add('over');
  }

  setText('protein-now', Math.round(day.protein || 0));
  setText('carbs-now', Math.round(day.carbs || 0));
  setText('fats-now', Math.round(day.fats || 0));
  setText('fibre-now', Math.round(day.fibre || 0));

  // Prefill the form with anything already logged today.
  $('in-protein').value = day.protein ?? '';
  $('in-carbs').value = day.carbs ?? '';
  $('in-fats').value = day.fats ?? '';
  $('in-fibre').value = day.fibre ?? '';
  $('in-calories').value = day.calories ?? '';

  renderMacroCharts();
}

function renderMacroCharts() {
  const t = store.loadTargets();
  const last14 = store.loadDays().slice(-14);
  const C = chartColors();
  $('chart-protein').innerHTML = lineChartSVG(
    last14.map((d, i) => ({ x: i, y: d.protein || 0 })),
    { color: C.nutrition, goal: t.protein, goalColor: C.goal, textColor: C.text });
  $('chart-cals').innerHTML = lineChartSVG(
    last14.map((d, i) => ({ x: i, y: d.calories || 0 })),
    { color: C.nutrition, goal: t.calories, goalColor: C.goal, textColor: C.text });
}

function wireToday() {
  $('calc-cals').addEventListener('click', () => {
    $('in-calories').value = caloriesFromMacros({
      protein: num($('in-protein')) || 0,
      carbs: num($('in-carbs')) || 0,
      fats: num($('in-fats')) || 0,
    });
  });

  $('log-form').addEventListener('submit', e => {
    e.preventDefault();
    store.upsertDay({
      date: todayStr,
      protein: num($('in-protein')),
      carbs: num($('in-carbs')),
      fats: num($('in-fats')),
      fibre: num($('in-fibre')),
      calories: num($('in-calories')),
    });
    flash('save-note', 'Saved ✓');
    renderToday();
  });
}

// ============================================================ TRAIN
function renderTrain() {
  const start = store.loadWorkoutStart();
  setText('train-week', `Week ${programWeek(start, todayStr)}`);

  document.querySelectorAll('.day-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.day === selectedDay));

  renderSessionForm();
  renderVolumeChart();
  renderProgressionPicker();
  renderRecentSessions();
}

// The whole day on one screen. Weight boxes open pre-filled with what the
// progression rule suggests, so most sets need one tap on the reps box.
function renderSessionForm() {
  const exercises = store.loadProgram()[selectedDay] || [];
  const sessions = store.loadSessions();
  const saved = store.getSession(todayStr, selectedDay);

  if (exercises.length === 0) {
    $('session-form').innerHTML =
      `<div class="empty">No ${selectedDay} exercises yet. Add them on the Program tab.</div>`;
    return;
  }

  $('session-form').innerHTML = exercises.map(ex => {
    const sug = suggestion(lastEntryFor(sessions, ex.id, ex.name), ex);
    const logged = saved && (saved.exercises || [])
      .find(e => e.exerciseId === ex.id || e.name === ex.name);

    const badge = sug.verdict === 'up' ? '<span class="badge-up">↑ go up</span>'
      : sug.verdict === 'hold' ? '<span class="badge-hold">= hold</span>' : '';

    const lastLine = sug.lastText
      ? `<div class="last-line">last: ${escapeHtml(sug.lastText)} ${badge}</div>`
      : '<div class="last-line subtle">first time — pick a weight</div>';

    const lastNote = sug.note
      ? `<div class="last-note">📝 ${escapeHtml(sug.note)}</div>` : '';

    const rows = Array.from({ length: ex.targetSets }, (_, si) => {
      const set = logged && logged.sets ? logged.sets[si] : null;
      // A prefilled weight is a hint, not an entry — styled lighter until touched.
      const hasLoggedWeight = set && set.weight != null;
      const weightVal = hasLoggedWeight ? set.weight : (sug.weight ?? '');
      const repsVal = set && set.reps != null ? set.reps : '';
      return `
      <div class="set-row">
        <span class="set-no">${si + 1}</span>
        <input type="number" step="0.5" inputmode="decimal" placeholder="kg" value="${weightVal}"
               class="${!hasLoggedWeight && sug.weight != null ? 'suggested' : ''}"
               data-ex-id="${escapeAttr(ex.id)}" data-set="${si}" data-field="weight" />
        <input type="number" inputmode="numeric" placeholder="reps" value="${repsVal}"
               data-ex-id="${escapeAttr(ex.id)}" data-set="${si}" data-field="reps" />
      </div>`;
    }).join('');

    const note = (logged && logged.note) || '';
    return `
      <div class="exercise" data-ex-id="${escapeAttr(ex.id)}">
        <div class="exercise-head">
          <span class="exercise-name">${escapeHtml(ex.name)}</span>
          <span class="exercise-target">${ex.targetSets} × ${escapeHtml(ex.repRange)}</span>
        </div>
        ${lastLine}
        ${lastNote}
        <div class="set-row set-head"><span class="set-no">#</span><span>Weight</span><span>Reps</span></div>
        ${rows}
        <button type="button" class="note-toggle ghost" data-ex-id="${escapeAttr(ex.id)}">
          ${note ? '📝 note' : '＋ note'}
        </button>
        <textarea class="ex-note ${note ? '' : 'hidden'}" rows="2" placeholder="how did it feel?"
                  data-ex-id="${escapeAttr(ex.id)}" data-field="note">${escapeHtml(note)}</textarea>
      </div>`;
  }).join('');
}

// Autosave: everything typed into the form is written straight to storage, so
// there is no button to forget and nothing to lose if the app is backgrounded.
let saveTimer = null;
function scheduleSave() {
  setText('session-status', 'Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSessionFromForm, 400);
}

function saveSessionFromForm() {
  const exercises = store.loadProgram()[selectedDay] || [];
  const result = [];

  for (const ex of exercises) {
    const sets = [];
    for (let si = 0; si < ex.targetSets; si++) {
      const w = document.querySelector(`[data-ex-id="${cssEscape(ex.id)}"][data-set="${si}"][data-field="weight"]`);
      const r = document.querySelector(`[data-ex-id="${cssEscape(ex.id)}"][data-set="${si}"][data-field="reps"]`);
      if (!w || !r) continue;
      const weight = w.value === '' ? null : Number(w.value);
      const reps = r.value === '' ? null : Number(r.value);
      // A prefilled weight with no reps is a suggestion nobody acted on yet.
      if (reps == null && w.classList.contains('suggested')) continue;
      if (weight != null || reps != null) sets.push({ weight, reps });
    }
    const noteEl = document.querySelector(`textarea[data-ex-id="${cssEscape(ex.id)}"]`);
    const note = noteEl ? noteEl.value.trim() : '';
    if (sets.length || note) {
      result.push({ exerciseId: ex.id, name: ex.name, note, sets });
    }
  }

  store.upsertSession({
    date: todayStr,
    day: selectedDay,
    week: programWeek(store.loadWorkoutStart(), todayStr),
    exercises: result,
  });

  if (result.length) {
    sync.enqueue(todayStr, selectedDay);
    flushSync();
  }
  setText('session-status', result.length ? 'Saved ✓' : '');
  renderVolumeChart();
  renderRecentSessions();
}

function wireSessionForm() {
  const form = $('session-form');

  form.addEventListener('input', e => {
    const el = e.target;
    if (!el.matches('input, textarea')) return;
    // Once touched, a suggested weight becomes a real entry.
    el.classList.remove('suggested');
    scheduleSave();
  });

  form.addEventListener('click', e => {
    const btn = e.target.closest('.note-toggle');
    if (!btn) return;
    const ta = form.querySelector(`textarea[data-ex-id="${cssEscape(btn.dataset.exId)}"]`);
    if (ta) {
      ta.classList.toggle('hidden');
      if (!ta.classList.contains('hidden')) ta.focus();
    }
  });
}

function renderVolumeChart() {
  const C = chartColors();
  $('chart-volume').innerHTML = groupedBarChartSVG(weeklyVolume(store.loadSessions()), {
    colors: [C.training, C.nutrition, C.goal],
    textColor: C.text,
  });
}

function allExerciseNames() {
  const program = store.loadProgram();
  const names = [];
  DAY_TYPES.forEach(day => (program[day] || []).forEach(ex => {
    if (!names.includes(ex.name)) names.push(ex.name);
  }));
  return names;
}

function renderProgressionPicker() {
  const sel = $('prog-select');
  const names = allExerciseNames();
  const current = sel.value && names.includes(sel.value) ? sel.value : names[0];
  sel.innerHTML = names.map(n => `<option value="${escapeAttr(n)}"${n === current ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('');
  sel.onchange = renderProgressionChart;
  renderProgressionChart();
}

function renderProgressionChart() {
  const name = $('prog-select').value;
  const sessions = store.loadSessions();
  const prog = exerciseProgression(sessions, name);
  const C = chartColors();
  const points = prog.map((p, i) => ({ x: i, y: p.topWeight }));
  $('chart-prog').innerHTML = lineChartSVG(points, { color: C.training, textColor: C.text });

  if (prog.length === 0) {
    $('prog-history').innerHTML = `<div class="empty">No history for this lift yet.</div>`;
    return;
  }
  $('prog-history').innerHTML = prog.slice().reverse().map(p => `
    <div class="prog-row">
      <span>${formatDate(p.date)}</span>
      <span><b>${p.best.weight}kg × ${p.best.reps}</b> · ${p.totalReps} reps total</span>
    </div>`).join('');
}

function renderRecentSessions() {
  const sessions = store.loadSessions().slice().reverse();
  if (sessions.length === 0) {
    $('recent-sessions').innerHTML = `<div class="empty">No sessions logged yet. Pick a day above to start.</div>`;
    return;
  }
  const total = sessions.length;
  $('recent-sessions').innerHTML = sessions.slice(0, 12).map((s, i) => {
    const realIndex = total - 1 - i;
    const topLine = (s.exercises || []).map(e => {
      const b = bestSet(e.sets);
      return b ? `${e.name.split(' ')[0]} ${b.weight}×${b.reps}` : e.name;
    }).slice(0, 3).join(' · ');
    return `
      <div class="session-item">
        <div>
          <div class="session-day">${s.day} <span class="muted small">· Week ${s.week ?? '—'}</span></div>
          <div class="session-meta">${formatDate(s.date)} · ${sessionVolume(s)} sets</div>
          <div class="session-meta">${topLine}</div>
        </div>
        <button class="session-del" data-index="${realIndex}" title="Delete">🗑</button>
      </div>`;
  }).join('');

  $('recent-sessions').querySelectorAll('.session-del').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this session?')) {
        store.deleteSession(Number(btn.dataset.index));
        renderSessionForm();
        renderVolumeChart();
        renderProgressionChart();
        renderRecentSessions();
      }
    });
  });
}

function wireTrain() {
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDay = btn.dataset.day;
      renderTrain();
    });
  });
  wireSessionForm();
}

// ============================================================ SETTINGS
const TARGET_FIELDS = ['calories', 'protein', 'carbs', 'fat', 'fibre'];

function renderSettings() {
  const t = store.loadTargets();
  TARGET_FIELDS.forEach(f => { $('t-' + f).value = t[f]; });
  renderSyncState();
}

function renderSyncState() {
  const s = store.loadSyncSettings();
  $('sync-url').value = s.url;
  $('sync-secret').value = s.secret;

  const queued = store.loadSyncQueue().length;
  const at = store.loadSyncedAt();
  if (!s.url) {
    setText('sync-state', 'Not set up — your data stays on this phone only.');
  } else {
    const when = at ? new Date(at).toLocaleString() : 'never';
    setText('sync-state', `Last synced: ${when}${queued ? ` · ${queued} waiting` : ''}`);
  }

  // Show why the last attempt failed. Without this a failure on a phone is
  // undiagnosable — there is no console to open.
  const err = store.loadSyncError();
  const box = $('sync-error');
  box.textContent = err ? `Last error: ${err}` : '';
  box.classList.toggle('hidden', !err);
}

// Fire-and-forget: a failed send just leaves the session queued for next time.
async function flushSync() {
  const { sent, failed } = await sync.flush();
  if (sent || failed) renderSyncState();
  if (failed) setText('session-status', 'Saved · will sync when online');
  else if (sent) setText('session-status', 'Saved · synced ✓');
}

function wireSettings() {
  $('targets-form').addEventListener('submit', e => {
    e.preventDefault();
    const t = store.loadTargets();
    TARGET_FIELDS.forEach(f => { const v = $('t-' + f).value; if (v !== '') t[f] = Number(v); });
    store.saveTargets(t);
    flash('targets-note', 'Targets saved ✓');
    renderToday();
  });

  $('sync-form').addEventListener('submit', async e => {
    e.preventDefault();
    store.saveSyncSettings({ url: $('sync-url').value, secret: $('sync-secret').value });
    flash('sync-note', 'Sync settings saved ✓');
    renderSyncState();
    await flushSync();
  });

  $('sync-now').addEventListener('click', async () => {
    const s = store.loadSyncSettings();
    if (!s.url) { flash('sync-note', 'Add the web app URL first.', true); return; }

    // Nothing logged yet is the common case on a fresh install. Saying
    // "0 sessions synced ✓" there reads like a success and hides the real
    // reason nothing reached the sheet.
    const sessions = store.loadSessions();
    if (sessions.length === 0) {
      flash('sync-note', 'Nothing to sync yet — log a session on the Train tab first.', true);
      return;
    }

    // Re-queue everything so "Sync now" rebuilds the sheet from scratch.
    sessions.forEach(sess => sync.enqueue(sess.date, sess.day));
    flash('sync-note', 'Syncing…');
    const { sent, failed } = await sync.flush();
    renderSyncState();
    flash('sync-note', failed
      ? `${sent} sent, ${failed} failed — check the URL and secret.`
      : `${sent} session${sent === 1 ? '' : 's'} synced ✓`, failed > 0);
  });

  $('export-btn').addEventListener('click', () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `macros-gym-backup-${todayStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash('backup-note', 'Exported ✓');
  });

  $('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const result = store.importJSON(text);
    if (result.ok) {
      flash('backup-note', 'Imported ✓');
      renderSettings(); renderToday();
    } else {
      flash('backup-note', result.error, true);
    }
    e.target.value = '';
  });

  $('reset-btn').addEventListener('click', () => {
    if (confirm('Erase ALL data — macro logs, targets, and workouts? This cannot be undone.')) {
      const theme = localStorage.getItem('ht.theme');
      localStorage.clear();
      if (theme) localStorage.setItem('ht.theme', theme);
      flash('reset-note', 'All data erased.', true);
      renderSettings(); renderToday();
    }
  });
}

// ============================================================ THEME
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('ht.theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d0f12' : '#12c16b');
  document.querySelectorAll('.theme-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === theme));
}

function wireTheme() {
  applyTheme(localStorage.getItem('ht.theme') || 'dark');
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      renderToday();
      if ($('prog-select').options.length) renderProgressionChart();
    });
  });
}

// ============================================================ SHARED
function wireNav() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      $(tab.dataset.screen).classList.add('active');
      setText('screen-title', tab.dataset.title);
      if (tab.dataset.screen === 'train') renderTrain();
      if (tab.dataset.screen === 'program') programScreen.render();
      if (tab.dataset.screen === 'settings') renderSettings();
    });
  });
}

// ============================================================ INIT
wireTheme();
wireToday();
wireTrain();
programScreen.wire();
wireSettings();
wireNav();
renderToday();

// Push anything logged while offline as soon as we can.
flushSync();
window.addEventListener('online', flushSync);

// PWA: register the service worker and ask Android to keep our data.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}

// The Program screen: the user-editable Push/Pull/Legs template.
//
// Edits commit on change rather than behind a save button, so the list can
// never drift from what's stored. Deleting a lift removes it from the program
// but leaves logged sessions intact — sessions carry the exercise name, so old
// history and charts still read correctly.

import { parseRepRange, DEFAULT_INCREMENT } from './program.js';
import { $, setText, flash, escapeAttr, escapeHtml } from './dom.js';

export function createProgramScreen({ store, onProgramChange }) {
  let programDay = null;

  function renderProgram() {
    const days = store.loadDayTypes();
    if (!days.includes(programDay)) programDay = days[0] || null;

    renderDayTypes(days);

    $('prog-day-picker').style.gridTemplateColumns = `repeat(${Math.min(days.length, 3)}, 1fr)`;
    $('prog-day-picker').innerHTML = days.map(d =>
      `<button type="button" class="pday-btn${d === programDay ? ' active' : ''}" data-day="${escapeAttr(d)}">${escapeHtml(d)}</button>`
    ).join('');

    setText('ax-day', programDay || '—');
    $('t-workoutStart').value = store.loadWorkoutStart();

    if (!programDay) {
      $('program-list').innerHTML = `<div class="empty">Add a training day above to get started.</div>`;
      return;
    }

    const list = store.loadProgram()[programDay] || [];
    if (list.length === 0) {
      $('program-list').innerHTML = `<div class="empty">No ${programDay} exercises yet — add one below.</div>`;
      return;
    }

    $('program-list').innerHTML = list.map((ex, i) => `
      <div class="prog-edit" data-id="${escapeAttr(ex.id)}">
        <input type="text" class="pe-name" value="${escapeAttr(ex.name)}" data-field="name" aria-label="Exercise name" />
        <div class="pe-row">
          <label>Sets <input type="number" inputmode="numeric" min="1" max="10" value="${ex.targetSets}" data-field="targetSets" /></label>
          <label>Reps <input type="text" value="${escapeAttr(ex.repRange)}" data-field="repRange" placeholder="8-10" /></label>
          <label>+kg <input type="number" inputmode="decimal" step="0.5" value="${ex.increment ?? DEFAULT_INCREMENT}" data-field="increment" /></label>
          <span class="pe-actions">
            <button type="button" class="pe-btn" data-move="-1" ${i === 0 ? 'disabled' : ''} title="Move up">▲</button>
            <button type="button" class="pe-btn" data-move="1" ${i === list.length - 1 ? 'disabled' : ''} title="Move down">▼</button>
            <button type="button" class="pe-btn pe-del" title="Delete">🗑</button>
          </span>
        </div>
      </div>`).join('');
  }

  // The split itself — the list of training days.
  function renderDayTypes(days) {
    $('daytype-list').innerHTML = days.map((d, i) => `
      <div class="daytype-row" data-day="${escapeAttr(d)}">
        <input type="text" class="dt-name" value="${escapeAttr(d)}" aria-label="Day name" />
        <span class="pe-actions">
          <button type="button" class="pe-btn" data-move="-1" ${i === 0 ? 'disabled' : ''} title="Move up">▲</button>
          <button type="button" class="pe-btn" data-move="1" ${i === days.length - 1 ? 'disabled' : ''} title="Move down">▼</button>
          <button type="button" class="pe-btn pe-del" title="Delete day">🗑</button>
        </span>
      </div>`).join('');
  }

  function wireDayTypes() {
    const list = $('daytype-list');

    list.addEventListener('change', e => {
      if (!e.target.classList.contains('dt-name')) return;
      const row = e.target.closest('.daytype-row');
      const oldName = row.dataset.day;
      const newName = e.target.value.trim();

      if (!newName) { renderProgram(); return; }
      if (newName === oldName) return;
      if (store.loadDayTypes().includes(newName)) {
        flash('day-note', `You already have a day called "${newName}".`, true);
        renderProgram();
        return;
      }

      store.renameDayType(oldName, newName);
      if (programDay === oldName) programDay = newName;
      flash('day-note', `Renamed — sessions logged as "${oldName}" came with it ✓`);
      renderProgram();
      onProgramChange();
    });

    list.addEventListener('click', e => {
      const btn = e.target.closest('button');
      const row = e.target.closest('.daytype-row');
      if (!btn || !row) return;
      const name = row.dataset.day;

      if (btn.dataset.move) {
        store.moveDayType(name, Number(btn.dataset.move));
      } else if (btn.classList.contains('pe-del')) {
        if (store.loadDayTypes().length <= 1) {
          flash('day-note', 'You need at least one training day.', true);
          return;
        }
        if (!confirm(`Remove "${name}" from your split?\n\nIts exercise list goes, but every session you logged is kept.`)) return;
        store.deleteDayType(name);
      } else {
        return;
      }
      renderProgram();
      onProgramChange();
    });

    $('add-day-form').addEventListener('submit', e => {
      e.preventDefault();
      const name = $('ad-name').value.trim();
      if (!name) { flash('day-note', 'Give the day a name first.', true); return; }
      if (store.loadDayTypes().includes(name)) {
        flash('day-note', `You already have a day called "${name}".`, true);
        return;
      }
      store.addDayType(name);
      $('ad-name').value = '';
      programDay = name;
      flash('day-note', `Added "${name}" ✓`);
      renderProgram();
      onProgramChange();
    });
  }

  function wireProgram() {
    wireDayTypes();
    // Delegated — the buttons are rebuilt whenever the split changes.
    $('prog-day-picker').addEventListener('click', e => {
      const btn = e.target.closest('.pday-btn');
      if (!btn) return;
      programDay = btn.dataset.day;
      renderProgram();
    });

    const list = $('program-list');

    // Edits commit on change — no save button to forget.
    list.addEventListener('change', e => {
      const input = e.target;
      const row = input.closest('.prog-edit');
      if (!row || !input.dataset.field) return;
      const field = input.dataset.field;
      let value = input.value;

      if (field === 'name') {
        value = value.trim();
        if (!value) { renderProgram(); return; }
      } else if (field === 'targetSets') {
        value = Math.max(1, Math.min(10, Number(value) || 1));
      } else if (field === 'increment') {
        value = Number(value);
        if (!Number.isFinite(value) || value <= 0) value = DEFAULT_INCREMENT;
      } else if (field === 'repRange') {
        if (!parseRepRange(value)) {
          flash('program-note', 'Rep range should look like 8-10 or 12.', true);
          renderProgram();
          return;
        }
      }

      store.updateExercise(programDay, row.dataset.id, { [field]: value });
      flash('program-note', 'Saved ✓');
      renderProgram();
      onProgramChange();
    });

    list.addEventListener('click', e => {
      const btn = e.target.closest('button');
      const row = e.target.closest('.prog-edit');
      if (!btn || !row) return;

      if (btn.dataset.move) {
        store.moveExercise(programDay, row.dataset.id, Number(btn.dataset.move));
      } else if (btn.classList.contains('pe-del')) {
        const name = row.querySelector('.pe-name').value;
        if (!confirm(`Remove "${name}" from ${programDay}?\n\nSessions you already logged with it are kept.`)) return;
        store.deleteExercise(programDay, row.dataset.id);
      } else {
        return;
      }
      renderProgram();
      onProgramChange();
    });

    $('add-exercise-form').addEventListener('submit', e => {
      e.preventDefault();
      const name = $('ax-name').value.trim();
      const range = $('ax-range').value.trim();
      if (!name) { flash('add-note', 'Give it a name first.', true); return; }
      if (!parseRepRange(range)) { flash('add-note', 'Rep range should look like 8-10 or 12.', true); return; }

      store.addExercise(programDay, {
        name,
        targetSets: Number($('ax-sets').value) || 3,
        repRange: range,
        increment: Number($('ax-inc').value) || DEFAULT_INCREMENT,
      });
      $('ax-name').value = '';
      $('ax-range').value = '';
      flash('add-note', `Added to ${programDay} ✓`);
      renderProgram();
      onProgramChange();
    });

    $('prog-import-btn').addEventListener('click', () => {
      const text = $('prog-import').value.trim();
      if (!text) { flash('prog-import-note', 'Paste the program text first.', true); return; }
      if (!confirm('Replace your split and exercise list with this program?\n\nYour logged sessions and macros are not touched.')) return;

      const result = store.importProgram(text);
      if (!result.ok) { flash('prog-import-note', result.error, true); return; }

      $('prog-import').value = '';
      programDay = null;
      flash('prog-import-note', `Loaded ${result.days} training days ✓`);
      renderProgram();
      onProgramChange();
    });

    $('workout-form').addEventListener('submit', e => {
      e.preventDefault();
      const v = $('t-workoutStart').value;
      if (v) store.saveWorkoutStart(v);
      flash('workout-note', 'Start date saved ✓');
      onProgramChange();
    });
  }


  return { render: renderProgram, wire: wireProgram };
}

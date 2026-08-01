// The Program screen: the user-editable Push/Pull/Legs template.
//
// Edits commit on change rather than behind a save button, so the list can
// never drift from what's stored. Deleting a lift removes it from the program
// but leaves logged sessions intact — sessions carry the exercise name, so old
// history and charts still read correctly.

import { parseRepRange, DEFAULT_INCREMENT } from './program.js';
import { $, setText, flash, escapeAttr } from './dom.js';

export function createProgramScreen({ store, onProgramChange }) {
  let programDay = 'Push';

  function renderProgram() {
    const program = store.loadProgram();
    const list = program[programDay] || [];

    document.querySelectorAll('.pday-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.day === programDay));
    setText('ax-day', programDay);
    $('t-workoutStart').value = store.loadWorkoutStart();

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

  function wireProgram() {
    document.querySelectorAll('.pday-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        programDay = btn.dataset.day;
        renderProgram();
      });
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

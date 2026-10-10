// The Plan screen: commit to this week's gym days, lock them in, and give a
// reason for any planned day you missed.
//
// Days can only be planned from today onward. Planning yesterday after the
// fact would let the score grade its own homework.

import {
  MISS_REASONS, WEEKDAYS, weekStart, weekSummary, sessionsByDate,
  commitmentStreak, recentWeeks, reasonTally, suggestDay,
} from './plan.js';
import { todayISO, addDays, shortDate } from './calculations.js';
import { $, flash, escapeAttr, escapeHtml, dayColors } from './dom.js';

const STATUS = {
  done: { icon: '✅', text: 'Done' },
  missed: { icon: '❌', text: 'Missed' },
  today: { icon: '⏳', text: 'Today' },
  planned: { icon: '📌', text: 'Planned' },
  bonus: { icon: '⭐', text: 'Bonus' },
  rest: { icon: '', text: 'Rest' },
};

export function createPlanScreen({ store, onPlanChange }) {
  let viewStart = weekStart(todayISO());

  function render() {
    const today = todayISO();
    const plan = store.loadPlan();
    const sessions = store.loadSessions();
    const byDate = sessionsByDate(sessions);
    const days = store.loadDayTypes();
    const colors = dayColors(days);
    const colorOf = d => colors[days.indexOf(d)] || 'var(--muted)';

    const week = weekSummary(viewStart, plan, byDate, today);
    const lock = store.loadPlanLocks()[viewStart] || null;
    const locked = !!(lock && lock.lockedAt);
    const isThisWeek = viewStart === weekStart(today);

    $('plan-week-label').textContent = isThisWeek ? 'This week'
      : `${shortDate(viewStart)} – ${shortDate(addDays(viewStart, 6))}`;
    $('plan-week-range').textContent = isThisWeek
      ? `${shortDate(viewStart)} – ${shortDate(addDays(viewStart, 6))}` : '';

    // Lock control. Only worth offering while there's a plan and days ahead.
    const lockBox = $('plan-lock');
    if (locked) {
      lockBox.innerHTML = `<span class="lock-on">🔒 Locked in</span>
        <button type="button" class="ghost small-btn" data-act="unlock">Unlock</button>
        ${lock.unlocks ? `<span class="subtle">unlocked ${lock.unlocks}× this week</span>` : ''}`;
    } else if (week.planned && !week.complete) {
      lockBox.innerHTML = `<button type="button" class="primary" data-act="lock">🔒 Lock in ${week.planned} day${week.planned === 1 ? '' : 's'}</button>
        ${lock && lock.unlocks ? `<span class="subtle">unlocked ${lock.unlocks}× this week</span>` : ''}`;
    } else {
      lockBox.innerHTML = week.complete ? '' : '<span class="subtle">Plan a day below, then lock it in.</span>';
    }

    $('plan-days').innerHTML = week.days.map((d, i) => {
      const st = STATUS[d.status];
      const editable = !locked && d.date >= today;
      const isToday = d.date === today;
      const plannedDay = d.entry && d.entry.day;

      let control;
      if (plannedDay && editable) {
        const opts = days.includes(plannedDay) ? days : [plannedDay, ...days];
        control = `
          <select class="select plan-select" data-date="${d.date}" style="--day-accent:${colorOf(plannedDay)}">
            ${opts.map(o => `<option value="${escapeAttr(o)}"${o === plannedDay ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}
          </select>
          <button type="button" class="pe-btn" data-act="clear" data-date="${d.date}" title="Make it a rest day">✕</button>`;
      } else if (plannedDay) {
        control = `<span class="plan-pill" style="--day-accent:${colorOf(plannedDay)}">${escapeHtml(plannedDay)}</span>`;
      } else if (editable) {
        control = `<button type="button" class="ghost plan-add" data-act="add" data-date="${d.date}">＋ Gym</button>`;
      } else {
        control = '';
      }

      const loggedNote = d.logged.length && (!plannedDay || d.logged.join() !== plannedDay)
        ? `<span class="subtle">logged ${escapeHtml(d.logged.join(', '))}</span>` : '';

      // The "why" panel — only for missed days, and editable even when locked:
      // locking freezes the commitment, not your explanation of it.
      const why = d.status !== 'missed' ? '' : `
        <div class="miss-why">
          <div class="reason-chips">
            ${MISS_REASONS.map(r => `<button type="button" class="rchip${d.entry.reason === r ? ' active' : ''}" data-act="reason" data-reason="${r}" data-date="${d.date}">${r}</button>`).join('')}
          </div>
          <input type="text" class="miss-note" data-date="${d.date}" placeholder="what got in the way? (optional)" value="${escapeAttr(d.entry.note || '')}" />
        </div>`;

      return `
        <div class="plan-day status-${d.status}${isToday ? ' is-today' : ''}">
          <div class="plan-date"><b>${WEEKDAYS[i]}</b><span>${Number(d.date.slice(8))}</span></div>
          <div class="plan-main">
            <div class="plan-line">${control} ${loggedNote}</div>
            ${why}
          </div>
          <div class="plan-status" title="${st.text}">${st.icon}<span>${d.status === 'rest' ? '' : st.text}</span></div>
        </div>`;
    }).join('');

    renderScore(plan, byDate, today, week);
  }

  function renderScore(plan, byDate, today, viewed) {
    const current = weekSummary(weekStart(today), plan, byDate, today);
    const streak = commitmentStreak(plan, byDate, today);
    const weeks = recentWeeks(plan, byDate, today, 8);
    const reasons = reasonTally(plan, byDate, today, weeks[0].start);
    const w = viewed.start === current.start ? current : viewed;

    const headline = w.planned
      ? `${w.done} of ${w.planned} planned${w.pct != null ? ` · ${w.pct}%` : ''}`
      : 'Nothing planned';
    const sub = [
      w.missed ? `${w.missed} missed` : '',
      w.bonus ? `${w.bonus} bonus` : '',
    ].filter(Boolean).join(' · ');

    $('plan-score').innerHTML = `
      <div class="score-row">
        <div>
          <div class="card-eyebrow">${w === current ? 'This week' : 'That week'}</div>
          <div class="score-big">${headline}</div>
          ${sub ? `<div class="subtle">${sub}</div>` : ''}
        </div>
        <div class="streak">
          <div class="score-big">${streak}🔥</div>
          <div class="subtle">week${streak === 1 ? '' : 's'} on plan</div>
        </div>
      </div>
      <div class="week-bars" aria-label="Last 8 weeks, percent of planned days done">
        ${weeks.map(x => `
          <div class="wbar${x.start === viewed.start ? ' sel' : ''}" title="${shortDate(x.start)}: ${x.planned ? `${x.done}/${x.planned}` : 'no plan'}">
            <div class="wbar-track"><div class="wbar-fill${x.pct === 100 ? ' full' : ''}" style="height:${x.pct ?? 0}%"></div></div>
            <span>${x.planned ? `${x.done}/${x.planned}` : '–'}</span>
          </div>`).join('')}
      </div>
      <div class="reasons">
        ${reasons.length
          ? `<span class="subtle">Why you missed (8 wks):</span> ${reasons.map(r => `<span class="rchip static">${escapeHtml(r.reason)} ×${r.n}</span>`).join(' ')}`
          : '<span class="subtle">No missed days in the last 8 weeks.</span>'}
      </div>`;
  }

  function changed() {
    render();
    onPlanChange();
  }

  function wire() {
    $('plan-prev').addEventListener('click', () => { viewStart = addDays(viewStart, -7); render(); });
    $('plan-next').addEventListener('click', () => { viewStart = addDays(viewStart, 7); render(); });
    $('plan-today').addEventListener('click', () => { viewStart = weekStart(todayISO()); render(); });

    $('plan-lock').addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.act === 'lock') {
        store.setWeekLocked(viewStart, true);
        flash('plan-note', 'Locked in. See you there 💪');
      } else if (btn.dataset.act === 'unlock') {
        if (!confirm('Unlock this week?\n\nYou can change the plan again, but the unlock is counted.')) return;
        store.setWeekLocked(viewStart, false);
      }
      changed();
    });

    const list = $('plan-days');
    list.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn || !btn.dataset.date) return;
      const date = btn.dataset.date;
      if (btn.dataset.act === 'add') {
        const day = suggestDay(date, store.loadPlan(), store.loadSessions(), store.loadDayTypes());
        if (!day) { flash('plan-note', 'Add a training day on the Program tab first.', true); return; }
        store.updatePlanDay(date, { day });
      } else if (btn.dataset.act === 'clear') {
        store.updatePlanDay(date, { day: null });
      } else if (btn.dataset.act === 'reason') {
        const current = (store.loadPlan()[date] || {}).reason;
        // Tapping the selected reason again clears it.
        store.updatePlanDay(date, { reason: current === btn.dataset.reason ? '' : btn.dataset.reason });
      } else {
        return;
      }
      changed();
    });

    list.addEventListener('change', e => {
      const el = e.target;
      if (el.classList.contains('plan-select')) {
        store.updatePlanDay(el.dataset.date, { day: el.value });
        changed();
      } else if (el.classList.contains('miss-note')) {
        store.updatePlanDay(el.dataset.date, { note: el.value.trim() });
        flash('plan-note', 'Saved ✓');
        onPlanChange();
      }
    });
  }

  return { render, wire };
}

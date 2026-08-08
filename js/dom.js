// Small DOM helpers shared by the screen modules. No app state lives here.

export const $ = id => document.getElementById(id);

export const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };

export const cssVar = n =>
  getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// Chart colours come from the active theme, so charts follow light/dark.
export function chartColors() {
  return {
    nutrition: cssVar('--nutrition'), training: cssVar('--training'),
    goal: cssVar('--alert'), body: cssVar('--body'), activity: cssVar('--activity'),
    text: cssVar('--muted'),
  };
}

// One identity colour per training day, resolved from the theme so it follows
// light/dark. The same colour is used for the day button, its bar in the volume
// chart and its legend dot — so a day reads as itself everywhere.
export function dayColors(days) {
  const c = chartColors();
  const palette = [c.training, c.nutrition, c.goal, c.body, c.activity];
  return (days || []).map((_, i) => palette[i % palette.length]);
}

// Show a transient message under a form, then clear it.
export function flash(id, msg, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('err', isError);
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ''; el.classList.remove('err'); }, 2200);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const escapeAttr = escapeHtml;

// Exercise ids are generated from [a-z0-9], so this is belt-and-braces — but a
// querySelector built from stored data is worth escaping regardless.
export function cssEscape(s) {
  return typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(s)
    : String(s).replace(/["\\]/g, '\\$&');
}

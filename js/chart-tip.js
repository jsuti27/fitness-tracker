// Tap-to-read tooltips for the SVG charts. The charts themselves stay pure
// strings (charts.js); each one carries its tap targets as data-tips on the
// <svg>, in viewBox units. This module turns a tap or drag into the nearest
// point, draws a guide line and dot over it, and shows its label.
//
// Bound once per chart container: the chart inside is re-rendered with
// innerHTML, so the listeners live on the container and re-read the points
// on every touch.

export function attachChartTip(wrap) {
  if (!wrap || wrap.dataset.tipBound) return;
  wrap.dataset.tipBound = '1';
  wrap.classList.add('tip-host');

  let pressed = false;

  const parts = () => {
    let tip = wrap.querySelector(':scope > .ctip');
    if (!tip) {
      wrap.insertAdjacentHTML('beforeend',
        '<div class="cguide" hidden></div><div class="cdot" hidden></div><div class="ctip" hidden></div>');
      tip = wrap.querySelector(':scope > .ctip');
    }
    return { tip, guide: wrap.querySelector(':scope > .cguide'), dot: wrap.querySelector(':scope > .cdot') };
  };

  const hide = () => {
    wrap.querySelectorAll(':scope > .ctip, :scope > .cguide, :scope > .cdot').forEach(el => { el.hidden = true; });
  };

  const show = e => {
    const svg = wrap.querySelector('svg[data-tips]');
    if (!svg) return;
    let pts;
    try { pts = JSON.parse(decodeURIComponent(svg.dataset.tips)); } catch { return; }
    if (!pts.length) return;

    const vb = svg.viewBox.baseVal;
    const box = svg.getBoundingClientRect();
    const host = wrap.getBoundingClientRect();
    const sx = box.width / vb.width, sy = box.height / vb.height;
    const vx = (e.clientX - box.left) / sx;

    let best = pts[0];
    for (const p of pts) if (Math.abs(p.x - vx) < Math.abs(best.x - vx)) best = p;

    const left = box.left - host.left + best.x * sx;
    const top = box.top - host.top + best.y * sy;
    const { tip, guide, dot } = parts();

    guide.style.left = `${left}px`;
    guide.style.top = `${box.top - host.top}px`;
    guide.style.height = `${box.height}px`;
    dot.style.left = `${left}px`;
    dot.style.top = `${top}px`;
    tip.textContent = best.tip;
    [tip, guide, dot].forEach(el => { el.hidden = false; });

    // Measured after the text is in, so the label is clamped inside the card
    // rather than hanging off the edge on the first and last point.
    const M = 4;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = `${Math.max(M, Math.min(host.width - tw - M, left - tw / 2))}px`;
    // Above the point, unless that would cover it — then below.
    tip.style.top = `${top - th - 10 >= 0 ? top - th - 10 : Math.min(host.height - th - M, top + 12)}px`;
  };

  wrap.addEventListener('pointerdown', e => { pressed = true; show(e); });
  wrap.addEventListener('pointermove', e => { if (pressed || e.pointerType === 'mouse') show(e); });
  wrap.addEventListener('pointerup', () => { pressed = false; });
  wrap.addEventListener('pointercancel', () => { pressed = false; });
  wrap.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  // A tap anywhere else puts it away.
  document.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) hide(); });
}

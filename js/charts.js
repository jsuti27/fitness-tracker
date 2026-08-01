// Hand-rolled SVG charts — zero dependencies, work offline. Pure string output.
// Colours are passed in so the charts follow the active (light/dark) theme.

const PAD = 24;
const DEFAULT_GOAL = '#ff4d6a';
const DEFAULT_MISS = '#e7ebef';
const DEFAULT_TEXT = '#8b9299';

function scale(v, min, max, lo, hi) {
  if (max === min) return (lo + hi) / 2;
  return lo + ((v - min) / (max - min)) * (hi - lo);
}

function placeholder(width, height, textColor) {
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" preserveAspectRatio="none"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle" fill="${textColor}" font-size="13">No data yet</text></svg>`;
}

// points: [{x:number, y:number}] with x already numeric (e.g. day index).
export function lineChartSVG(points, {
  width = 320, height = 150, color = '#14b8c4', goal = null,
  goalColor = DEFAULT_GOAL, textColor = DEFAULT_TEXT,
} = {}) {
  if (!points || points.length < 2) return placeholder(width, height, textColor);

  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (goal != null) { minY = Math.min(minY, goal); maxY = Math.max(maxY, goal); }
  const padY = (maxY - minY) * 0.1 || 1;
  minY -= padY; maxY += padY;

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const px = x => scale(x, minX, maxX, PAD, width - PAD);
  const py = y => scale(y, minY, maxY, height - PAD, PAD);

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
  const area = `M${px(points[0].x).toFixed(1)},${(height - PAD).toFixed(1)} `
    + points.map(p => `L${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ')
    + ` L${px(points.at(-1).x).toFixed(1)},${(height - PAD).toFixed(1)} Z`;

  const goalLine = goal != null
    ? `<line class="goal" x1="${PAD}" y1="${py(goal).toFixed(1)}" x2="${width - PAD}" y2="${py(goal).toFixed(1)}" stroke="${goalColor}" stroke-width="1.5" stroke-dasharray="4 4" />`
    : '';
  const dots = points.map(p =>
    `<circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="2.5" fill="${color}" />`).join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="chart" preserveAspectRatio="none">`
    + `<path d="${area}" fill="${color}" opacity="0.14" />`
    + goalLine
    + `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" />`
    + dots
    + `</svg>`;
}

// values: [number]; goalLine draws a dashed reference line.
export function barChartSVG(values, {
  width = 320, height = 150, color = '#12c16b', goalLine = null,
  goalColor = DEFAULT_GOAL, missColor = DEFAULT_MISS, textColor = DEFAULT_TEXT,
} = {}) {
  if (!values || values.length === 0) return placeholder(width, height, textColor);

  const maxV = Math.max(...values, goalLine || 0, 1);
  const slot = (width - 2 * PAD) / values.length;
  const bw = Math.max(2, slot * 0.7);

  const bars = values.map((v, i) => {
    const h = scale(v, 0, maxV, 0, height - 2 * PAD);
    const x = PAD + i * slot + (slot - bw) / 2;
    const y = height - PAD - h;
    const hit = goalLine != null && v >= goalLine;
    return `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="3" fill="${hit ? color : missColor}" />`;
  }).join('');

  let goal = '';
  if (goalLine != null) {
    const gy = (height - PAD - scale(goalLine, 0, maxV, 0, height - 2 * PAD)).toFixed(1);
    goal = `<line class="goal" x1="${PAD}" y1="${gy}" x2="${width - PAD}" y2="${gy}" stroke="${goalColor}" stroke-width="1.5" stroke-dasharray="4 4" />`;
  }
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" preserveAspectRatio="none">${goal}${bars}</svg>`;
}

// rows: [{ week, Push, Pull, Legs }] — three bars per week slot.
// Colours are passed in so the chart follows the active theme.
export function groupedBarChartSVG(rows, {
  width = 320, height = 160, series = ['Push', 'Pull', 'Legs'],
  colors = ['#14b8c4', '#12c16b', '#f0a63a'], textColor = DEFAULT_TEXT,
} = {}) {
  if (!rows || rows.length === 0) return placeholder(width, height, textColor);

  const all = rows.flatMap(r => series.map(k => r[k] || 0));
  const maxV = Math.max(...all, 1);
  const slot = (width - 2 * PAD) / rows.length;
  const bw = Math.max(2, (slot * 0.8) / series.length);

  const bars = rows.flatMap((row, ri) => series.map((key, si) => {
    const v = row[key] || 0;
    if (v <= 0) return '';
    const h = scale(v, 0, maxV, 0, height - 2 * PAD - 12);
    const x = PAD + ri * slot + (slot - bw * series.length) / 2 + si * bw;
    const y = height - PAD - h;
    return `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${Math.max(h, 0).toFixed(1)}" rx="2" fill="${colors[si]}" />`;
  })).join('');

  const labels = rows.map((row, ri) =>
    `<text x="${(PAD + ri * slot + slot / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" fill="${textColor}" font-size="10">W${row.week}</text>`
  ).join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="chart" preserveAspectRatio="none">${bars}${labels}</svg>`;
}

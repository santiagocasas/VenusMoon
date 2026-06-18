/* ============================================================
   Moon–Venus Orientation  —  app.js
   ============================================================ */

'use strict';

// ── Constants ────────────────────────────────────────────────
const MAX_AZ_SPREAD = 30;   // degrees; gray out panel if spread exceeds this
const VIEW_PAD      = 1.5;  // degrees padding around the Moon+Venus bounding box
const VIEW_MIN_HALF = 1.5;  // minimum half-width/height so the view never collapses
const ALT_PAD_BOT_HORIZON = 2; // extra degrees below horizon when bodies are below it

// Body display config — smaller markers so they don't swamp a ~1° separation
const BODY = {
  moon:  { color: '#f0c040', size: 14, symbol: 'circle', label: 'Moon'  },
  venus: { color: '#56d4e0', size:  8, symbol: 'circle', label: 'Venus' },
};

// ── State ────────────────────────────────────────────────────
let locMap = {};       // id → location object
let locIds = [];       // ordered list of ids
let state  = { locA: null, locB: null, timeIdx: 6 };

// ── Boot ─────────────────────────────────────────────────────
fetch('data/graph_data.json')
  .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
  .then(init)
  .catch(err => {
    document.getElementById('plot').innerHTML =
      `<p style="color:#f85149;padding:2rem">Failed to load graph_data.json: ${err.message}</p>`;
  });

function init(data) {
  // Build location map
  data.locations.forEach(loc => {
    locMap[loc.id] = loc;
    locIds.push(loc.id);
  });

  // Populate dropdowns
  const selA = document.getElementById('locA');
  const selB = document.getElementById('locB');
  locIds.forEach((id, i) => {
    const optA = new Option(locMap[id].name, id);
    const optB = new Option(locMap[id].name, id);
    selA.appendChild(optA);
    selB.appendChild(optB);
  });

  // Default: first loc left, second loc right
  state.locA = locIds[0];
  state.locB = locIds[Math.min(1, locIds.length - 1)];
  selA.value = state.locA;
  selB.value = state.locB;

  // Slider max
  const maxIdx = locMap[locIds[0]].samples.length - 1;
  const slider = document.getElementById('timeSlider');
  slider.max   = maxIdx;
  slider.value = state.timeIdx;

  // Events
  selA.addEventListener('change', () => { state.locA = selA.value; render(); });
  selB.addEventListener('change', () => { state.locB = selB.value; render(); });
  slider.addEventListener('input', () => {
    state.timeIdx = parseInt(slider.value, 10);
    render();
  });

  render();
}

// ── Render ───────────────────────────────────────────────────
function render() {
  const panelA = buildPanel(state.locA, 'left');
  const panelB = buildPanel(state.locB, 'right');

  updateTimeInfo();
  updateDataCards(panelA, panelB);
  drawPlot(panelA, panelB);
}

// ── Build panel data ─────────────────────────────────────────
function buildPanel(locId, side) {
  const loc = locMap[locId];
  const s   = loc.samples[state.timeIdx];
  const r   = s.relative;

  const moonAlt  = s.moon.alt;
  const moonAz   = s.moon.az;
  const venusAlt = s.venus.alt;
  const venusAz  = s.venus.az;

  // Separation-based zoom: fit tightly around both bodies
  // Wrap az difference to [-180,180]. JS % keeps sign of dividend, so use explicit positive mod.
  const azSpread      = (((venusAz - moonAz) % 360) + 540) % 360 - 180;
  const tooFar        = Math.abs(azSpread) > MAX_AZ_SPREAD;

  // Bounding box in sky-arc space so both axes show the same arc per pixel.
  // cos(alt) converts az degrees → arc degrees; alt degrees need no conversion.
  const venusAzPlot = moonAz + azSpread;   // Venus az expressed continuously from Moon
  const cosAlt      = Math.cos(moonAlt * Math.PI / 180);

  // Arc-space offsets of Venus from Moon
  const arcDx = azSpread * cosAlt;         // az diff → sky arc
  const arcDy = venusAlt - moonAlt;        // alt diff is already arc

  // Square half-extent in arc degrees, with padding
  const arcHalf = Math.max(VIEW_MIN_HALF, Math.max(Math.abs(arcDx), Math.abs(arcDy)) / 2 + VIEW_PAD);

  // Convert back to axis units: az needs /cos(alt), alt stays as-is
  const xHalf   = arcHalf / Math.max(cosAlt, 0.01);
  const yHalf   = arcHalf;

  const xCenter = (moonAz + venusAzPlot) / 2;
  const yCenter = (moonAlt + venusAlt)   / 2;

  // Keep horizon visible: clamp yMin to at most -ALT_PAD_BOT_HORIZON
  const dataYMin = yCenter - yHalf;
  const dataYMax = yCenter + yHalf;
  const yMin = Math.min(dataYMin, -ALT_PAD_BOT_HORIZON);
  const yMax = dataYMax;
  const xMin = xCenter - xHalf;
  const xMax = xCenter + xHalf;

  // Angle geometry
  const angleFromUp = r.venus_angle_from_up;
  const dy          = r.venus_dy;
  const aboveBelow  = dy >= 0 ? 'above' : 'below';

  return {
    loc, s, r, side,
    moonAlt, moonAz, venusAlt, venusAzPlot, venusAz,
    xMin, xMax, yMin, yMax, spread: azSpread,
    tooFar, angleFromUp, aboveBelow,
    illum: r.moon_illumination,
  };
}

// ── Plotly traces for one panel ───────────────────────────────
function panelTraces(p, xDomainStart, xDomainEnd) {
  if (p.tooFar) return { traces: [], shapes: [], annotations: [] };

  const { moonAz, moonAlt, venusAzPlot, venusAlt, angleFromUp, illum } = p;

  // ── Traces ──────────────────────────────────────────────────
  const tMoon = {
    x: [moonAz], y: [moonAlt],
    mode: 'markers+text',
    marker: { color: BODY.moon.color, size: BODY.moon.size, symbol: BODY.moon.symbol,
               line: { color: '#c8a000', width: 1 } },
    text: [''], textposition: 'top center',
    name: 'Moon',
    showlegend: false,
    xaxis: p.side === 'left' ? 'x' : 'x2',
    yaxis: p.side === 'left' ? 'y' : 'y2',
    hovertemplate: `Moon<br>Alt: ${moonAlt.toFixed(2)}°<br>Az: ${moonAz.toFixed(2)}°<extra></extra>`,
  };

  const tVenus = {
    x: [venusAzPlot], y: [venusAlt],
    mode: 'markers+text',
    marker: { color: BODY.venus.color, size: BODY.venus.size, symbol: BODY.venus.symbol,
               line: { color: '#2aa0b0', width: 1 } },
    text: [''], textposition: 'top center',
    name: 'Venus',
    showlegend: false,
    xaxis: p.side === 'left' ? 'x' : 'x2',
    yaxis: p.side === 'left' ? 'y' : 'y2',
    hovertemplate: `Venus<br>Alt: ${venusAlt.toFixed(2)}°<br>Az: ${p.venusAz.toFixed(2)}°<extra></extra>`,
  };



  // ── Shapes ──────────────────────────────────────────────────
  const shapes = [];
  const annotations = [];
  const xRef = p.side === 'left' ? 'x' : 'x2';
  const yRef = p.side === 'left' ? 'y' : 'y2';

  // Fixed 5° sky-arc crosshair centered on the Moon.
  // Because xHalf = arcHalf/cos(alt) and yHalf = arcHalf, the axes already represent
  // equal arc per pixel, so ±2.5° on both axes = equal visual length.
  const SCALE  = 5;
  const half   = SCALE / 2;
  const yDomain = p.side === 'left' ? 'y' : 'y2';
  const xDomain = p.side === 'left' ? 'x' : 'x2';
  const crossStyle = { color: 'rgba(255,255,255,0.45)', width: 1.5, dash: 'dash' };
  // Vertical arm ±2.5° altitude
  shapes.push({
    type: 'line', xref: xDomain, yref: yDomain,
    x0: moonAz,        y0: moonAlt - half,
    x1: moonAz,        y1: moonAlt + half,
    line: crossStyle, layer: 'below',
  });
  // Horizontal arm ±2.5° azimuth (= same sky arc as vertical because axis is arc-equalised)
  shapes.push({
    type: 'line', xref: xDomain, yref: yDomain,
    x0: moonAz - half, y0: moonAlt,
    x1: moonAz + half, y1: moonAlt,
    line: crossStyle, layer: 'below',
  });

  // Wedge toward Venus (angle from up)
  // The angle_from_up is atan2(dx, dy): 0=up, +right, -left
  // We need to convert from angle_from_up (sky coords) to plot coords.
  // In plot coords: x=azimuth, y=altitude. 
  // angle_from_up=0 → straight up in plot = (0, +)
  // angle_from_up=90 → east in sky = az increasing = x+ 
  // But note: azimuth increases clockwise (N=0,E=90) while x-axis goes left→right.
  // The dx already accounts for cos(moon_alt), so we project onto plot x,y axes.
  // Plot direction of Venus from Moon (raw, not angle):
  // Blue line from Moon directly to Venus (exact coordinates, always reaches Venus)
  shapes.push({
    type: 'line',
    xref: xRef, yref: yRef,
    x0: moonAz,      y0: moonAlt,
    x1: venusAzPlot, y1: venusAlt,
    line: { color: 'rgba(86,212,224,0.7)', width: 1.5 },
    layer: 'below',
  });

  // ── Annotations ─────────────────────────────────────────────

  // Moon label
  annotations.push({
    x: moonAz, y: moonAlt,
    xref: xRef, yref: yRef,
    text: '<b>Moon</b>',
    showarrow: false,
    yshift: -22,
    font: { color: BODY.moon.color, size: 11 },
  });

  // Venus label
  annotations.push({
    x: venusAzPlot, y: venusAlt,
    xref: xRef, yref: yRef,
    text: '<b>Venus</b>',
    showarrow: false,
    yshift: 14,
    font: { color: BODY.venus.color, size: 11 },
  });

  // Angle label — fixed to top-left corner of the panel (axis-domain coords)
  const xDomRef = xRef + ' domain';
  annotations.push({
    x: 0.03, y: 1,
    xref: xDomRef, yref: yRef + ' domain',
    text: `${angleFromUp.toFixed(1)}° from up`,
    showarrow: false,
    xanchor: 'left',
    yanchor: 'top',
    yshift: -6,
    font: { color: 'rgba(255,255,255,0.85)', size: 11 },
    bgcolor: 'rgba(13,17,23,0.6)',
    borderpad: 4,
  });

  return { traces: [tMoon, tVenus], shapes, annotations };
}

// ── Too-far overlay annotation ────────────────────────────────
function tooFarAnnotation(side) {
  const px = side === 'left' ? 0.27 : 0.77;
  return {
    x: px, y: 0.5,
    xref: 'paper', yref: 'paper',
    text: 'Venus is too far from Moon<br>at this time',
    showarrow: false,
    font: { color: '#8b949e', size: 13 },
    bgcolor: 'rgba(22,27,34,0.7)',
    borderpad: 8,
    xanchor: 'center',
  };
}

// ── Draw the Plotly figure ────────────────────────────────────
function drawPlot(pA, pB) {
  const rA = panelTraces(pA, 0, 0.48);
  const rB = panelTraces(pB, 0.52, 1.0);

  const traces     = [...rA.traces, ...rB.traces];
  const shapes     = [...rA.shapes, ...rB.shapes];
  const annotations = [...rA.annotations, ...rB.annotations];


  // Too-far overlays
  if (pA.tooFar) annotations.push(tooFarAnnotation('left'));
  if (pB.tooFar) annotations.push(tooFarAnnotation('right'));

  // ── Layout ──────────────────────────────────────────────────
  const axisStyle = {
    showgrid: true,
    gridcolor: 'rgba(48,54,61,0.8)',
    zeroline: false,
    color: '#8b949e',
    tickfont: { size: 10, color: '#8b949e' },
    titlefont: { size: 11, color: '#8b949e' },
  };

  const layout = {
    paper_bgcolor: '#0d1117',
    plot_bgcolor:  '#0d1117',
    margin: { l: 50, r: 55, t: 75, b: 50 },
    font: { color: '#e6edf3', family: 'Segoe UI, system-ui, sans-serif' },
    shapes,
    annotations,

    // Panel A (left)
    xaxis: {
      ...axisStyle,
      domain: [0.02, 0.47],
      title: 'Azimuth (°)',
      range: pA.tooFar ? [180, 270] : [pA.xMin, pA.xMax],
    },
    yaxis: {
      ...axisStyle,
      title: 'Altitude (°)',
      range: pA.tooFar ? [-5, 30] : [pA.yMin, pA.yMax],
    },

    // Panel B (right)
    xaxis2: {
      ...axisStyle,
      domain: [0.53, 0.98],
      title: 'Azimuth (°)',
      range: pB.tooFar ? [180, 270] : [pB.xMin, pB.xMax],
    },
    yaxis2: {
      ...axisStyle,
      title: 'Altitude (°)',
      range: pB.tooFar ? [-5, 30] : [pB.yMin, pB.yMax],
      anchor: 'x2',
      side: 'right',
    },

    // Panel title annotations
    title: { text: '', font: { size: 14 } },
  };

  // Panel title annotations
  const titleA = {
    x: 0.245, y: 1.10,
    xref: 'paper', yref: 'paper',
    text: `<b>${locMap[state.locA].name}</b>`,
    showarrow: false,
    font: { size: 13, color: '#58a6ff' },
    xanchor: 'center',
  };
  const titleB = {
    x: 0.755, y: 1.10,
    xref: 'paper', yref: 'paper',
    text: `<b>${locMap[state.locB].name}</b>`,
    showarrow: false,
    font: { size: 13, color: '#58a6ff' },
    xanchor: 'center',
  };
  layout.annotations.push(titleA, titleB);

  // Horizon line shapes + labels
  // Use xref = '<axis> domain' so line/rect span the full axis width regardless of data range
  function addHorizon(xRef, yRef, panel) {
    if (panel.tooFar) return;
    const xDomRef = xRef + ' domain';   // e.g. 'x domain' or 'x2 domain'
    // Solid horizon line spanning full axis width
    layout.shapes.push({
      type: 'line', xref: xDomRef, yref: yRef,
      x0: 0, y0: 0, x1: 1, y1: 0,
      line: { color: 'rgba(100,160,200,0.85)', width: 2 },
      layer: 'above',
    });
    // Shaded "below horizon" region spanning full axis width
    layout.shapes.push({
      type: 'rect', xref: xDomRef, yref: yRef,
      x0: 0, y0: panel.yMin, x1: 1, y1: 0,
      fillcolor: 'rgba(30,50,70,0.35)',
      line: { width: 0 },
      layer: 'below',
    });
    // "Horizon" text label at right edge of the line
    layout.annotations.push({
      x: 1, y: 0,
      xref: xDomRef, yref: yRef,
      text: 'Horizon',
      showarrow: false,
      xanchor: 'right',
      yanchor: 'bottom',
      yshift: 3,
      font: { color: 'rgba(100,160,200,0.85)', size: 10 },
    });
  }

  addHorizon('x',  'y',  pA);
  addHorizon('x2', 'y2', pB);

  const config = {
    responsive: true,
    displayModeBar: false,
  };

  Plotly.react('plot', traces, layout, config);
}

// ── Time info panel ───────────────────────────────────────────
function updateTimeInfo() {
  const sA = locMap[state.locA].samples[state.timeIdx];
  const sB = locMap[state.locB].samples[state.timeIdx];

  const el = document.getElementById('timeInfo');
  el.innerHTML =
    `UTC: <b>${sA.utc}</b> &nbsp;|&nbsp; ` +
    `${locMap[state.locA].name}: <b>${sA.local_time}</b> &nbsp;|&nbsp; ` +
    `${locMap[state.locB].name}: <b>${sB.local_time}</b>`;
}

// ── Data cards ────────────────────────────────────────────────
function updateDataCards(pA, pB) {
  const container = document.getElementById('dataCards');
  container.innerHTML = [pA, pB].map(p => cardHTML(p)).join('');
}

function cardHTML(p) {
  const s = p.s;
  const r = p.r;
  const aboveClass = p.aboveBelow === 'above' ? 'above' : 'below';
  const sign = p.aboveBelow === 'above' ? '+' : '−';
  const angle = Math.abs(r.venus_angle_from_up).toFixed(1);

  return `
  <div class="card">
    <h3>${p.loc.name}</h3>
    <table>
      <tr><td>Local time</td>   <td>${s.local_time}</td></tr>
      <tr><td>Moon alt / az</td><td>${s.moon.alt.toFixed(2)}° / ${s.moon.az.toFixed(2)}°</td></tr>
      <tr><td>Venus alt / az</td><td>${s.venus.alt.toFixed(2)}° / ${s.venus.az.toFixed(2)}°</td></tr>
      <tr><td>Venus dy</td>     <td>${sign}${Math.abs(r.venus_dy).toFixed(3)}°</td></tr>
      <tr><td>Angle from up</td><td>${r.venus_angle_from_up.toFixed(1)}°</td></tr>
      <tr><td>Status</td>       <td class="${aboveClass}">Venus ${p.aboveBelow.toUpperCase()} Moon</td></tr>
      <tr><td>Moon illum</td>   <td class="illum">${(r.moon_illumination * 100).toFixed(0)}%</td></tr>
      <tr><td>Sun angle</td>    <td>${r.sun_angle_from_up.toFixed(1)}°</td></tr>
    </table>
  </div>`;
}

/**
 * @name Drift
 * @author Thawney
 * @hue 64
 * @sat 200
 * @param_label Voice Count
 * @description 2–3 voices float on a 2D random walk. A note fires when a voice drifts ≥2 columns.
 * @sound Rhodes / Electric Piano
 */

var MAX_V = 3;
var numVoices = 2;
var v = [];
var initialized = false;

function activate(m) {
  initialized = false;
  v = [];
  for (var i = 0; i < MAX_V; i++) {
    v[i] = {
      x: (i * (m.COLS / MAX_V)),
      y: ((i * 2) % m.ROWS),
      vx: 0.003 * (i % 2 === 0 ? 1.0 : -1.0),
      vy: 0.001 * (i % 2 === 0 ? 1.0 : -1.0),
      lastNoteCol: 0,
      prevCol: 0,
      prevRow: 0,
      held: false
    };
  }
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  var tempoScale = 500.0 / m.beatMs;  // 1.0 at 120bpm

  if (!initialized) {
    numVoices = (m.density < 128) ? 2 : 3;
    var speed   = (0.002 + (m.density / 255.0) * 0.01) * tempoScale;
    var spacing = (m.COLS - 1) / numVoices;

    for (var i = 0; i < numVoices; i++) {
      v[i].x           = spacing * i + spacing * 0.3;
      v[i].y           = (i * 2) % m.ROWS;
      v[i].vx          = speed * (m.rnd(255) < 128 ? 1.0 : -1.0);
      v[i].vy          = (speed * 0.4) * (m.rnd(255) < 128 ? 1.0 : -1.0);
      v[i].lastNoteCol = Math.floor(v[i].x);
      v[i].prevCol     = Math.floor(v[i].x);
      v[i].prevRow     = Math.floor(v[i].y);
    }
    initialized = true;
  }

  var maxNudge = (0.00008 + (m.density / 255.0) * 0.0003) * tempoScale;
  var maxSpeed = (0.004   + (m.density / 255.0) * 0.018 ) * tempoScale;

  // Clear display
  m.clear();

  for (var i = 0; i < numVoices; i++) {
    v[i].prevCol = Math.floor(v[i].x);
    v[i].prevRow = Math.floor(v[i].y);

    // Random nudge
    v[i].vx += ((m.rnd(255) - 128.0) / 128.0) * maxNudge;
    v[i].vy += ((m.rnd(255) - 128.0) / 128.0) * maxNudge * 0.5;

    // Clamp speed
    var spd = Math.sqrt(v[i].vx * v[i].vx + v[i].vy * v[i].vy);
    if (spd > maxSpeed && spd > 0.0) {
      var sc = maxSpeed / spd;
      v[i].vx *= sc;
      v[i].vy *= sc;
    }

    v[i].x += v[i].vx * m.dt;
    v[i].y += v[i].vy * m.dt;

    // Bounce edges
    if (v[i].x < 0)          { v[i].x = 0;          v[i].vx =  Math.abs(v[i].vx); }
    if (v[i].x > m.COLS - 1) { v[i].x = m.COLS - 1; v[i].vx = -Math.abs(v[i].vx); }
    if (v[i].y < 0)          { v[i].y = 0;          v[i].vy =  Math.abs(v[i].vy); }
    if (v[i].y > m.ROWS - 1) { v[i].y = m.ROWS - 1; v[i].vy = -Math.abs(v[i].vy); }

    var col  = Math.floor(v[i].x);
    var row  = Math.floor(v[i].y);
    var diff = col - v[i].lastNoteCol;
    if (diff < -1 || diff > 1) {
      var deg = Math.floor((col * 13) / (m.COLS - 1));
      m.note(deg, 50 + m.rnd(32), 30000);  // held until next crossing steals slot
      v[i].held        = true;
      v[i].lastNoteCol = col;
    }

    // Trail at 40% brightness
    var trailBr = Math.floor((m.brightness * 40) / 100);
    if (trailBr < 6) trailBr = 6;
    m.px(v[i].prevCol, v[i].prevRow, trailBr);

    // Current position at full brightness
    m.px(col, row, m.brightness);
  }

  m.show();
}

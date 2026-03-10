/**
 * @name Cascade
 * @author Thawney
 * @hue 200
 * @sat 220
 * @param_label Ripple Count
 * @description Ripples spawn at random columns and expand outward across all rows. Origin fires a note.
 * @sound Vibraphone / Glass
 */

var NOTE_DUR = 600;
var MAX_R = 3;

var r = [];
var maxRipples = 1;
var spawnElapsed  = 0;
var spawnInterval = 1000;
var initialized = false;

function spawnIntervalMs(density, beatMs) {
  // base = 1000 + (255-density)*20; tempo-scaled vs 120bpm
  var base = 1000 + (255 - density) * 20;
  var scaled = Math.floor(base * beatMs / 500);
  return scaled < 120 ? 120 : scaled;
}

function activate(m) {
  initialized = false;
  spawnElapsed = 0;
  r = [];
  for (var i = 0; i < MAX_R; i++) r[i] = { originCol: 0, radius: 0.0, active: false };
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
  for (var i = 0; i < MAX_R; i++) r[i].active = false;
}

function spawnRipple(m) {
  for (var i = 0; i < maxRipples; i++) {
    if (!r[i].active) {
      r[i].originCol = m.rnd(m.COLS);
      r[i].radius    = 0.0;
      r[i].active    = true;
      var deg  = Math.floor((r[i].originCol * 13) / (m.COLS - 1));
      var vel  = 65 + m.rnd(31);
      m.note(deg, vel, NOTE_DUR);
      break;
    }
  }
}

function update(m) {
  maxRipples = 1 + Math.floor((m.density * 2) / 255);
  if (maxRipples > MAX_R) maxRipples = MAX_R;

  var nextSpawnInterval = spawnIntervalMs(m.density, m.beatMs);

  if (!initialized) {
    spawnInterval = nextSpawnInterval;
    spawnElapsed  = spawnInterval;  // trigger first ripple immediately
    initialized   = true;
  } else if (spawnInterval !== nextSpawnInterval) {
    if (spawnInterval > 0)
      spawnElapsed = Math.floor((spawnElapsed * nextSpawnInterval) / spawnInterval);
    spawnInterval = nextSpawnInterval;
  }

  spawnElapsed += m.dt;
  while (spawnElapsed >= spawnInterval) {
    spawnElapsed -= spawnInterval;
    spawnRipple(m);
  }

  // Expand ripples at 0.012 grid-units/ms
  var maxRadius = m.COLS / 2.0;
  for (var i = 0; i < MAX_R; i++) {
    if (!r[i].active) continue;
    r[i].radius += 0.012 * m.dt;
    if (r[i].radius > maxRadius) r[i].active = false;
  }

  // Draw
  m.clear();
  for (var i = 0; i < MAX_R; i++) {
    if (!r[i].active) continue;

    var frac = 1.0 - (r[i].radius / maxRadius);
    if (frac < 0.0) frac = 0.0;
    var br = Math.floor(frac * m.brightness);
    if (br < 4) continue;

    var leftCol  = Math.floor(r[i].originCol - r[i].radius);
    var rightCol = Math.floor(r[i].originCol + r[i].radius);

    for (var row = 0; row < m.ROWS; row++) {
      if (leftCol  >= 0 && leftCol  < m.COLS) m.px(leftCol,  row, br);
      if (rightCol >= 0 && rightCol < m.COLS) m.px(rightCol, row, br);
    }

    // Origin at full brightness while small
    if (r[i].radius < 2.0) {
      for (var row = 0; row < m.ROWS; row++)
        m.px(r[i].originCol, row, m.brightness);
    }
  }

  m.show();
}

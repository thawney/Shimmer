/**
 * @name Haze
 * @author Thawney
 * @hue 160
 * @sat 155
 * @param_label Drift Rate
 * @description A soft haze pools at the low edge, breathing slowly in and out. Lean to draw it across the grid. A chord falls on every beat from wherever it has settled.
 * @sound Pad / Choir
 */

var smoothX   = 0.0;
var smoothZ   = 64.0;
var phase     = 0.0;
var centreCol = 0.0;

function safeDt(m) {
  var dt = m.dt;
  if (dt < 1) dt = 1;
  if (dt > 96) dt = 96;
  return dt;
}

function safeBeatMs(m) {
  var beatMs = m.beatMs;
  if (beatMs < 40) beatMs = 40;
  if (beatMs > 4000) beatMs = 4000;
  return beatMs;
}

function activate(m) {
  smoothX   = m.accelY;
  smoothZ   = m.accelZ;
  phase     = 0.0;
  centreCol = m.map(m.accelY, -80, 80, 0, m.COLS - 1);
  if (centreCol < 0)           centreCol = 0;
  if (centreCol > m.COLS - 1) centreCol = m.COLS - 1;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  var dt = safeDt(m);
  var beatMs = safeBeatMs(m);
  // density controls how quickly the haze follows the tilt
  var lag = 18000 - Math.floor((m.density * 12000) / 255);
  if (lag < 6000) lag = 6000;
  smoothX += (m.accelY - smoothX) * (dt / lag);

  // accelZ: flat = slow breath, tilted = faster
  smoothZ += (m.accelZ - smoothZ) * (dt / 5000.0);
  var tilt01 = 1.0 - smoothZ / 64.0;
  if (tilt01 < 0.0) tilt01 = 0.0;
  if (tilt01 > 1.0) tilt01 = 1.0;
  var period = Math.floor(5000 - tilt01 * 3200);
  if (period < 1800) period = 1800;

  phase += dt / period;
  if (phase >= 1.0) phase -= 1.0;

  centreCol = m.map(smoothX, -80, 80, 0, m.COLS - 1);
  if (centreCol < 0)           centreCol = 0;
  if (centreCol > m.COLS - 1) centreCol = m.COLS - 1;

  // Chord every beat from the settled column
  if (m.tick(0, beatMs)) {
    var centC = Math.floor(centreCol + 0.5);
    var root  = m.colToDegree(centC);
    var vel   = 50 + Math.floor((m.density * 40) / 255);
    var dur   = Math.floor(beatMs * 0.7);
    m.note(root,     vel,      dur);
    m.note(root + 2, vel - 8,  dur);
    m.note(root + 4, vel - 14, dur);
  }

  // Triangle wave breath: 0→1 (inhale) then 1→0 (exhale)
  var amp   = (phase < 0.5) ? phase * 2.0 : (1.0 - phase) * 2.0;
  var maxBr = Math.floor(amp * m.brightness);

  // Haze width: wider when flat, narrower when sharply tilted
  var absTilt01 = tilt01 < 0.5 ? tilt01 * 2.0 : 1.0;
  var sigma = Math.floor(2 + (1.0 - absTilt01) * 4 + (m.density / 64));
  if (sigma < 2)  sigma = 2;
  if (sigma > 10) sigma = 10;

  for (var c = 0; c < m.COLS; c++) {
    var dist = c - centreCol;
    if (dist < 0) dist = -dist;
    var br = maxBr - Math.floor(dist * maxBr / sigma);
    if (br < 0) br = 0;
    for (var r = 0; r < m.ROWS; r++) {
      if (br > 0) m.px(c, r, br);
      else        m.px(c, r, 0);
    }
  }

  m.show();
}

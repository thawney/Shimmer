/**
 * @name Scatter
 * @author Thawney
 * @hue 192
 * @sat 220
 * @param_label Notes Per Burst
 * @description Random note bursts scatter across the grid every beat. Density controls burst size.
 * @sound Harp / Pizzicato
 */

var MAX_NOTES = 8;
var DEGREE_MAX = 13;

var pix             = [];   // pix[row][col]
var elapsed         = 0;
var smoothPitch     = 0;    // slow-drift accelX → pitch centre (10s lag)
var lastMotionSc    = 0;

function activate(m) {
  pix = [];
  for (var r = 0; r < m.ROWS; r++) {
    pix[r] = [];
    for (var c = 0; c < m.COLS; c++) pix[r][c] = 0;
  }
  elapsed      = 0;
  smoothPitch  = 0;
  lastMotionSc = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function scatter(m) {
  var maxN = Math.floor((m.density * MAX_NOTES) / 255);
  if (maxN === 0) return;
  var n = 1 + m.rnd(maxN);

  // Pitch centre drifts slowly toward tilt over ~10s; spread stays wide for variety
  var degCenter = Math.floor(6 + smoothPitch * 6 / 127);
  if (degCenter < 0) degCenter = 0;
  if (degCenter > 13) degCenter = 13;
  var spread = 3 + Math.floor(m.density * 3 / 255);

  for (var i = 0; i < n; i++) {
    var degree = degCenter + (m.rnd(spread * 2 + 1) - spread);
    if (degree < 0) degree = 0;
    if (degree > DEGREE_MAX) degree = DEGREE_MAX;
    var vel    = 50 + (m.rnd(255) & 0x5F);
    m.note(degree, vel, Math.floor(m.beatMs * 3 / 4));

    var col  = m.rnd(m.COLS);
    var row  = m.rnd(m.ROWS);
    var peak = Math.floor((m.brightness * vel) / 127);
    pix[row][col] = peak;
  }
}

function update(m) {
  elapsed += m.dt;

  // Pitch centre drifts toward accelX tilt over ~10 seconds
  smoothPitch += (m.accelX - smoothPitch) * (m.dt / 10000.0);

  if (elapsed >= m.beatMs) {
    elapsed -= m.beatMs;
    scatter(m);
  }

  // Motion accent: knock triggers an immediate burst at high velocity
  if (m.motion > 160 && lastMotionSc <= 160) {
    var n = 3 + m.rnd(4);
    var dc = Math.floor(6 + smoothPitch * 6 / 127);
    if (dc < 0) dc = 0; if (dc > DEGREE_MAX) dc = DEGREE_MAX;
    for (var i = 0; i < n; i++) {
      var deg = dc + (m.rnd(7) - 3);
      if (deg < 0) deg = 0; if (deg > DEGREE_MAX) deg = DEGREE_MAX;
      m.note(deg, 90 + m.rnd(38), Math.floor(m.beatMs * 3 / 4));
      pix[m.rnd(m.ROWS)][m.rnd(m.COLS)] = m.brightness;
    }
  }
  lastMotionSc = m.motion;

  // fadePerFrame = 1 + (density>>5) = 1-8; density as proxy for speed
  var fadePerFrame = 1 + Math.floor(m.density >> 5);
  var fadeAmt = Math.floor((fadePerFrame * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;

  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      if (pix[r][c] > fadeAmt) pix[r][c] -= fadeAmt;
      else pix[r][c] = 0;

      if (pix[r][c] > 0)
        m.px(c, r, pix[r][c]);
      else
        m.px(c, r, 0);
    }
  }

  m.show();
}

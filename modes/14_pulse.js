/**
 * @name Pulse
 * @author Thawney
 * @hue 180
 * @sat 200
 * @param_label Fire Probability
 * @description Sparse stochastic pulses bloom as cross-shaped splashes. Very ambient and minimal.
 * @sound Pad / Ambient Texture
 */

var DEGREE_MIN = 0;
var DEGREE_MAX = 13;
var PULSE_CENTER = Math.floor(DEGREE_MAX / 2);

// Splash brightness fractions: centre, arm1(±1), arm2(±2 + diagonals)
var SPLASH_FRAC = [255, 150, 80];

var pix        = [];   // pix[row][col]
var elapsed    = 0;
var lastDegree = PULSE_CENTER;

function stamp(pix, c, r, br, rows, cols) {
  if (c < 0 || c >= cols || r < 0 || r >= rows) return;
  if (br > pix[r][c]) pix[r][c] = br;
}

function fireSplash(pix, col, peak, rows, cols) {
  var b0 = peak;
  var b1 = Math.floor((peak * SPLASH_FRAC[1]) >> 8);
  var b2 = Math.floor((peak * SPLASH_FRAC[2]) >> 8);
  var cr = Math.floor(rows / 2);  // centre row

  // Centre
  stamp(pix, col,     cr,     b0, rows, cols);
  // Cardinal arms ±1
  stamp(pix, col,     cr - 1, b1, rows, cols);
  stamp(pix, col,     cr + 1, b1, rows, cols);
  stamp(pix, col - 1, cr,     b1, rows, cols);
  stamp(pix, col + 1, cr,     b1, rows, cols);
  // Outer arms ±2
  stamp(pix, col,     cr - 2, b2, rows, cols);
  stamp(pix, col,     cr + 2, b2, rows, cols);
  stamp(pix, col - 2, cr,     b2, rows, cols);
  stamp(pix, col + 2, cr,     b2, rows, cols);
  // Diagonals
  stamp(pix, col - 1, cr - 1, b2, rows, cols);
  stamp(pix, col + 1, cr - 1, b2, rows, cols);
  stamp(pix, col - 1, cr + 1, b2, rows, cols);
  stamp(pix, col + 1, cr + 1, b2, rows, cols);
}

function activate(m) {
  pix = [];
  for (var r = 0; r < m.ROWS; r++) {
    pix[r] = [];
    for (var c = 0; c < m.COLS; c++) pix[r][c] = 0;
  }
  elapsed    = 0;
  lastDegree = PULSE_CENTER;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  elapsed += m.dt;

  if (elapsed >= m.beatMs) {
    elapsed -= m.beatMs;

    // Roll dice: density = probability of firing
    if (m.rnd(255) < m.density) {
      // Random walk toward centre
      var step = 0;
      var r8 = m.rnd(255);
      if      (r8 < 60)  step =  1;
      else if (r8 < 120) step = -1;
      else if (r8 < 140) step =  2;
      else if (r8 < 150) step = -2;

      // Gentle pull toward centre
      if (lastDegree > PULSE_CENTER && m.rnd(255) < 40) step -= 1;
      if (lastDegree < PULSE_CENTER && m.rnd(255) < 40) step += 1;

      lastDegree += step;
      if (lastDegree < DEGREE_MIN) lastDegree = DEGREE_MIN;
      if (lastDegree > DEGREE_MAX) lastDegree = DEGREE_MAX;

      var vel = 60 + m.rnd(64);
      m.note(lastDegree, vel, Math.floor(m.beatMs * 3 / 2));

      var col  = Math.floor((lastDegree * (m.COLS - 1)) / DEGREE_MAX);
      var peak = Math.floor((m.brightness * vel) / 127);
      fireSplash(pix, col, peak, m.ROWS, m.COLS);
    }
  }

  // fadePerFrame = 1 + density/64 (density as proxy for speed)
  var fadePerFrame = 1 + Math.floor(m.density / 64);
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

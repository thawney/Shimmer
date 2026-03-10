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

var pix     = [];   // pix[row][col]
var elapsed = 0;

function activate(m) {
  pix = [];
  for (var r = 0; r < m.ROWS; r++) {
    pix[r] = [];
    for (var c = 0; c < m.COLS; c++) pix[r][c] = 0;
  }
  elapsed = 0;
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

  for (var i = 0; i < n; i++) {
    var degree = m.rnd(DEGREE_MAX + 1);
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
  if (elapsed >= m.beatMs) {
    elapsed -= m.beatMs;
    scatter(m);
  }

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

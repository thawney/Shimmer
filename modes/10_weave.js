/**
 * @name Weave
 * @author Thawney
 * @hue 213
 * @sat 220
 * @param_label Active Rows
 * @description Polyrhythmic row pulses — 5 rows with prime-ratio beat clocks. Cursor sweeps each row.
 * @sound Bell / Celeste
 */

// Row beat divisors (prime ratios): row i fires every ROW_DIV[i] beats
var ROW_DIV = [2, 3, 5, 7, 11];
// Degree offset for each row's note cluster
var ROW_DEG = [0, 2, 4, 6, 8];

var rowElapsed   = [0, 0, 0, 0, 0];
var rowBright    = [0, 0, 0, 0, 0];
var firstUpdate  = true;

function activeRows(density) {
  return 1 + Math.floor((density * 5) / 255);
}

function activate(m) {
  for (var r = 0; r < m.ROWS; r++) {
    rowElapsed[r] = 0;
    rowBright[r]  = 0;
  }
  firstUpdate = true;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  var nRows = activeRows(m.density);

  // First update: immediately light all active rows so display isn't dark
  if (firstUpdate) {
    firstUpdate = false;
    for (var r = 0; r < nRows; r++) rowBright[r] = m.brightness;
  }

  for (var r = 0; r < m.ROWS; r++) {
    if (r >= nRows) { rowBright[r] = 0; continue; }

    var period = m.beatMs * ROW_DIV[r];
    rowElapsed[r] += m.dt;

    if (rowElapsed[r] >= period) {
      rowElapsed[r] -= period;

      var deg = ROW_DEG[r] + (m.rnd(255) & 1);  // ±0/1 random (matches C++)
      if (deg > 13) deg = 13;
      var vel = 60 + m.rnd(64);
      m.note(deg, vel, Math.floor(period * 3 / 4));

      rowBright[r] = m.brightness;
    }
  }

  // fadeAmt = (fadePerFrame * dt) / 16; fadePerFrame = 1 + (density>>6) = 1–4
  var fadePerFrame = 1 + Math.floor(m.density >> 6);
  var fadeAmt = Math.floor((fadePerFrame * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;

  for (var r = 0; r < m.ROWS; r++) {
    if (rowBright[r] > fadeAmt) rowBright[r] -= fadeAmt;
    else rowBright[r] = 0;

    // Row glow across all 28 columns
    for (var c = 0; c < m.COLS; c++) {
      if (rowBright[r] > 0)
        m.px(c, r, rowBright[r]);
      else
        m.px(c, r, 0);
    }

    // Phase cursor: bright dot sweeping left-to-right within period
    if (r < nRows) {
      var period2   = m.beatMs * ROW_DIV[r];
      var cursorCol = Math.floor((rowElapsed[r] * (m.COLS - 1)) / period2);
      m.px(cursorCol, r, m.brightness);
    }
  }

  m.show();
}

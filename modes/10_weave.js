/**
 * @name Weave
 * @author Thawney
 * @hue 213
 * @sat 220
 * @param_label Active Rows
 * @description Polyrhythmic row pulses — 12 rows with prime-ratio beat clocks. Cursor sweeps each row.
 * @sound Bell / Celeste
 */

// Row beat divisors (prime ratios) and degree offsets — set in activate()
var ROW_DIV = [];
var ROW_DEG = [];

var rowElapsed   = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var rowBright    = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var firstUpdate  = true;

function activeRows(density) {
  return 1 + Math.floor((density * 12) / 255);
}

function activate(m) {
  var PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
  ROW_DIV = [];
  ROW_DEG = [];
  for (var r = 0; r < m.ROWS; r++) {
    ROW_DIV[r]    = PRIMES[r % PRIMES.length];
    ROW_DEG[r]    = r;  // unique degree per row — avoids cross-row note cancellation
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

    // Row glow across all 12 columns
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

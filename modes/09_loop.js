/**
 * @name Loop
 * @author Thawney
 * @hue 20
 * @sat 210
 * @param_label Loop Length
 * @description A melodic phrase loops and slowly drifts. Density controls length (4–16 steps).
 * @sound Arp / Sequencer
 */

var MAX_LEN = 16;
var DEGREE_MAX = 13;

var seq          = [];
var len          = 8;
var step         = 0;
var elapsed      = 0;
var driftElapsed = 0;
var initialized  = false;
var colBright    = [];

function loopLen(density) {
  return 4 + Math.floor((density * 12) / 255);
}

function driftIntervalMs(density) {
  // C++ uses speed; density as proxy: dense=longer loop=slower drift
  return 2000 + (255 - density) * 60;
}

function activate(m) {
  initialized = false;
  step         = 0;
  elapsed      = 0;
  driftElapsed = 0;
  len          = 8;
  colBright    = [];
  for (var c = 0; c < m.COLS; c++) colBright[c] = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  if (!initialized) {
    len = loopLen(m.density);
    step = 0;
    // Generate melodic walk sequence
    seq = [];
    var pos = 6;
    for (var i = 0; i < len; i++) {
      seq[i] = pos;
      var delta = (m.rnd(3) - 1);  // -1, 0, +1
      pos += delta;
      if (pos < 0) pos = 0;
      if (pos > DEGREE_MAX) pos = DEGREE_MAX;
    }
    initialized = true;
  }

  elapsed      += m.dt;
  driftElapsed += m.dt;

  var newLen = loopLen(m.density);
  if (newLen !== len) {
    len  = newLen;
    step = step % len;
  }

  // Step on beat
  if (elapsed >= m.beatMs) {
    elapsed -= m.beatMs;

    var degree = seq[step];
    var vel    = 65 + m.rnd(64);
    m.note(degree, vel, Math.floor(m.beatMs * 7 / 8));

    // Flash step column: step maps to left (len/MAX_LEN) fraction of grid
    var stepCol = Math.floor((step * m.COLS) / MAX_LEN);
    if (stepCol < m.COLS) {
      colBright[stepCol] = Math.floor((m.brightness * vel) / 127);
    }

    step = (step + 1) % len;
  }

  // Drift: shift random note ±1 degree
  var driftInterval = driftIntervalMs(m.density);
  if (driftElapsed >= driftInterval) {
    driftElapsed = 0;
    var idx = m.rnd(len);
    var d   = (m.rnd(255) < 128) ? 1 : -1;
    seq[idx] += d;
    if (seq[idx] < 0)          seq[idx] = 0;
    if (seq[idx] > DEGREE_MAX) seq[idx] = DEGREE_MAX;
  }

  // Display: loop occupies left (len/MAX_LEN) cols
  var loopWidth = Math.floor((len * m.COLS) / MAX_LEN);
  var cursorCol = Math.floor((step * m.COLS) / MAX_LEN);

  var fadeAmt = Math.floor((2 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;

  for (var col = 0; col < m.COLS; col++) {
    if (colBright[col] > fadeAmt) colBright[col] -= fadeAmt;
    else colBright[col] = 0;

    var inLoop   = (col < loopWidth);
    var isCursor = inLoop && (col === cursorCol);

    var br = 0;
    if (colBright[col] > 0) br = colBright[col];
    else if (isCursor)      br = Math.floor(m.brightness / 4);
    else if (inLoop)        br = Math.floor(m.brightness / 14);

    for (var row = 0; row < m.ROWS; row++) {
      if (br > 0) m.px(col, row, br);
      else        m.px(col, row, 0);
    }
  }

  m.show();
}

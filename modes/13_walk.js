/**
 * @name Walk
 * @author Thawney
 * @hue 240
 * @sat 220
 * @param_label Step Range
 * @description Random melodic walk. Density controls leap size. Full column glows; dim cursor dot between steps.
 * @sound Flute / Solo Wind
 */

var DEGREE_MIN = 0;
var DEGREE_MAX = 13;
var CURSOR_BRIGHT = 18;
var CURSOR_HUE   = 0;
var CURSOR_SAT   = 60;  // near-white

var degree   = 6;
var elapsed  = 0;
var colBright = [];

function activate(m) {
  degree   = 6;
  elapsed  = 0;
  colBright = [];
  for (var c = 0; c < m.COLS; c++) colBright[c] = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function degreeToCol(deg, cols) {
  return Math.floor((deg * (cols - 1)) / DEGREE_MAX);
}

function update(m) {
  elapsed += m.dt;

  if (elapsed >= m.beatMs) {
    elapsed -= m.beatMs;

    // maxStep: density=0 -> 1, density=255 -> 9 (matches C++ without motion seed)
    var maxStep = 1 + Math.floor(m.density >> 5);
    if (maxStep < 1) maxStep = 1;

    var step = 1 + m.rnd(maxStep);
    if (m.rnd(255) < 128) step = -step;

    degree += step;
    // Bounce at boundaries
    if (degree < DEGREE_MIN) degree = DEGREE_MIN + (DEGREE_MIN - degree);
    if (degree > DEGREE_MAX) degree = DEGREE_MAX - (degree - DEGREE_MAX);
    if (degree < DEGREE_MIN) degree = DEGREE_MIN;
    if (degree > DEGREE_MAX) degree = DEGREE_MAX;

    var vel = 55 + m.rnd(64) + 8;
    if (vel > 127) vel = 127;
    m.note(degree, vel, Math.floor(m.beatMs * 7 / 8));

    var col  = degreeToCol(degree, m.COLS);
    var peak = Math.floor((m.brightness * vel) / 127);
    colBright[col] = peak;
  }

  // fadePerFrame = 1 + density/64 (density as proxy for speed)
  var fadePerFrame = 1 + Math.floor(m.density / 64);
  var fadeAmt = Math.floor((fadePerFrame * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;

  var cursorCol = degreeToCol(degree, m.COLS);

  for (var c = 0; c < m.COLS; c++) {
    if (colBright[c] > fadeAmt) colBright[c] -= fadeAmt;
    else colBright[c] = 0;

    for (var r = 0; r < m.ROWS; r++) {
      if (colBright[c] > 0) {
        m.px(c, r, colBright[c]);
      } else if (c === cursorCol && r === Math.floor(m.ROWS / 2)) {
        // Dim near-white cursor dot on center row
        m.px(c, r, CURSOR_BRIGHT);
      } else {
        m.px(c, r, 0);
      }
    }
  }

  m.show();
}

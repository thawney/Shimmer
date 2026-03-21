/**
 * @name Sway
 * @author Thawney
 * @hue 24
 * @sat 200
 * @param_label Tempo
 * @description A column of light follows the low side of your tilt, settling
 *              like a compass needle. On each beat it plucks a note from wherever
 *              it has come to rest. Rock it gently for a slow arpeggio.
 * @sound Bell / Kalimba
 */

var smoothX    = 0.0;
var smoothY    = 0.0;
var colBright  = [];
var flashBr    = 0;

function activate(m) {
  smoothX   = m.accelY;
  smoothY   = m.accelX;
  flashBr   = 0;
  colBright = [];
  for (var c = 0; c < m.COLS; c++) colBright[c] = 0;
  m.clear();
  m.show();
}

function update(m) {
  // ~2s lag — column settles smoothly, no jitter
  smoothX += (m.accelY - smoothX) * (m.dt / 2000.0);
  // ~4s lag — row bias (secondary, subtle vertical gradient)
  smoothY += (m.accelX - smoothY) * (m.dt / 4000.0);

  // Current resting column
  var col = Math.floor(m.map(smoothX, -80, 80, 0, m.COLS - 1));
  if (col < 0)         col = 0;
  if (col > m.COLS - 1) col = m.COLS - 1;

  // On each beat: pluck a note from the current column
  if (m.tick(0, m.beatMs)) {
    var deg = m.colToDegree(col);
    var vel = 55 + Math.floor((m.density * 50) / 255);
    m.note(deg, vel, Math.floor(m.beatMs * 0.8));
    // Flash the column
    colBright[col] = m.brightness;
    flashBr = Math.floor(m.brightness * 0.3);
  }

  // Decay column brightness
  var fadeAmt = Math.floor((3 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;
  for (var c = 0; c < m.COLS; c++) {
    if (colBright[c] > fadeAmt) colBright[c] -= fadeAmt;
    else colBright[c] = 0;
  }
  if (flashBr > fadeAmt) flashBr -= fadeAmt;
  else flashBr = 0;

  // Row bias: smoothY negative (tilt top up) → bright at row 0; positive → row ROWS-1
  // Negate smoothY so "tilt up" brightens the top of the display
  var rowBias = -smoothY;

  for (var c = 0; c < m.COLS; c++) {
    var baseBr = colBright[c];
    if (c === col) {
      // Active column always at least at ghost brightness
      var live = Math.floor(m.brightness * 0.35) + flashBr;
      if (live > baseBr) baseBr = live;
    } else if (c === col - 1 || c === col + 1) {
      var adj = Math.floor(m.brightness * 0.12);
      if (adj > baseBr) baseBr = adj;
    }

    for (var r = 0; r < m.ROWS; r++) {
      if (baseBr === 0) { m.px(c, r, 0); continue; }
      // Subtle row gradient from tilt Y
      var rowFrac = (m.ROWS > 1) ? r / (m.ROWS - 1) : 0.5;
      var rowScale = 0.7 + 0.3 * (rowBias >= 0
        ? (1.0 - rowFrac)
        : rowFrac);
      var br = Math.floor(baseBr * rowScale);
      if (br < 0) br = 0;
      m.px(c, r, br);
    }
  }

  m.show();
}

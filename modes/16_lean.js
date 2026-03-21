/**
 * @name Lean
 * @author Thawney
 * @hue 28
 * @sat 200
 * @param_label Tempo
 * @description A column of light rests wherever you lean — like a needle finding
 *              its balance point. Each beat it rings a note from where it has settled.
 * @sound Bell / Marimba
 */

var smoothX   = 0.0;
var colBright = [];
var flashBr   = 0;

function activate(m) {
  smoothX   = m.accelY;
  colBright = [];
  for (var c = 0; c < m.COLS; c++) colBright[c] = 0;
  flashBr   = 0;
  m.clear();
  m.show();
}

function update(m) {
  smoothX += (m.accelY - smoothX) * (m.dt / 2000.0);

  var col = Math.floor(m.map(smoothX, -80, 80, 0, m.COLS - 1));
  if (col < 0)           col = 0;
  if (col > m.COLS - 1) col = m.COLS - 1;

  if (m.tick(0, m.beatMs)) {
    var deg = m.colToDegree(col);
    var vel = 55 + Math.floor((m.density * 50) / 255);
    m.note(deg, vel, Math.floor(m.beatMs * 0.8));
    colBright[col] = m.brightness;
    flashBr = Math.floor(m.brightness * 0.4);
  }

  var fadeAmt = Math.floor((3 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;
  for (var c = 0; c < m.COLS; c++) {
    if (colBright[c] > fadeAmt) colBright[c] -= fadeAmt;
    else colBright[c] = 0;
  }
  if (flashBr > fadeAmt) flashBr -= fadeAmt;
  else flashBr = 0;

  for (var c = 0; c < m.COLS; c++) {
    var br = colBright[c];
    if (c === col) {
      var live = Math.floor(m.brightness * 0.35) + flashBr;
      if (live > br) br = live;
    } else if (c === col - 1 || c === col + 1) {
      var adj = Math.floor(m.brightness * 0.1);
      if (adj > br) br = adj;
    }
    for (var r = 0; r < m.ROWS; r++) {
      if (br > 0) m.px(c, r, br);
      else        m.px(c, r, 0);
    }
  }

  m.show();
}

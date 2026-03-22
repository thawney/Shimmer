/**
 * @name Lean
 * @author Thawney
 * @hue 28
 * @sat 200
 * @param_label Tempo
 * @description A point of light rests at the low corner of your tilt — left/right sets the note, up/down sets the velocity. Each beat it rings once from wherever it has settled.
 * @sound Bell / Marimba
 */

var smoothX = 0.0;
var smoothY = 0.0;
var pix     = [];
var flashBr = 0;

function activate(m) {
  smoothX =  m.accelY;
  smoothY = -m.accelX;
  pix     = [];
  for (var r = 0; r < m.ROWS; r++) {
    pix[r] = [];
    for (var c = 0; c < m.COLS; c++) pix[r][c] = 0;
  }
  flashBr = 0;
  m.clear();
  m.show();
}

function update(m) {
  // Steeper tilt = faster response
  var tiltX = m.accelY < 0 ? -m.accelY : m.accelY;
  var tiltY = m.accelX < 0 ? -m.accelX : m.accelX;
  var lagX = 600 - Math.floor(tiltX * 5);
  var lagY = 600 - Math.floor(tiltY * 5);
  if (lagX < 100) lagX = 100;
  if (lagY < 100) lagY = 100;
  smoothX += (m.accelY  - smoothX) * (m.dt / lagX);
  smoothY += (-m.accelX - smoothY) * (m.dt / lagY);

  var col = Math.floor(m.map(smoothX, -80, 80, 0, m.COLS - 1));
  if (col < 0)           col = 0;
  if (col > m.COLS - 1) col = m.COLS - 1;

  var row = Math.floor(m.map(smoothY, -80, 80, 0, m.ROWS - 1));
  if (row < 0)           row = 0;
  if (row > m.ROWS - 1) row = m.ROWS - 1;

  if (m.tick(0, m.beatMs)) {
    var deg = m.colToDegree(col);
    // Row position shades velocity: top (row 0) = soft, bottom = loud
    var rowFrac = (m.ROWS > 1) ? row / (m.ROWS - 1) : 0.5;
    var vel = 40 + Math.floor(rowFrac * 50) + Math.floor((m.density * 20) / 255);
    if (vel > 120) vel = 120;
    m.note(deg, vel, Math.floor(m.beatMs * 0.8));
    pix[row][col] = m.brightness;
    flashBr = Math.floor(m.brightness * 0.4);
  }

  var fadeAmt = Math.floor((3 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;
  if (flashBr > fadeAmt) flashBr -= fadeAmt;
  else flashBr = 0;

  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      if (pix[r][c] > fadeAmt) pix[r][c] -= fadeAmt;
      else pix[r][c] = 0;
    }
  }

  for (var r = 0; r < m.ROWS; r++) {
    for (var c = 0; c < m.COLS; c++) {
      var br = pix[r][c];
      if (r === row && c === col) {
        var live = Math.floor(m.brightness * 0.4) + flashBr;
        if (live > br) br = live;
      } else if ((r === row || c === col) &&
                 (r >= row - 1 && r <= row + 1) &&
                 (c >= col - 1 && c <= col + 1)) {
        // immediate neighbours only
        var adj = Math.floor(m.brightness * 0.12);
        if (adj > br) br = adj;
      }
      if (br > 0) m.px(c, r, br);
      else        m.px(c, r, 0);
    }
  }

  m.show();
}

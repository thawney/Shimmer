/**
 * @name Settle
 * @author Thawney
 * @hue 48
 * @sat 210
 * @param_label Lag
 * @description A glowing weight drifts slowly toward the low side of your tilt.
 *              It only rings when it finds stillness — silence while moving, one
 *              clear strike when it comes to rest. Density controls how quickly it follows.
 * @sound Marimba / Pluck
 */

var smoothX    = 0.0;
var prevCol    = -1;
var heldMs     = 0;
var colBright  = [];
var strikeBr   = 0;

function activate(m) {
  smoothX    = m.accelY;
  prevCol    = -1;
  heldMs     = 0;
  strikeBr   = 0;
  colBright  = [];
  for (var c = 0; c < m.COLS; c++) colBright[c] = 0;
  m.clear();
  m.show();
}

function update(m) {
  // Lag controlled by density: 0 -> 8s, 255 -> 1.5s
  var lag = 8000 - Math.floor((m.density * 6500) / 255);
  if (lag < 1500) lag = 1500;
  smoothX += (m.accelY - smoothX) * (m.dt / lag);

  var col = Math.floor(m.map(smoothX, -80, 80, 0, m.COLS - 1));
  if (col < 0)           col = 0;
  if (col > m.COLS - 1) col = m.COLS - 1;

  var fired = false;

  if (col === prevCol) {
    heldMs += m.dt;
    // Ring once after holding the same column for two beats
    if (heldMs >= m.beatMs * 2) {
      heldMs = 0;
      var deg = m.colToDegree(col);
      var vel = 60 + Math.floor((m.density * 40) / 255);
      m.note(deg, vel, Math.floor(m.beatMs / 2));
      strikeBr = m.brightness;
      colBright[col] = m.brightness;
      fired = true;
    }
  } else {
    heldMs  = 0;
    prevCol = col;
  }

  // Fade column trails
  var fadeAmt = Math.floor((4 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;
  for (var c = 0; c < m.COLS; c++) {
    if (colBright[c] > fadeAmt) colBright[c] -= fadeAmt;
    else colBright[c] = 0;
  }
  if (strikeBr > fadeAmt) strikeBr -= fadeAmt;
  else strikeBr = 0;

  // Draw: dim trail in previously visited columns, bright dot at current
  for (var c = 0; c < m.COLS; c++) {
    var br = colBright[c];
    if (c === col) {
      // Waiting to settle: steady dim glow; just struck: flash
      var live = (heldMs > m.beatMs) ? Math.floor(m.brightness * 0.55) : Math.floor(m.brightness * 0.25);
      if (strikeBr > live) live = strikeBr;
      if (live > br) br = live;
    }
    for (var r = 0; r < m.ROWS; r++) {
      if (br > 0) m.px(c, r, br);
      else        m.px(c, r, 0);
    }
  }

  m.show();
}

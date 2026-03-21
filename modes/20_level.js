/**
 * @name Level
 * @author Thawney
 * @hue 145
 * @sat 200
 * @param_label Fill Level
 * @description A liquid level: tilt left/right to pour water between columns.
 *              Density controls how full. Shake for a splash. Fires held notes
 *              from tilt angle every two beats. Beautiful when gently rocked.
 * @sound Pad / Drone
 */

// accelX positive = tilt right = right columns fill more (water pools to lower side) ✓

var smoothX     = 0.0;
var phase       = 0.0;
var splashBr    = [];
var lastMotionLv = 0;

function activate(m) {
  smoothX      = m.accelX;
  phase        = 0.0;
  lastMotionLv = 0;
  splashBr = [];
  for (var c = 0; c < m.COLS; c++) splashBr[c] = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  // ~1s lag — water responds quickly but not instantly
  smoothX += (m.accelX - smoothX) * (m.dt / 1000.0);

  // Advance ripple phase
  phase += m.dt * 0.0025;

  // Fill height: density 0 → 2 rows, 255 → 9 rows
  var meanFill = 2 + Math.floor((m.density * 7) / 255);

  // Slope: tilt right (positive accelX) → right columns fill more
  // At max tilt (accelX=127): ±4 rows from centre col to edge
  var slope = (smoothX / 127.0) * 4.0;
  var mid   = (m.COLS - 1) * 0.5;  // 5.5

  // Splash on knock
  if (m.motion > 160 && lastMotionLv <= 160) {
    for (var c = 0; c < m.COLS; c++) splashBr[c] = m.brightness;
    var deg = Math.floor(6 + smoothX * 6 / 127);
    if (deg < 0) deg = 0;
    if (deg > 13) deg = 13;
    m.note(deg, 90 + m.rnd(24), Math.floor(m.beatMs * 2));
  }
  lastMotionLv = m.motion;

  // Decay splash
  var splashDecay = Math.floor((10 * m.dt + 8) / 16);
  if (splashDecay < 1) splashDecay = 1;

  // Beat-synced ambient note from tilt every two beats
  if (m.tick(0, m.beatMs * 2)) {
    var deg = Math.floor(6 + smoothX * 6 / 127);
    if (deg < 0) deg = 0;
    if (deg > 13) deg = 13;
    m.note(deg, 48 + Math.floor(m.density / 6), Math.floor(m.beatMs * 3));
  }

  // Draw
  for (var c = 0; c < m.COLS; c++) {
    if (splashBr[c] > splashDecay) splashBr[c] -= splashDecay;
    else splashBr[c] = 0;

    // Fill height at this column with gentle surface ripple
    var ripple   = Math.sin(phase + c * 0.8) * 0.35;
    var fillHere = meanFill + slope * (c - mid) / 5.5 + ripple;
    if (fillHere < 0)      fillHere = 0;
    if (fillHere > m.ROWS) fillHere = m.ROWS;

    // surfRow: row index of water surface (0 = top)
    var surfRow = Math.floor(m.ROWS - fillHere);

    for (var r = 0; r < m.ROWS; r++) {
      var br = 0;
      if (r === surfRow && fillHere >= 0.5) {
        // Surface pixel — full brightness
        br = m.brightness;
      } else if (r > surfRow) {
        // Submerged — dims toward bottom
        var depth     = r - surfRow;
        var depthFrac = depth / (m.ROWS - surfRow);
        br = Math.floor(m.brightness * (0.50 - depthFrac * 0.25));
        if (br < 8) br = 8;
      }
      if (splashBr[c] > br) br = splashBr[c];
      if (br > 0) m.px(c, r, br);
      else        m.px(c, r, 0);
    }
  }

  m.show();
}

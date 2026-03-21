/**
 * @name Hush
 * @author Thawney
 * @hue 200
 * @sat 140
 * @param_label Recovery
 * @description Stillness is rewarded. Hold the device steady and the light
 *              fills slowly from below, the harmony deepens. Disturb it and
 *              everything dims to quiet.
 * @sound Ambient / Drone
 */

var fill      = 0.0;   // 0..255 accumulator — rises when still, falls with motion
var hue       = 0;
var smoothHX  = 0.0;
var smoothHY  = 0.0;
var prevTier  = 0;     // how many harmonic voices were active last frame
var flashBr   = 0;

function activate(m) {
  fill      = 0.0;
  hue       = m.hue !== undefined ? m.hue : 200;
  smoothHX  = m.accelX;
  smoothHY  = m.accelY;
  prevTier  = 0;
  flashBr   = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  // Very slow hue drift from tilt — 20s lag, barely perceptible
  smoothHX += (m.accelX - smoothHX) * (m.dt / 20000.0);
  smoothHY += (m.accelY - smoothHY) * (m.dt / 20000.0);

  // Hue: base + small shift from slow tilt
  var h = (Math.floor(smoothHX * 30 / 80) + Math.floor(smoothHY * 15 / 80) + 200 + 512) & 255;

  // density controls recovery speed (how fast fill rises when still)
  var riseK  = 0.00008 + (m.density * 0.00016) / 255.0;
  var fallK  = 0.00025;

  if (m.motion < 30) {
    fill += (30 - m.motion) * m.dt * riseK;
  } else {
    fill -= m.motion * m.dt * fallK;
    // Sudden jolt: flash bright then go dark
    if (m.motion > 150) {
      flashBr = Math.floor(m.brightness * 0.8);
    }
  }
  if (fill < 0)   fill = 0;
  if (fill > 255) fill = 255;

  // Decay flash
  var flashDecay = Math.floor((12 * m.dt + 8) / 16);
  if (flashDecay < 1) flashDecay = 1;
  if (flashBr > flashDecay) flashBr -= flashDecay;
  else flashBr = 0;

  // Harmonic tier: 0=silent, 1=root, 2=+third, 3=+fifth
  var tier = 0;
  if (fill >= 192) tier = 3;
  else if (fill >= 128) tier = 2;
  else if (fill >= 64)  tier = 1;

  // Root note drifts with slow X tilt — maps across 7 degrees
  var rootDeg = Math.floor(m.map(smoothHX, -80, 80, 0, 6));
  if (rootDeg < 0) rootDeg = 0;
  if (rootDeg > 6) rootDeg = 6;

  // On tier change: note events
  if (m.tick(0, m.beatMs * 4)) {
    if (tier >= 1) m.note(rootDeg,           50 + Math.floor(fill / 5),  Math.floor(m.beatMs * 5));
    if (tier >= 2) m.note(rootDeg + 2,       45 + Math.floor(fill / 6),  Math.floor(m.beatMs * 5));
    if (tier >= 3) m.note(rootDeg + 4,       42 + Math.floor(fill / 7),  Math.floor(m.beatMs * 5));
  }

  // Display: all columns fill from bottom to the same height (stillness meter)
  var filledRows = Math.floor((fill * m.ROWS) / 255);
  if (filledRows > m.ROWS) filledRows = m.ROWS;

  for (var c = 0; c < m.COLS; c++) {
    for (var r = 0; r < m.ROWS; r++) {
      // Row 0 = top, row ROWS-1 = bottom. Fill from bottom upward.
      var filled = r >= (m.ROWS - filledRows);
      var br = 0;
      if (filled) {
        // Depth: bottom row = full, top of fill = dimmer
        var depth = r - (m.ROWS - filledRows);
        var depthFrac = (filledRows > 1) ? depth / (filledRows - 1) : 1.0;
        br = Math.floor(m.brightness * (0.35 + depthFrac * 0.65));
      }
      if (flashBr > br) br = flashBr;
      if (br > 0) m.px(c, r, h, 140, br);
      else        m.px(c, r, 0);
    }
  }

  m.show();
}

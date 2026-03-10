/**
 * @name Shift
 * @author Thawney
 * @hue 100
 * @sat 200
 * @param_label Lock Amount
 * @description 28-bit shift register. MSB fires a note; density controls lock (high=stable, low=chaotic).
 * @sound Lead Synth / Pulse Wave
 */

var REG_MASK = 0x0FFFFFFF;  // 28 bits

var reg = 0;
var elapsed = 0;

function popcount28(v) {
  v = v & REG_MASK;
  var c = 0;
  while (v) { c += v & 1; v = (v >>> 1); }
  return c;
}

function activate(m) {
  // Random initial register (matches C++ which randomizes on activate)
  reg = ((m.rnd(255) | (m.rnd(255) << 8) | (m.rnd(255) << 16) | (m.rnd(255) << 24)) >>> 0) & REG_MASK;
  if (reg === 0) reg = 0x0A5A5A5A & REG_MASK;
  elapsed = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  // stepMs = beatMs (fixed subdivide=1; C++ uses speed>>6 but no speed in JS)
  var stepMs = m.beatMs;

  elapsed += m.dt;
  while (elapsed >= stepMs) {
    elapsed -= stepMs;

    // Use scale length ~7 (diatonic default)
    var sl = 7;

    // MSB (bit 27) fires note if set
    var fired = (reg >>> (m.COLS - 1)) & 1;
    if (fired) {
      var degree = popcount28(reg) % sl;
      var vel = 60 + m.rnd(64);
      m.note(degree, vel, Math.floor(stepMs * 3 / 4));
    }

    // New bit = fired; flip if rnd > density (density=lock: high=stable, low=chaotic)
    var new_bit = fired;
    if (m.rnd(255) > m.density) new_bit ^= 1;

    reg = (((reg << 1) | new_bit) >>> 0) & REG_MASK;
  }

  // Render: lit bits bright, unlit bits black
  for (var col = 0; col < m.COLS; col++) {
    var bit = (reg >>> col) & 1;
    for (var row = 0; row < m.ROWS; row++) {
      if (bit) m.px(col, row, m.brightness);
      else     m.px(col, row, 0);
    }
  }

  m.show();
}

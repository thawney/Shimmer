/**
 * @name Breath
 * @author Thawney
 * @hue 10
 * @sat 140
 * @param_label Harmonic Colour
 * @description Sustained drone voices swell slowly. Density selects chord voicing: minor/major/fifth/sus.
 * @sound Pad / String
 */

// Three voices, staggered phases — rows spread across full grid height
var VOICE_ROW = [];
var MAX_V = 3;

var voiceDeg = [0, 3, 7];  // minor default
var phase    = [0, 85, 170];
var phaseAcc = [0.0, 85.0*256.0, 170.0*256.0];  // 16.16 style as floats
var heldNote = [false, false, false];
var colourSet = false;

function activate(m) {
  VOICE_ROW = [0, Math.floor((m.ROWS - 1) / 2), m.ROWS - 1];
  colourSet = false;
  for (var v = 0; v < MAX_V; v++) {
    phase[v]    = Math.floor(v * 85);
    phaseAcc[v] = phase[v] * 256.0;
    heldNote[v] = false;
  }
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  if (!colourSet) {
    if      (m.density < 64)  { voiceDeg = [0, 3, 7];  }   // minor
    else if (m.density < 128) { voiceDeg = [0, 4, 7];  }   // major
    else if (m.density < 192) { voiceDeg = [0, 7, 12]; }   // open fifth
    else                      { voiceDeg = [0, 5, 10]; }   // suspended
    colourSet = true;
  }

  // numVoices from density
  var nv = (m.density < 64) ? 1 : (m.density < 128) ? 2 : 3;

  // period: 1000 + (255-density)*27, tempo-scaled: slower BPM → longer period
  var basePeriod = 1000 + (255 - m.density) * 27;

  // Clear display
  m.clear();

  for (var v = 0; v < MAX_V; v++) {
    if (v >= nv) continue;

    var period = Math.floor(basePeriod * m.beatMs / 500.0);
    period = period + Math.floor(v * period / 6);  // stagger each voice

    // Accumulate phase (float as 16.16 equivalent)
    phaseAcc[v] += (m.dt * 65536.0) / period;
    var prevPhase = phase[v];
    phase[v] = Math.floor(phaseAcc[v] / 256.0) & 0xFF;

    // Peak crossing: phase decreased (rollover)
    var peaked = (phase[v] < prevPhase);

    // Fire on first frame (!heldNote) OR on peak rollover — matches C++ (!_held || peakCrossed)
    if (peaked || !heldNote[v]) {
      // ~10% harmonic drift on each peak (not on initial fire)
      if (peaked && m.rnd(255) < 26) {
        var d = voiceDeg[v] + (m.rnd(255) < 128 ? 1 : -1);
        if (d >= 0 && d <= 12) voiceDeg[v] = d;
      }
      // Occasional +1 variation
      var deg = voiceDeg[v] + (m.rnd(255) < 40 ? 1 : 0);
      if (deg > 13) deg = 13;
      m.note(deg, 60 + m.rnd(32), 30000);  // long hold; new note steals slot on next peak
      heldNote[v] = true;
    }

    // Amplitude: triangle wave 0->255->0
    var amp = (phase[v] < 128) ? phase[v] * 2 : (255 - phase[v]) * 2;
    var col = Math.floor((amp * (m.COLS - 1)) / 255);
    var br  = Math.floor((amp * m.brightness) / 255);
    if (br < 8) br = 8;

    m.px(col, VOICE_ROW[v], br);
  }

  m.show();
}

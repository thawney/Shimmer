/**
 * @name Resonator
 * @author Thawney
 * @hue 270
 * @sat 200
 * @param_label Decay
 * @midi_in true
 * @description MIDI notes excite horizontal resonating strings with sympathetic harmonics. Without MIDI a slow wave idles across the strings. Density controls decay time.
 * @sound String / Pad
 */

var RES_N      = 12;
var rEnergy    = [];
var rIdlePhase = 0.0;
var rIdleBeat  = 0;

function activate(m) {
  rEnergy = [];
  for (var i = 0; i < RES_N; i++) rEnergy[i] = 0;
  rIdlePhase = 0.0;
  rIdleBeat  = 0;
  m.clear(); m.show();
}

function deactivate(m) { m.allOff(); }

function rExcite(e, deg) {
  if (deg < 0 || deg >= RES_N) return;
  if (e > rEnergy[deg]) rEnergy[deg] = e;
}

function update(m) {
  // ── MIDI in ──
  if (m.midiType === 1 && m.midiNote !== 255 && m.midiVel > 0) {
    var note = m.midiNote;
    var row  = Math.floor(note * RES_N / 128);
    if (row < 0) row = 0;
    if (row >= RES_N) row = RES_N - 1;
    var e    = Math.floor((m.midiVel / 127.0) * m.brightness);
    rExcite(e,                     row);
    rExcite(Math.floor(e * 0.70), (row + 7) % RES_N);
    rExcite(Math.floor(e * 0.55), (row + 4) % RES_N);
    rExcite(Math.floor(e * 0.40), (row + 3) % RES_N);
    rExcite(Math.floor(e * 0.28), (row + 9) % RES_N);
    m.noteMidi(note, m.midiVel, Math.floor(m.beatMs * 4.0));
  }

  // ── Idle: slow wave rolls across rows — clearly visible ──
  rIdlePhase += m.dt * 0.0012;
  rIdleBeat  += m.dt;
  if (rIdleBeat >= m.beatMs * 4) {
    rIdleBeat = 0;
    var peakRow = Math.floor(((Math.sin(rIdlePhase) + 1.0) * 0.5) * (RES_N - 1));
    m.note(peakRow, 22 + m.rnd(10), Math.floor(m.beatMs * 3.5));
  }

  // ── Decay: density=255 → slow, density=0 → fast ──
  var decayRate = 1 + Math.floor(((255 - m.density) / 255.0) * 7);
  var decayAmt  = Math.floor(decayRate * m.dt / 16);
  if (decayAmt < 1) decayAmt = 1;

  // ── Draw: one brightness per row, no inner calculations ──
  m.clear();
  for (var i = 0; i < RES_N; i++) {
    if (rEnergy[i] > decayAmt) rEnergy[i] -= decayAmt; else rEnergy[i] = 0;

    var row = RES_N - 1 - i;
    if (row < 0 || row >= m.ROWS) continue;

    // Idle glow: big rolling sine — clearly visible even without MIDI
    var idle = Math.floor(m.brightness * 0.28 *
               (0.5 + 0.5 * Math.sin(rIdlePhase - i * 0.52)));
    if (idle < 0) idle = 0;

    var br = rEnergy[i] + idle;
    if (br > m.brightness) br = m.brightness;
    if (br <= 0) continue;

    // Draw full row at this brightness (no per-pixel maths)
    for (var c = 0; c < m.COLS; c++) m.px(c, row, br);
  }

  m.show();
}

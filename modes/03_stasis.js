/**
 * @name Stasis
 * @author Thawney
 * @hue 170
 * @sat 220
 * @param_label Chord Spread
 * @description Sustained chords hang and slowly voice-lead. Density controls spread and voice count.
 * @sound Organ / Deep Pad
 */

var MAX_V = 4;
var SUSTAIN_BR = 50;

var degree  = [0, 0, 0, 0];
var note    = [0, 0, 0, 0];
var bright  = [0, 0, 0, 0];
var initialized = false;
var changeElapsed  = 0;
var changeInterval = 5000;
var MAX_CATCHUP_STEPS = 6;

function numVoices(density) {
  if (density < 64)  return 2;
  if (density < 128) return 3;
  return 4;
}

function voiceChangeInterval(density) {
  // C++ uses speed; use density as proxy: fast spread = faster changes
  var base = 4000 + (255 - density) * 60;  // density=0 -> 19s, density=255 -> 4s
  return base < 300 ? 300 : base;
}

function activate(m) {
  initialized = false;
  changeElapsed  = 0;
  changeInterval = 5000;
  for (var v = 0; v < MAX_V; v++) {
    degree[v] = v * 3;
    note[v]   = 0;
    bright[v] = 0;
  }
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function initChord(m) {
  var nv     = numVoices(m.density);
  var root   = Math.floor((m.density * 8) / 255);
  var spread = 1 + (m.density & 3);
  for (var v = 0; v < MAX_V; v++) {
    var deg = root + v * spread;
    if (deg > 13) deg = 13;
    degree[v] = deg;
  }
  for (var v = 0; v < nv; v++) {
    m.note(degree[v], 68, 30000);  // held; stolen by next voice-lead note
    bright[v] = m.brightness;
  }
  for (var v = nv; v < MAX_V; v++) bright[v] = 0;
}

function changeVoice(m) {
  var nv = numVoices(m.density);
  var v  = Math.floor(m.rnd(nv));
  var step = (m.rnd(255) < 128) ? 1 : -1;
  var nd = degree[v] + step;
  if (nd < 0) nd = 0;
  if (nd > 13) nd = 13;

  // Avoid duplicating a note another active voice has
  for (var i = 0; i < nv; i++) {
    if (i !== v && degree[i] === nd) return;
  }

  degree[v] = nd;
  m.note(nd, 65 + m.rnd(32), 30000);  // held
  bright[v] = m.brightness;
}

function update(m) {
  if (!initialized) {
    initChord(m);
    changeInterval = voiceChangeInterval(m.density);
    initialized = true;
  }

  changeElapsed += m.dt;
  var catchUps = 0;
  while (changeElapsed >= changeInterval && catchUps < MAX_CATCHUP_STEPS) {
    changeElapsed -= changeInterval;
    changeInterval = voiceChangeInterval(m.density);
    changeVoice(m);
    catchUps++;
  }
  if (catchUps === MAX_CATCHUP_STEPS && changeElapsed >= changeInterval) changeElapsed = changeInterval - 1;

  // Fade toward SUSTAIN_BR: (2*dt+8)/16
  var fadeAmt = Math.floor((2 * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;

  var nv = numVoices(m.density);
  for (var v = 0; v < nv; v++) {
    if (bright[v] > SUSTAIN_BR + fadeAmt) bright[v] -= fadeAmt;
    else if (bright[v] > SUSTAIN_BR)      bright[v] = SUSTAIN_BR;
  }

  // Draw: each voice = full column at degree*27/13
  m.clear();
  for (var v = 0; v < nv; v++) {
    if (bright[v] === 0) continue;
    var col = Math.floor((degree[v] * (m.COLS - 1)) / 6);
    for (var row = 0; row < m.ROWS; row++)
      m.px(col, row, bright[v]);
  }

  m.show();
}

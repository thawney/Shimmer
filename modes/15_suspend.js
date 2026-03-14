/**
 * @name Suspend
 * @author Thawney
 * @hue 75
 * @sat 210
 * @param_label Voice Count
 * @description Harold Budd-style: 2–3 sustained voices slowly voice-lead. Each voice has its own hue.
 * @sound Piano / Rhodes
 */

var VOICE_HUE    = [75, 160, 230];
var VOICE_ROW    = [];  // set in activate() — spread across full grid height
var VOICE_SAT    = 210;
var MAX_V        = 3;
var SUSTAIN_BRIGHT = 48;
var SUSP_DEG_MIN = 0;
var SUSP_DEG_MAX = 11;

var degree         = [0, 2, 4];
var bright         = [0, 0, 0];
var initialized    = false;
var changeElapsed  = 0;
var changeInterval = 5000;

function numVoices(density) {
  return (density >= 128) ? 3 : 2;
}

// voiceChangeInterval: C++ uses 4000+(240-bpm)*144; approximate from beatMs
// bpm ≈ 60000/beatMs
function voiceChangeInterval(beatMs) {
  var bpm = Math.floor(60000 / beatMs);
  var interval = 4000 + (240 - bpm) * 144;
  return interval < 500 ? 500 : interval;
}

function activate(m) {
  VOICE_ROW     = [0, Math.floor((m.ROWS - 1) / 2), m.ROWS - 1];
  initialized   = false;
  changeElapsed = 0;
  changeInterval = 5000;
  for (var v = 0; v < MAX_V; v++) {
    degree[v] = v * 2;  // {0, 2, 4}
    bright[v] = 0;
  }
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function initChord(m) {
  var nv = numVoices(m.density);
  var initDeg = [0, 2, 4];
  for (var v = 0; v < MAX_V; v++) {
    degree[v] = initDeg[v];
    if (v < nv) {
      m.note(degree[v], 72, 30000);  // held; stolen by next voice-lead note
      bright[v] = m.brightness;
    } else {
      bright[v] = 0;
    }
  }
}

function changeVoice(m) {
  var nv = numVoices(m.density);
  var v  = m.rnd(nv);

  var step = (m.rnd(255) < 128) ? 1 : -1;
  // Gentle pull toward centre of range
  if (degree[v] > Math.floor(SUSP_DEG_MAX / 2) && m.rnd(255) < 60) step = -1;
  if (degree[v] < Math.floor(SUSP_DEG_MAX / 2) && m.rnd(255) < 60) step =  1;

  var nd = degree[v] + step;
  if (nd < SUSP_DEG_MIN) nd = SUSP_DEG_MIN;
  if (nd > SUSP_DEG_MAX) nd = SUSP_DEG_MAX;

  // Avoid note already held by another active voice
  for (var i = 0; i < nv; i++) {
    if (i !== v && degree[i] === nd) return;
  }

  degree[v] = nd;
  bright[v] = m.brightness;
  m.note(nd, 72 + m.rnd(32), 30000);  // held
}

function update(m) {
  if (!initialized) {
    initChord(m);
    changeInterval = voiceChangeInterval(m.beatMs);
    initialized    = true;
  }

  var nextInterval = voiceChangeInterval(m.beatMs);
  if (changeInterval !== nextInterval) {
    if (changeInterval > 0)
      changeElapsed = Math.floor((changeElapsed * nextInterval) / changeInterval);
    changeInterval = nextInterval;
  }

  changeElapsed += m.dt;
  while (changeElapsed >= changeInterval) {
    changeElapsed -= changeInterval;
    changeInterval = voiceChangeInterval(m.beatMs);
    changeVoice(m);
  }

  // fadePerFrame = 1 + (density/85) = 1-3; density as proxy for speed
  var fadePerFrame = 1 + Math.floor(m.density / 85);
  var fadeAmt = Math.floor((fadePerFrame * m.dt + 8) / 16);
  if (fadeAmt < 1) fadeAmt = 1;

  var nv = numVoices(m.density);

  // Fade active voices toward SUSTAIN_BRIGHT
  for (var v = 0; v < nv; v++) {
    if (bright[v] > SUSTAIN_BRIGHT + fadeAmt) bright[v] -= fadeAmt;
    else if (bright[v] > SUSTAIN_BRIGHT)      bright[v] = SUSTAIN_BRIGHT;
  }

  // Draw: each active voice = full row of its unique hue
  // Clear all rows first
  for (var r = 0; r < m.ROWS; r++)
    for (var c = 0; c < m.COLS; c++)
      m.px(c, r, 0);

  for (var v = 0; v < MAX_V; v++) {
    var row = VOICE_ROW[v];
    var br  = (v < nv) ? bright[v] : 0;
    var h   = VOICE_HUE[v];

    if (br > 0) {
      for (var c = 0; c < m.COLS; c++)
        m.px(c, row, h, VOICE_SAT, br);
    }
  }

  m.show();
}

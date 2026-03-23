/**
 * @name Chord
 * @author Thawney
 * @hue 30
 * @sat 220
 * @param_label Velocity
 * @midi_in true
 * @description Learn a chord shape, shake to lock it, then play that shape from any incoming root note until release. Shake again to unlock.
 * @sound Pad / Organ
 */

var CH_MAX        = 5;
var chIsPlay      = 0;
var chLearnNote   = [0,0,0,0,0];
var chLearnCnt    = 0;
var chInterval    = [0,0,0,0,0];
var chIntervalCnt = 0;
var chPlayNote    = [0,0,0,0,0];
var chPlayCnt     = 0;
var chColBr       = [0,0,0,0,0,0,0,0,0,0,0,0];
var chShakePrev   = 0;
var chCooldown    = 0;
var chRootMidi    = -1;
var chUiMs        = 0;
var chFlashMs     = 0;
var CH_LEARN_HUE  = 145;
var CH_LOCK_HUE   = 18;
var CH_ROOT_HUE   = 34;
var CH_ACCENT_HUE = 190;

function chMidiToCol(note, cols) {
  var col = Math.round(note * (cols - 1) / 127.0);
  if (col < 0) col = 0;
  if (col >= cols) col = cols - 1;
  return col;
}

function chPulse(ms, speed) {
  return 0.5 + 0.5 * Math.sin(ms * speed);
}

function chReset(m) {
  chLearnCnt = 0;
  chIntervalCnt = 0;
  chRootMidi = -1;
  chPlayCnt = 0;
  for (var i = 0; i < CH_MAX; i++) {
    chLearnNote[i] = 0;
    chInterval[i] = 0;
    chPlayNote[i] = 0;
  }
  for (var c = 0; c < m.COLS; c++) chColBr[c] = 0;
}

function activate(m) {
  chIsPlay = 0;
  chShakePrev = 0;
  chCooldown = 0;
  chUiMs = 0;
  chFlashMs = 0;
  chReset(m);
  m.clear(); m.show();
}

function deactivate(m) { m.allOff(); }

function chSort() {
  for (var i = 1; i < chLearnCnt; i++) {
    var key = chLearnNote[i];
    var j   = i - 1;
    while (j >= 0 && chLearnNote[j] > key) {
      chLearnNote[j + 1] = chLearnNote[j];
      j--;
    }
    chLearnNote[j + 1] = key;
  }
}

function chLock() {
  if (chLearnCnt < 1) return;
  chSort();
  var root = chLearnNote[0];
  chIntervalCnt = chLearnCnt;
  for (var i = 0; i < chLearnCnt; i++) chInterval[i] = chLearnNote[i] - root;
  chIsPlay = 1;
}

function chStopChord(m) {
  for (var i = 0; i < chPlayCnt; i++) m.noteOff(chPlayNote[i]);
  chPlayCnt = 0;
}

function chFire(m, rootMidi) {
  if (chIntervalCnt < 1) return;
  var vel = Math.floor(60 + (m.density / 255.0) * 55);
  if (vel < 40)  vel = 40;
  if (vel > 120) vel = 120;
  chPlayCnt = 0;
  for (var i = 0; i < chIntervalCnt; i++) {
    var note = rootMidi + chInterval[i];
    if (note < 0)   note = 0;
    if (note > 127) note = 127;
    var noteVel = vel - i * 8;
    if (noteVel < 30) noteVel = 30;
    var dup = 0;
    for (var j = 0; j < chPlayCnt; j++) {
      if (chPlayNote[j] === note) { dup = 1; break; }
    }
    if (dup === 0) {
      chPlayNote[chPlayCnt] = note;
      chPlayCnt++;
      m.noteOn(note, noteVel);
    }
    var col = chMidiToCol(note, m.COLS);
    if (col >= 0 && col < m.COLS) {
      var br = m.brightness - i * 22;
      if (br < 20) br = 20;
      chColBr[col] = br;
    }
  }
}

function update(m) {
  chUiMs += m.dt;
  if (chUiMs > 60000) chUiMs -= 60000;

  if (chCooldown > 0) {
    chCooldown -= m.dt;
    if (chCooldown < 0) chCooldown = 0;
  }
  if (chFlashMs > 0) {
    chFlashMs -= m.dt;
    if (chFlashMs < 0) chFlashMs = 0;
  }

  if (m.motion > 150 && chShakePrev <= 150 && chCooldown <= 0) {
    chCooldown = 600;
    chFlashMs = 900;
    if (chIsPlay === 0) {
      chLock();
    } else {
      m.allOff();
      chIsPlay = 0;
      chReset(m);
    }
  }
  chShakePrev = m.motion;

  var isNoteOff = (m.midiType === 2) ||
                  (m.midiType === 1 && m.midiNote !== 255 && m.midiVel === 0);
  if (isNoteOff && m.midiNote !== 255) {
    if (chIsPlay === 0) {
      m.noteOff(m.midiNote);
    } else if (chRootMidi !== -1 && m.midiNote === chRootMidi) {
      chStopChord(m);
      chRootMidi = -1;
    }
  }

  if (m.midiType === 1 && m.midiNote !== 255 && m.midiVel > 0) {
    var inNote = m.midiNote;

    if (chIsPlay === 0) {
      var found = 0;
      for (var i = 0; i < chLearnCnt; i++) {
        if (chLearnNote[i] === inNote) { found = 1; break; }
      }
      if (found === 0 && chLearnCnt < CH_MAX) {
        chLearnNote[chLearnCnt] = inNote;
        chLearnCnt++;
      }
      m.noteOn(inNote, m.midiVel);
      var lc = chMidiToCol(inNote, m.COLS);
      if (lc >= 0 && lc < m.COLS) chColBr[lc] = m.brightness;

    } else {
      if (chRootMidi !== -1) chStopChord(m);
      chRootMidi = inNote;
      chFire(m, inNote);
    }
  }

  if (chRootMidi === -1) {
    var fd = Math.floor((3 * m.dt + 8) / 16);
    if (fd < 1) fd = 1;
    for (var c = 0; c < m.COLS; c++) {
      if (chColBr[c] > fd) chColBr[c] -= fd; else chColBr[c] = 0;
    }
  }

  m.clear();

  var fillHue = (chIsPlay === 0) ? CH_LEARN_HUE : CH_LOCK_HUE;
  var fillSat = (chIsPlay === 0) ? 205 : 235;
  var bodyTop = 1;
  var bodyBottom = m.ROWS - 2;
  var bodyMid = Math.floor((bodyTop + bodyBottom) / 2);
  for (var c = 0; c < m.COLS; c++)
    if (chColBr[c] > 0)
      for (var r = bodyTop; r <= bodyBottom; r++) {
        var dist = r - bodyMid;
        if (dist < 0) dist = -dist;
        var bodyBr = chColBr[c] - dist * 13;
        if (bodyBr > 0) {
          m.px(c, r, fillHue, fillSat, bodyBr);
          if (c > 0) m.px(c - 1, r, fillHue, fillSat - 28, bodyBr - 42);
          if (c + 1 < m.COLS) m.px(c + 1, r, fillHue, fillSat - 28, bodyBr - 42);
          if (c > 1) m.px(c - 2, r, fillHue, fillSat - 60, bodyBr - 82);
          if (c + 2 < m.COLS) m.px(c + 2, r, fillHue, fillSat - 60, bodyBr - 82);
        }
      }

  var pulseSlow = chPulse(chUiMs, 0.006);
  var pulseFast = chPulse(chUiMs, 0.012);
  var flashAmt  = chFlashMs > 0 ? (chFlashMs / 900.0) : 0;
  var midCol    = Math.floor(m.COLS / 2);

  if (chIsPlay === 0) {
    var march = Math.floor(chUiMs / 160);
    var learnHi = Math.floor(m.brightness * (0.24 + 0.18 * pulseSlow + 0.20 * flashAmt));
    var learnLo = Math.floor(m.brightness * 0.05);
    for (var c = 0; c < m.COLS; c++) {
      var topBr = (((c + march) % 3) === 0) ? learnHi : learnLo;
      var topHue = (((c + march) % 3) === 0) ? CH_LEARN_HUE : CH_ACCENT_HUE;
      m.px(c, 0, topHue, 210, topBr);
    }
    if (m.ROWS > 2) m.px(midCol, 1, CH_LEARN_HUE, 210, Math.floor(m.brightness * (0.10 + 0.10 * pulseSlow)));
  } else {
    var lockTop = Math.floor(m.brightness * (0.52 + 0.22 * pulseSlow + 0.20 * flashAmt));
    var lockMid = Math.floor(m.brightness * (0.30 + 0.20 * pulseFast));
    for (var c = 0; c < m.COLS; c++) {
      var lockHue = (c === midCol) ? CH_ROOT_HUE : CH_LOCK_HUE;
      m.px(c, 0, lockHue, 235, lockTop);
    }
    if (m.ROWS > 1) {
      if (midCol > 0) m.px(midCol - 1, 1, CH_ROOT_HUE, 210, lockMid);
      m.px(midCol, 1, CH_ROOT_HUE, 230, lockTop);
      if (midCol + 1 < m.COLS) m.px(midCol + 1, 1, CH_ROOT_HUE, 210, lockMid);
    }
    if (m.ROWS > 2) {
      if (midCol > 0) m.px(midCol - 1, 2, CH_ROOT_HUE, 210, lockMid);
      m.px(midCol, 2, CH_ROOT_HUE, 220, Math.floor(m.brightness * (0.22 + 0.14 * pulseSlow)));
      if (midCol + 1 < m.COLS) m.px(midCol + 1, 2, CH_ROOT_HUE, 210, lockMid);
    }
  }

  var bottomBase = (chIsPlay === 0)
    ? Math.floor(m.brightness * 0.10)
    : Math.floor(m.brightness * (0.16 + 0.05 * pulseSlow));
  for (var c = 0; c < m.COLS; c++) {
    var railHue = (chIsPlay === 0) ? CH_ACCENT_HUE : CH_LOCK_HUE;
    var railSat = (chIsPlay === 0) ? 140 : 185;
    m.px(c, m.ROWS - 1, railHue, railSat, bottomBase);
  }

  if (chIsPlay === 0) {
    for (var i = 0; i < chLearnCnt; i++) {
      var col = chMidiToCol(chLearnNote[i], m.COLS);
      if (col >= 0 && col < m.COLS) m.px(col, m.ROWS - 1, CH_LEARN_HUE, 225, m.brightness);
    }
  } else {
    for (var i = 0; i < chIntervalCnt; i++) {
      var lockCol = chMidiToCol(chLearnNote[i], m.COLS);
      if (lockCol >= 0 && lockCol < m.COLS) {
        var holdBr = (i === 0)
          ? m.brightness
          : Math.floor(m.brightness * (0.58 + 0.18 * pulseFast));
        var holdHue = (i === 0) ? CH_ROOT_HUE : CH_LOCK_HUE;
        var holdSat = (i === 0) ? 235 : 210;
        m.px(lockCol, m.ROWS - 1, holdHue, holdSat, holdBr);
      }
    }
  }

  if (chIsPlay === 1 && chRootMidi !== -1 && m.ROWS > 2) {
    var rootCol = chMidiToCol(chRootMidi, m.COLS);
    var rootBr  = Math.floor(m.brightness * (0.55 + 0.25 * pulseFast));
    if (rootCol >= 0 && rootCol < m.COLS) {
      if (bodyTop <= bodyBottom) m.px(rootCol, bodyMid, CH_ROOT_HUE, 235, rootBr);
      m.px(rootCol, 1, CH_ROOT_HUE, 235, rootBr);
      if (m.ROWS > 3) m.px(rootCol, m.ROWS - 2, CH_ROOT_HUE, 235, rootBr);
    }
  }

  m.show();
}

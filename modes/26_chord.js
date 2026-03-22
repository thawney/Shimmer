/**
 * @name Chord
 * @author Thawney
 * @hue 30
 * @sat 220
 * @param_label Velocity
 * @midi_in true
 * @description Build a chord shape by playing notes in learn mode — each one sounds as you add it. Shake to lock the shape. Every new note sets the root and fires the full chord with exact semitone intervals, held until you release. Shake again to reset.
 * @sound Pad / Organ
 */

// Pre-allocated arrays — never reassign in Duktape
var CH_MAX        = 5;
var chIsPlay      = 0;           // 0=learn, 1=play
var chLearnNote   = [0,0,0,0,0]; // absolute MIDI notes collected in learn mode
var chLearnCnt    = 0;
var chInterval    = [0,0,0,0,0]; // locked semitone intervals from root
var chIntervalCnt = 0;
var chColBr       = [0,0,0,0,0,0,0,0,0,0,0,0];
var chShakePrev   = 0;
var chCooldown    = 0;
var chRootMidi    = -1;          // MIDI note number of held root (-1 = nothing held)
var chRetrigMs    = 0;
var CH_TAIL_MS    = 1400;
var CH_RETRIG_MS  = 900;

function chMidiToCol(note, cols) {
  var col = Math.round(note * (cols - 1) / 127.0);
  if (col < 0) col = 0;
  if (col >= cols) col = cols - 1;
  return col;
}

function activate(m) {
  chIsPlay      = 0;
  chLearnCnt    = 0;
  chIntervalCnt = 0;
  chShakePrev   = 0;
  chCooldown    = 0;
  chRootMidi    = -1;
  chRetrigMs    = 0;
  for (var i = 0; i < CH_MAX; i++) { chLearnNote[i] = 0; chInterval[i] = 0; }
  for (var c = 0; c < m.COLS; c++) chColBr[c] = 0;
  m.clear(); m.show();
}

function deactivate(m) { m.allOff(); }

// Sort chLearnNote[0..chLearnCnt-1] ascending in-place (insertion sort)
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

// Lock: sort learned notes, compute semitone intervals from lowest note
function chLock() {
  if (chLearnCnt < 1) return;
  chSort();
  var root      = chLearnNote[0];
  chIntervalCnt = chLearnCnt;
  for (var i = 0; i < chLearnCnt; i++) {
    chInterval[i] = chLearnNote[i] - root;
  }
  chIsPlay = 1;
}

// Fire chord with a finite tail; while the root is held we refresh before the
// previous notes expire, and on release we simply stop refreshing.
function chFire(m, rootMidi) {
  if (chIntervalCnt < 1) return;
  var vel = Math.floor(60 + (m.density / 255.0) * 55);  // density = velocity 60-115
  if (vel < 40)  vel = 40;
  if (vel > 120) vel = 120;
  for (var i = 0; i < chIntervalCnt; i++) {
    var note = rootMidi + chInterval[i];
    if (note < 0)   note = 0;
    if (note > 127) note = 127;
    var noteVel = vel - i * 8;
    if (noteVel < 30) noteVel = 30;
    m.noteMidi(note, noteVel, CH_TAIL_MS);
    var col = chMidiToCol(note, m.COLS);
    if (col >= 0 && col < m.COLS) {
      var br = m.brightness - i * 22;
      if (br < 20) br = 20;
      chColBr[col] = br;
    }
  }
}

function update(m) {

  // ── Cooldown timer ───────────────────────────────────────────────────
  if (chCooldown > 0) {
    chCooldown -= m.dt;
    if (chCooldown < 0) chCooldown = 0;
  }

  // ── Shake: toggle learn / play ───────────────────────────────────────
  if (m.motion > 150 && chShakePrev <= 150 && chCooldown <= 0) {
    chCooldown = 600;
    if (chIsPlay === 0) {
      chLock();                              // learn → play
    } else {
      m.allOff();                            // play → learn: cut all notes
      chIsPlay      = 0;
      chLearnCnt    = 0;
      chIntervalCnt = 0;
      chRootMidi    = -1;
      chRetrigMs    = 0;
      for (var i = 0; i < CH_MAX; i++) { chLearnNote[i] = 0; chInterval[i] = 0; }
      for (var c = 0; c < m.COLS; c++) chColBr[c] = 0;
    }
  }
  chShakePrev = m.motion;

  // ── Note-off: release chord when root key is lifted ──────────────────
  // Handle both true noteOff (type 2) and noteOn-with-vel-0 (some keyboards)
  var isNoteOff = (m.midiType === 2) ||
                  (m.midiType === 1 && m.midiNote !== 255 && m.midiVel === 0);
  if (isNoteOff && m.midiNote !== 255 && chRootMidi !== -1 && m.midiNote === chRootMidi) {
    chRootMidi = -1;
    chRetrigMs = 0;
  }

  // ── Note-on ──────────────────────────────────────────────────────────
  if (m.midiType === 1 && m.midiNote !== 255 && m.midiVel > 0) {
    var inNote = m.midiNote;

    if (chIsPlay === 0) {
      // Learn mode: collect note if new, always play it immediately
      var found = 0;
      for (var i = 0; i < chLearnCnt; i++) {
        if (chLearnNote[i] === inNote) { found = 1; break; }
      }
      if (found === 0 && chLearnCnt < CH_MAX) {
        chLearnNote[chLearnCnt] = inNote;
        chLearnCnt++;
      }
      m.noteMidi(inNote, m.midiVel, Math.floor(m.beatMs * 2.5));
      var lc = chMidiToCol(inNote, m.COLS);
      if (lc >= 0 && lc < m.COLS) chColBr[lc] = m.brightness;

    } else {
      // Play mode: cut any previous chord, fire new one held on this root
      if (chRootMidi !== -1) m.allOff();
      chRootMidi = inNote;
      chRetrigMs = CH_RETRIG_MS;
      chFire(m, inNote);
    }
  }

  if (chIsPlay === 1 && chRootMidi !== -1) {
    chRetrigMs -= m.dt;
    if (chRetrigMs <= 0) {
      chRetrigMs += CH_RETRIG_MS;
      chFire(m, chRootMidi);
    }
  }

  // ── Fade columns (freeze while chord is held, fade after release) ─────
  if (chRootMidi === -1) {
    var fd = Math.floor((3 * m.dt + 8) / 16);
    if (fd < 1) fd = 1;
    for (var c = 0; c < m.COLS; c++) {
      if (chColBr[c] > fd) chColBr[c] -= fd; else chColBr[c] = 0;
    }
  }

  m.clear();

  // Top row: mode indicator — dim = learn, bright = play
  var barBr = (chIsPlay === 0) ? Math.floor(m.brightness * 0.10)
                                : Math.floor(m.brightness * 0.50);
  for (var c = 0; c < m.COLS; c++) m.px(c, 0, barBr);

  // Column flashes (rows 1 to ROWS-1)
  for (var c = 0; c < m.COLS; c++)
    if (chColBr[c] > 0)
      for (var r = 1; r < m.ROWS; r++) m.px(c, r, chColBr[c]);

  // Learn mode: persistent dots on bottom row for each collected note
  if (chIsPlay === 0) {
    for (var i = 0; i < chLearnCnt; i++) {
      var col = chMidiToCol(chLearnNote[i], m.COLS);
      if (col >= 0 && col < m.COLS) m.px(col, m.ROWS - 1, m.brightness);
    }
  }

  m.show();
}

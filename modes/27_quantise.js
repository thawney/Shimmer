/**
 * @name Quantise
 * @author Thawney
 * @hue 160
 * @sat 180
 * @param_label Transpose
 * @midi_in true
 * @description Scale pitch quantiser. Incoming MIDI notes snap to the nearest note in the active scale across the full keyboard, with proper note-off handling. Density shifts the output up by up to a 7th. Top half shows input pitch; bottom half shows quantised output.
 * @sound Any
 */

// Pre-allocated arrays — never reassign in Duktape
var qzColIn  = [0,0,0,0,0,0,0,0,0,0,0,0];
var qzColOut = [0,0,0,0,0,0,0,0,0,0,0,0];
var qzHeldInToOut = [];
var qzOutRef      = [];
var QZ_MASKS      = [
  0xAB5, // major
  0x5AD, // minor
  0x6AD, // dorian
  0x295, // pentatonic
  0xFFF, // chromatic
  0x6B5, // mixolydian
  0xAD5, // lydian
  0x5AB, // phrygian
  0x9AD, // harmonic minor
  0x555  // whole tone
];

function qzMaskFor(scaleId) {
  return QZ_MASKS[scaleId] != null ? QZ_MASKS[scaleId] : QZ_MASKS[3];
}

function qzInScale(note, rootPc, mask) {
  var rel = (note - rootPc) % 12;
  if (rel < 0) rel += 12;
  return (mask & (1 << rel)) !== 0;
}

function qzNearestInScale(note, rootPc, mask) {
  if (qzInScale(note, rootPc, mask)) return note;
  for (var dist = 1; dist < 128; dist++) {
    var down = note - dist;
    if (down >= 0 && qzInScale(down, rootPc, mask)) return down;
    var up = note + dist;
    if (up <= 127 && qzInScale(up, rootPc, mask)) return up;
  }
  return note;
}

function qzTransposeSteps(note, steps, rootPc, mask) {
  var out = note;
  while (steps > 0 && out < 127) {
    out++;
    while (out < 127 && !qzInScale(out, rootPc, mask)) out++;
    steps--;
  }
  if (out > 127) out = 127;
  return out;
}

function qzNoteToCol(note, cols) {
  var col = Math.round(note * (cols - 1) / 127.0);
  if (col < 0) col = 0;
  if (col >= cols) col = cols - 1;
  return col;
}

function activate(m) {
  var i;
  for (var c = 0; c < m.COLS; c++) { qzColIn[c] = 0; qzColOut[c] = 0; }
  qzHeldInToOut = [];
  qzOutRef = [];
  for (i = 0; i < 128; i++) { qzHeldInToOut[i] = -1; qzOutRef[i] = 0; }
  m.clear(); m.show();
}

function deactivate(m) { m.allOff(); }

function update(m) {
  var isNoteOn  = m.midiType === 1 && m.midiNote !== 255 && m.midiVel > 0;
  var isNoteOff = m.midiType === 2 && m.midiNote !== 255;

  if (isNoteOn || isNoteOff) {
    var inNote = m.midiNote;
    var rootPc = m.rootNote % 12;
    var mask   = qzMaskFor(m.scale);
    var inCol  = qzNoteToCol(inNote, m.COLS);

    qzColIn[inCol] = Math.floor(m.brightness * 0.35);

    if (isNoteOn) {
      var prevOut = qzHeldInToOut[inNote];
      if (prevOut >= 0) {
        qzOutRef[prevOut]--;
        if (qzOutRef[prevOut] <= 0) {
          qzOutRef[prevOut] = 0;
          m.noteOff(prevOut);
        }
      }

      var transpose = Math.floor((m.density / 255.0) * 7);
      var outNote   = qzNearestInScale(inNote, rootPc, mask);
      outNote       = qzTransposeSteps(outNote, transpose, rootPc, mask);
      qzHeldInToOut[inNote] = outNote;

      if (qzOutRef[outNote] === 0) m.noteOn(outNote, m.midiVel);
      qzOutRef[outNote]++;

      qzColOut[qzNoteToCol(outNote, m.COLS)] = m.brightness;
    } else {
      var heldOut = qzHeldInToOut[inNote];
      if (heldOut >= 0) {
        qzHeldInToOut[inNote] = -1;
        qzOutRef[heldOut]--;
        if (qzOutRef[heldOut] <= 0) {
          qzOutRef[heldOut] = 0;
          m.noteOff(heldOut);
        }
        qzColOut[qzNoteToCol(heldOut, m.COLS)] = Math.floor(m.brightness * 0.6);
      }
    }
  }

  // Fade
  var fd = Math.floor((3 * m.dt + 8) / 16);
  if (fd < 1) fd = 1;
  for (var c = 0; c < m.COLS; c++) {
    if (qzColIn[c]  > fd) qzColIn[c]  -= fd; else qzColIn[c]  = 0;
    if (qzColOut[c] > fd) qzColOut[c] -= fd; else qzColOut[c] = 0;
  }

  m.clear();
  var splitRow = Math.floor(m.ROWS / 2);

  // Top half: raw input pitch position (dim)
  for (var c = 0; c < m.COLS; c++)
    if (qzColIn[c] > 0)
      for (var r = 0; r < splitRow; r++) m.px(c, r, qzColIn[c]);

  // Divider
  for (var c = 0; c < m.COLS; c++)
    m.px(c, splitRow, Math.floor(m.brightness * 0.07));

  // Bottom half: quantised output (bright)
  for (var c = 0; c < m.COLS; c++)
    if (qzColOut[c] > 0)
      for (var r = splitRow + 1; r < m.ROWS; r++) m.px(c, r, qzColOut[c]);

  m.show();
}

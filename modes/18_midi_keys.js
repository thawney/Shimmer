/**
 * @name MIDI Keys
 * @author Thawney
 * @hue 0
 * @sat 255
 * @param_label Fade Speed
 * @description Visual MIDI monitor. Each column is one chromatic semitone (C to B). Incoming notes light the column from the bottom; brightness = velocity. Hue sweeps chromatically — C is red, stepping around the wheel. Works with any MIDI keyboard or sequencer on the DIN IN jack.
 * @midi_in true
 * @sound None — visual only
 */

// col 0=C  1=C#  2=D  3=D#  4=E  5=F  6=F#  7=G  8=G#  9=A  10=A#  11=B
var HUE_STEP = 21;   // 256/12 ≈ 21.3 → evenly-spaced hues around the wheel

var held = [];       // held[col] = current brightness 0..255

function activate(m) {
  held = [];
  for (var i = 0; i < m.COLS; i++) held[i] = 0;
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  if (m.midiType === 1) {                          // NoteOn
    var col = m.midiNote % m.COLS;
    held[col] = Math.floor(50 + m.midiVel * 205 / 127);   // 50..255
  } else if (m.midiType === 2) {                   // NoteOff — gentle duck
    var col2 = m.midiNote % m.COLS;
    held[col2] = Math.floor(held[col2] / 2);
  }

  // Fade speed driven by density slider
  var fadePerFrame = 1 + Math.floor(m.density / 64);
  var fadeAmt = Math.max(1, Math.floor((fadePerFrame * m.dt + 8) / 16));

  m.clear();
  for (var c = 0; c < m.COLS; c++) {
    if (held[c] > fadeAmt) held[c] -= fadeAmt;
    else held[c] = 0;

    if (held[c] > 0) {
      var hue    = (c * HUE_STEP) & 0xFF;
      var height = Math.max(1, Math.floor(held[c] * m.ROWS / 255));
      for (var r = 0; r < height; r++) {
        // Brightest at the top of the bar, dims toward bottom
        var bv = Math.floor(held[c] * (r + 1) / height);
        m.px(c, m.ROWS - 1 - r, hue, 230, bv);
      }
    }
  }

  m.show();
}

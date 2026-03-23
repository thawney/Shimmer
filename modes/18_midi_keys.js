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

var MK_HUE_STEP = 21;
var MK_BLACK    = [0,1,0,1,0,0,1,0,1,0,1,0];
var held        = [0,0,0,0,0,0,0,0,0,0,0,0];
var peak        = [0,0,0,0,0,0,0,0,0,0,0,0];

function activate(m) {
  for (var i = 0; i < m.COLS; i++) {
    held[i] = 0;
    peak[i] = 0;
  }
  m.clear();
  m.show();
}

function deactivate(m) {
  m.allOff();
}

function update(m) {
  if (m.midiType === 1 && m.midiNote !== 255 && m.midiVel > 0) {
    var onCol = m.midiNote % m.COLS;
    held[onCol] = Math.floor(50 + m.midiVel * 205 / 127);
    peak[onCol] = m.brightness;
  } else if (m.midiType === 2 && m.midiNote !== 255) {
    var offCol = m.midiNote % m.COLS;
    held[offCol] = Math.floor(held[offCol] * 0.55);
  }

  var fadeAmt = Math.max(1, Math.floor(((1 + Math.floor(m.density / 64)) * m.dt + 8) / 16));
  var peakFade = fadeAmt * 2;
  var bodyBottom = m.ROWS - 3;

  m.clear();
  for (var c = 0; c < m.COLS; c++) {
    if (held[c] > fadeAmt) held[c] -= fadeAmt; else held[c] = 0;
    if (peak[c] > peakFade) peak[c] -= peakFade; else peak[c] = 0;

    var hue = (c * MK_HUE_STEP) & 0xFF;

    if (held[c] > 0) {
      var height = 1 + Math.floor(held[c] * (bodyBottom + 1) / 255);
      for (var i = 0; i < height; i++) {
        var r = bodyBottom - i;
        var br = held[c] - Math.floor(i * held[c] / (height + 1));
        if (br > 0) {
          m.px(c, r, hue, 225, br);
          if (br > 84) {
            if (c > 0) m.px(c - 1, r, hue, 150, br - 70);
            if (c + 1 < m.COLS) m.px(c + 1, r, hue, 150, br - 70);
          }
        }
      }
      var crownRow = bodyBottom - height + 1;
      if (crownRow < 0) crownRow = 0;
      m.px(c, crownRow, hue, 160, peak[c]);
    }

    if (MK_BLACK[c]) {
      m.px(c, m.ROWS - 2, 180, 120, 34);
      m.px(c, m.ROWS - 1, 0, 0, 10);
    } else {
      m.px(c, m.ROWS - 2, 32, 45, 22);
      m.px(c, m.ROWS - 1, 28, 18, 52);
    }

    if (held[c] > 0 || peak[c] > 0) {
      var keyBr = held[c] > peak[c] ? held[c] : peak[c];
      if (MK_BLACK[c]) {
        m.px(c, m.ROWS - 2, hue, 220, keyBr);
      } else {
        m.px(c, m.ROWS - 2, hue, 170, Math.floor(keyBr * 0.65));
        m.px(c, m.ROWS - 1, hue, 235, keyBr);
      }
    }
  }

  m.show();
}

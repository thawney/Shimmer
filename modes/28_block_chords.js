/**
 * @name Block Chords
 * @author Thawney
 * @hue 28
 * @sat 170
 * @param_label Voicing
 * @description Slow Minecrafty chords using the global scale. Tempo controls timing; density changes voicing.
 * @sound Soft warm block chords
 */

var chordIdx = 0;
var glow = 0;
var drift = 0;

// scale degrees, follows global/internal scale
var progression = [
  [0, 2, 4],
  [5, 7, 9],
  [3, 5, 7],
  [4, 6, 8],
  [0, 2, 4],
  [7, 9, 11],
  [5, 7, 9],
  [4, 6, 8]
];

function activate(m) {
  chordIdx = 0;
  glow = 0;
  drift = 0;
  m.clear();
  m.show();
}

function blockTempOffset(m) {
  var t = m.temp;
  if (!(t > -20 && t < 70)) t = 22.0;
  return Math.floor((t - 22.0) / 10.0);
}

function blockHumidity(m) {
  var h = m.humidity;
  if (!(h >= 0 && h <= 100)) h = 55.0;
  return h / 100.0;
}

function playChord(m, chord, voicing, dur, offset) {
  var root = chord[0] + offset;
  var third = chord[1] + offset;
  var fifth = chord[2] + offset;

  if (voicing === 0) {
    // compact and warm
    m.note(root - 7, 78, dur);
    m.note(third, 50, dur);
    m.note(fifth + 7, 38, dur);
  } else if (voicing === 1) {
    // open but still connected
    m.note(root - 7, 78, dur);
    m.note(third + 7, 46, dur);
    m.note(fifth + 14, 34, dur);
  } else {
    // airy, but less extreme than before
    m.note(root - 7, 74, dur);
    m.note(fifth + 7, 42, dur);
    m.note(third + 14, 32, dur);
  }
}

function playSoftTop(m, chord, voicing, dur, offset) {
  var top;

  if (voicing === 0) {
    top = chord[2] + 7 + offset;
  } else if (voicing === 1) {
    top = chord[2] + 14 + offset;
  } else {
    top = chord[1] + 14 + offset;
  }

  m.note(top, 20, dur);
}

function update(m) {
  var beatMs = Math.max(80, Math.min(4000, m.beatMs));
  var damp = blockHumidity(m);
  var tempOffset = blockTempOffset(m);

  // very slow chord movement
  var chordMs = beatMs * 8;

  // occasional soft reinforcement, not a separate melody
  var topMs = beatMs * 4;

  var voicing = Math.min(2, Math.floor(m.density / 86));

  if (m.tick(0, chordMs)) {
    playChord(m, progression[chordIdx], voicing, Math.floor(chordMs * (0.86 + damp * 0.22)), tempOffset);
    glow = 255;
    chordIdx = (chordIdx + 1) % progression.length;
  }

  // only reinforce the current chord softly in between
  if (m.tick(1, topMs)) {
    playSoftTop(m, progression[chordIdx], voicing, Math.floor(topMs * (0.55 + damp * 0.25)), tempOffset);
  }

  if (m.tick(2, beatMs)) {
    drift = (drift + 1) % 12;
  }

  glow -= 4;
  if (glow < 0) glow = 0;

  m.clear();

  for (var x = 0; x < m.COLS; x++) {
    for (var y = 0; y < m.ROWS; y++) {
      var dx = x - 5.5;
      var dy = y - 5.5;
      var dist = Math.sqrt(dx * dx + dy * dy);

      var base = 88 - dist * 9;
      var wave = ((x + drift) % 6) * 4 + ((y + drift) % 5) * 2;
      var pulse = glow * 0.16;
      var v = base + wave + pulse;

      if (y < 3) v += 8;
      if (v < 0) v = 0;
      if (v > m.brightness) v = m.brightness;

      var hue = 18 + ((x + y) % 5) * 3;
      var sat = 120 + (y % 4) * 16;

      m.px(x, y, hue, sat, Math.floor(v));
    }
  }

  m.show();
}
